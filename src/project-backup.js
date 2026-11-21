const backupKind='meridian-project-backup',restoreMarker='meridian-restore-pending/',archivePrefix='meridian-restored-history/';
let backupPending=null,backupBusy=false;
function familyRounds(p,projects=db.projects){
  const ids=new Set([p.id]);let before;
  do{
    before=ids.size;
    for(const x of projects){if(ids.has(x.id)&&x.parent)ids.add(x.parent);if(x.parent&&ids.has(x.parent))ids.add(x.id);}
  }while(before!==ids.size);
  return projects.filter(x=>ids.has(x.id)).sort((a,b)=>a.round-b.round);
}
async function makeBackup(p){
  const rounds=familyRounds(p);
  for(const q of rounds){if(mcpAccess?.projectId===q.id)await diagSyncInbound(q.id);await diagEnsure(q.id,true);}
  await diagQueue;
  const used=new Set();
  const entries=rounds.map(q=>{
    const runs=agentRunsFor(q.id);
    for(const r of runs){if(r.pick)used.add(r.pick);for(const s of r.steps)used.add(s.name);}
    const journal=diagViewState(q.id);
    return {project:clone(q),memory:clone(agentRecords.get('memory/'+q.id)||null),runs:clone(runs),
      journal:{sum:clone(journal.sum),rows:clone(journal.rows)},recordBodies:diagBodies(q.id)};
  });
  const skills=agentLibrary().filter(s=>s.custom&&used.has(s.name)).map(({name,description,body,enabled})=>({name,description,body,enabled}));
  return {format:backupKind,version:1,created:new Date().toISOString(),active:p.id,rounds:entries,skills};
}
function backupAssert(test,message){if(!test)throw Error('备份内容无效。'+message);}
const backupObject=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const backupId=s=>typeof s==='string'&&/^[a-zA-Z0-9._/-]{1,180}$/.test(s)&&!['__proto__','constructor','prototype'].includes(s);
function backupArray(value,test,label){backupAssert(Array.isArray(value)&&value.every(test),label);}
function backupUnique(list,key,label){backupAssert(new Set(list.map(key)).size===list.length,label);}
function checkBackupBrief(b){
  backupAssert(backupObject(b),'缺少 Brief。');
  for(const k of Object.keys(EMPTY_BRIEF)){
    if(k==='markets')backupArray(b[k],v=>Object.hasOwn(MARKETS,v),'市场格式有误。');
    else if(k==='platforms')backupArray(b[k],v=>Object.hasOwn(PROFILE,v),'渠道格式有误。');
    else backupAssert(typeof b[k]==='string'||b[k]===undefined,'Brief 字段应为文字。');
  }
  const result={...b};
  for(const [k,v] of Object.entries(EMPTY_BRIEF))if(!Object.hasOwn(result,k))result[k]=clone(v);
  return result;
}
function checkBackupCard(c,b){
  backupAssert(backupObject(c)&&Object.hasOwn(MARKETS,c.market)&&Object.hasOwn(PROFILE,c.platform)&&Object.hasOwn(DIRECTIONS,c.direction),'创意的市场或渠道无效。');
  checkedCard(c,b,c.market,c.platform,c.direction);
  backupAssert(c.id===keyOf(c.market,c.platform,c.direction)&&Number.isInteger(c.revision)&&c.revision>0,'创意版本无效。');
  if(c.semantic)checkedSemantic(c.semantic);
  if(c.approval)backupAssert(typeof c.approval.by==='string'&&Number.isInteger(c.approval.revision),'审核记录无效。');
  return true;
}
function checkBackupAssets(assets){
  backupArray(assets,a=>backupObject(a)&&backupId(a.id)&&typeof a.name==='string'&&
    (typeof a.text==='string'||typeof a.image==='string'&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(a.image))&&
    (!a.image||/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(a.image)),'参考素材无效。');
}
function checkBackupBudget(b){
  if(!b)return;
  backupAssert(backupObject(b)&&(b.limit===null||Number.isSafeInteger(b.limit)&&b.limit>0)&&
    [b.reported,b.held,...(b.pending?[b.pending.amount]:[])].every(n=>Number.isSafeInteger(n)&&n>=0),'任务预算无效。');
}
function checkBackupEval(book,p){
  if(!book)return;
  backupAssert(Array.isArray(book.suites)&&book.suites.length&&Array.isArray(book.runs),'评测集无效。');
  backupUnique(book.suites,s=>s.id,'评测集版本重复。');
  for(const s of book.suites){
    backupAssert(backupId(s.id)&&Number.isSafeInteger(s.version)&&s.rubric===qualityRubric&&Array.isArray(s.cases)&&s.cases.length,'评测集版本无效。');
    backupUnique(s.cases,c=>c.id,'评测案例重复。');
    for(const c of s.cases){
      backupAssert(backupId(c.id)&&typeof c.name==='string'&&Object.hasOwn(MARKETS,c.market)&&Object.hasOwn(PROFILE,c.platform)&&Object.hasOwn(DIRECTIONS,c.direction),'评测案例格式无效。');
      c.brief=checkBackupBrief(c.brief);checkBackupAssets(c.assets);backupArray(c.checks,v=>typeof v==='string','审阅要点无效。');
    }
  }
  for(const r of book.runs){
    const suite=book.suites.find(s=>s.id===r.suiteId);
    backupAssert(backupId(r.id)&&r.pid===p.id&&r.kind==='evaluation'&&suite&&Array.isArray(r.items)&&typeof r.name==='string'&&typeof r.signature==='string','评测记录无效。');
    checkBackupBudget(r.budget);backupUnique(r.items,i=>i.caseId,'评测项重复。');
    backupAssert(r.items.length===suite.cases.length,'评测项数目不符。');
    for(const i of r.items){
      const c=suite.cases.find(x=>x.id===i.caseId);
      backupAssert(c&&['pending','running','paused','failed','done'].includes(i.status),'评测项状态无效。');
      if(i.status==='done')checkBackupCard(i.card,c.brief);
      if(i.issues)backupArray(i.issues,x=>backupObject(x)&&FIELD_PATHS.includes(x.path)&&typeof x.reason==='string','评测提示无效。');
      if(i.rules!==undefined)backupAssert(backupObject(i.rules)&&typeof i.rules.facts==='boolean'&&typeof i.rules.brand==='boolean','自动评分无效。');
      if(i.review)backupAssert(['pass','revise'].includes(i.review.facts)&&['pass','revise'].includes(i.review.decision)&&Number.isInteger(i.review.tone)&&i.review.tone>=1&&i.review.tone<=5&&typeof i.review.by==='string','人工评分无效。');
    }
  }
}
function checkBackupCounts(s){
  backupAssert(backupObject(s)&&Object.keys(diagCounts()).every(k=>Number.isSafeInteger(s[k])&&s[k]>=0),'用量汇总无效。');
}
function readBackup(text){
  let file;try{file=JSON.parse(text.replace(/^\uFEFF/,''),(k,v)=>{
    if(['__proto__','constructor','prototype'].includes(k))throw Error();return v;
  });}catch{throw Error('无法读取项目备份，请选择工作台导出的完整 JSON。');}
  backupAssert(file?.format===backupKind&&file.version===1&&Array.isArray(file.rounds)&&file.rounds.length,'文件类型或版本不受支持。');
  const ids=new Set(),taskIds=new Set(),rowIds=new Set();
  for(const e of file.rounds){
    const p=e.project;
    backupAssert(backupObject(p)&&backupId(p.id)&&!ids.has(p.id)&&Number.isSafeInteger(p.round)&&p.round>0&&/^[A-Z]{3}$/.test(p.currency),'项目标识、轮次或币种无效。');ids.add(p.id);
    p.brief=checkBackupBrief(p.brief);if(p.briefDraft)p.briefDraft=checkBackupBrief(p.briefDraft);checkBackupAssets(p.assets);
    backupArray(p.cards,c=>checkBackupCard(c,p.brief),'创意格式无效。');
    backupArray(p.data,r=>backupObject(r)&&Object.hasOwn(DIRECTIONS,r.direction)&&['country','platform','name','audience'].every(k=>typeof r[k]==='string')&&NUMBER_KEYS.every(k=>Number.isFinite(r[k])&&r[k]>=0),'投放数据无效。');
    backupAssert(!p.exports||Array.isArray(p.exports),'导出记录无效。');
    backupAssert(!e.memory||typeof e.memory.text==='string','项目记忆无效。');
    backupAssert(Array.isArray(e.runs),'任务列表无效。');checkBackupEval(p.evaluation,p);
    for(const r of [...e.runs,...(p.evaluation?.runs||[])]){
      backupAssert(backupId(r.id)&&!taskIds.has(r.id)&&r.pid===p.id,'任务标识冲突。');taskIds.add(r.id);
    }
    for(const r of e.runs){
      backupAssert(typeof r.goal==='string'&&backupObject(r.scope)&&Array.isArray(r.steps)&&Object.hasOwn(AGENT_STATUS,r.status),'任务格式无效。');checkBackupBudget(r.budget);
      for(const s of r.steps){
        backupAssert(typeof s.name==='string'&&typeof s.title==='string'&&Object.hasOwn(AGENT_STATUS,s.status),'任务步骤无效。');
        if(s.status==='done')backupAssert(backupObject(s.result)&&typeof s.result.text==='string','步骤成果无效。');
        if(s.result?.card)checkBackupCard(s.result.card,p.brief);
      }
    }
    const j=e.journal;backupAssert(j&&Array.isArray(j.rows)&&j.rows.length<=diagLimit&&typeof e.recordBodies==='boolean','运行记录格式无效。');checkBackupCounts(j.sum);
    for(const [rid,counts] of Object.entries(j.sum.byRun||{})){backupAssert(backupId(rid),'用量任务标识无效。');checkBackupCounts(counts);}
    for(const r of j.rows){
      backupAssert(backupId(r.id)&&!rowIds.has(r.id)&&r.pid===p.id&&Object.hasOwn(diagSources,r.kind)&&typeof r.label==='string'&&Number.isFinite(r.at)&&Object.hasOwn(diagStatus,r.status),'调用明细无效。');rowIds.add(r.id);
    }
  }
  backupAssert(ids.has(file.active),'缺少当前轮次。');
  const all=file.rounds.map(e=>e.project);
  for(const p of all){
    const seen=new Set();let a=p;
    while(a?.parent&&ids.has(a.parent)){backupAssert(!seen.has(a.id),'轮次存在循环引用。');seen.add(a.id);a=all.find(x=>x.id===a.parent);}
  }
  backupAssert(familyRounds(all.find(p=>p.id===file.active),all).length===all.length,'文件中有无关项目。');
  backupArray(file.skills,s=>{agentInstructions(s.name,s.description,s.body);return typeof s.enabled==='boolean';},'技能格式无效。');
  backupUnique(file.skills,s=>s.name,'技能标识重复。');
  return file;
}
