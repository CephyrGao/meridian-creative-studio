function restorePlan(input){
  const file=clone(input),pids=new Map(file.rounds.map(e=>[e.project.id,id()])),rids=new Map(),groups=new Map(),names=new Map(),writes=new Map(),journals=[];
  const mapId=(map,key)=>{if(!map.has(key))map.set(key,id());return map.get(key);};
  for(const e of file.rounds)for(const r of [...e.runs,...(e.project.evaluation?.runs||[])])mapId(rids,r.id);
  const sourceRef=value=>{
    if(typeof value!=='string')return value;
    const [rid,...suffix]=value.split('/');return rids.has(rid)?[rids.get(rid),...suffix].join('/'):null;
  };
  const catalog=new Map(agentLibrary().map(s=>[s.name,s]));
  for(const s of file.skills){
    const prior=catalog.get(s.name);
    if(prior?.custom&&prior.body===s.body&&prior.description===s.description&&prior.enabled===s.enabled){names.set(s.name,s.name);continue;}
    let name=s.name,n=1;
    while(catalog.has(name)){
      const end='-copy-'+n++;name=s.name.slice(0,64-end.length).replace(/-+$/,'')+end;
    }
    const skill=agentInstructions(name,s.description,s.body);catalog.set(name,skill);names.set(s.name,name);
    writes.set(agentPrefix+'skill/'+name,skill);if(!s.enabled)writes.set(agentPrefix+'off/'+name,true);
  }
  const pause=r=>{
    if(r.budget?.pending){r.budget.held+=r.budget.pending.amount;delete r.budget.pending;}
    if(['queued','running','planning'].includes(r.status)){r.status='paused';r.error='已恢复已保存进度，继续后从未完成步骤执行。';}
  };
  for(const e of file.rounds){
    const p=e.project,old=p.id;p.workspaceId=spaceOf(project());p.id=pids.get(old);p.parent=pids.get(p.parent)||null;p.restoredAt=Date.now();
    if(p.agentSource)p.agentSource=sourceRef(p.agentSource);
    for(const c of p.cards)if(c.agentSource)c.agentSource=sourceRef(c.agentSource);
    for(const r of p.evaluation?.runs||[]){r.id=rids.get(r.id);r.pid=p.id;pause(r);for(const item of r.items)if(item.status==='running')item.status='paused';}
    if(e.memory)writes.set(agentPrefix+'memory/'+p.id,e.memory);
    if(!e.recordBodies)writes.set('meridian-trace-bodies/'+p.id,'off');
    for(const r of e.runs){
      r.id=rids.get(r.id);r.pid=p.id;pause(r);r.pick=names.get(r.pick)||r.pick;
      for(const s of r.steps){
        s.name=names.get(s.name)||s.name;if(s.definition)s.definition.name=s.name;
        if(s.status==='running')s.status='paused';
        if(s.result?.appliedPid)s.result.appliedPid=pids.get(s.result.appliedPid)||null;
      }
      writes.set(agentPrefix+'run/'+r.id,r);
    }
    const {sum,rows}=e.journal;sum.pid=p.id;
    sum.byRun=Object.fromEntries(Object.entries(sum.byRun||{}).map(([rid,value])=>[mapId(rids,rid),value]));
    for(const row of rows){
      row.pid=p.id;row.id=id();row.group=mapId(groups,row.group||row.id);
      if(row.runId)row.runId=mapId(rids,row.runId);
    }
    sum.recent=rows.map(r=>({id:r.id,at:r.at}));journals.push({sum,rows});
  }
  return {projects:file.rounds.map(e=>e.project),active:pids.get(file.active),writes,journals};
}
function restoreHistory(handle,entries,remove=false){
  return new Promise((resolve,reject)=>{
    const tx=handle.transaction(['projects','records'],'readwrite'),projects=tx.objectStore('projects'),rows=tx.objectStore('records');
    for(const e of entries){
      if(!remove){projects.add(e.sum);for(const r of e.rows)rows.add(r);continue;}
      projects.delete(e);
      const cursor=rows.index('project').openKeyCursor(e);
      cursor.onsuccess=()=>{if(cursor.result){rows.delete(cursor.result.primaryKey);cursor.result.continue();}};
    }
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('本机未能保存恢复的运行记录。'));
  });
}
async function rollbackRestore(key,j,handle){
  const saved=JSON.parse(localStorage.getItem(storeKey)||'null');
  const orphans=j.pids.filter(pid=>!saved?.projects?.some(p=>p.id===pid));
  if(orphans.length===j.pids.length){
    if(j.requiresDisk&&!handle)return;
    if(handle&&j.requiresDisk)await restoreHistory(handle,orphans,true);
    for(const k of j.keys)if([agentPrefix,'meridian-trace-bodies/',archivePrefix].some(prefix=>k.startsWith(prefix))){
      localStorage.removeItem(k);
      if(k.startsWith(agentPrefix)){agentRecords.delete(k.slice(agentPrefix.length));agentVolatile.delete(k.slice(agentPrefix.length));}
    }
    for(const pid of orphans)diagViews.delete(pid);
  }
  localStorage.removeItem(key);
}
async function recoverRestores(){
  const recover=async()=>{
    const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(restoreMarker))keys.push(k);}
    if(keys.length){const handle=await diagDb();for(const k of keys){const raw=localStorage.getItem(k);if(raw)await rollbackRestore(k,JSON.parse(raw),handle);}}
  };
  try{if(globalThis.navigator?.locks?.request)await navigator.locks.request('meridian-backup-restore',recover);else await recover();}catch{}
}
async function installBackup(file){
  const install=async()=>{
    if(job||agentActive)throw Error('请在当前任务结束或停止后恢复项目副本。');
    if(saveFailed)throw Error('当前工作区有尚未落盘的修改。请先导出备份并释放本机空间。');
    const plan=restorePlan(file),handle=await diagDb(),key=restoreMarker+id();
    if(!handle)for(const e of plan.journals)plan.writes.set(archivePrefix+e.sum.pid,{...e,loaded:true});
    const marker={keys:[...plan.writes.keys()],pids:plan.projects.map(p=>p.id),requiresDisk:!!handle};
    const currentIds=new Set((JSON.parse(localStorage.getItem(storeKey)||'null')||db).projects.map(p=>p.id));
    if(marker.pids.some(pid=>currentIds.has(pid))||marker.keys.some(k=>localStorage.getItem(k)!=null))throw Error('项目或技能标识已变化，请重新打开备份再恢复。');
    const unpack=(k,v)=>k.startsWith(agentPrefix)||k.startsWith(archivePrefix)?JSON.stringify(v):v;
    let committed=false;
    try{
      localStorage.setItem(key,JSON.stringify(marker));
      for(const [k,v] of plan.writes){
        localStorage.setItem(k,unpack(k,v));
      }
      if(handle)await restoreHistory(handle,plan.journals);
      const current=JSON.parse(localStorage.getItem(storeKey)||'null')||db;
      const next={...current,active:plan.active,projects:[...current.projects,...plan.projects]};
      localStorage.setItem(storeKey,JSON.stringify(next));committed=true;db=next;saveFailed=false;
      for(const [k,v] of plan.writes)if(k.startsWith(agentPrefix))agentRecords.set(k.slice(agentPrefix.length),v);
      for(const e of plan.journals)diagViews.set(e.sum.pid,{...e,loaded:true});
      localStorage.removeItem(key);
    }catch(err){
      if(!committed){await rollbackRestore(key,marker,handle);throw Error('恢复未完成。'+(err.name==='QuotaExceededError'?'本机空间不足，请释放空间或在新工作区恢复。':err.message));}
    }
    diagTask='';diagFilter='all';resetFilters();go('overview');return plan.active;
  };
  if(globalThis.navigator?.locks?.request)return navigator.locks.request('meridian-backup-restore',install);
  return install();
}
function backupDialog(p){
  const rounds=familyRounds(p);
  openDialog('项目备份与恢复',`<div class="stack"><div class="slot"><h3>${h(p.brief.name||'未命名项目')}</h3><p>包含关联的 ${rounds.length} 个轮次，以及 Brief、素材、审核、投放数据、任务、项目记忆、评测和运行记录。</p>
    ${btn('导出项目备份','backup-export','download','primary')}</div><div class="slot"><h3>从备份恢复</h3><p>先预览内容，再建一个项目副本。模型连接和 MCP 授权需在目标设备配置。</p>${btn('选择备份文件','backup-pick','upload')}</div></div>`);
}
function backupPreview(file){
  backupPending=file;const q=file.rounds.find(e=>e.project.id===file.active).project;
  const total=get=>file.rounds.reduce((n,e)=>n+get(e),0);
  openDialog('恢复项目副本',`<h3>${h(q.brief.name||'未命名项目')}</h3><p>${file.rounds.length} 个轮次 · ${total(e=>e.project.cards.length)} 条创意 · ${total(e=>e.project.assets.length)} 份素材 · ${total(e=>e.runs.length)} 个 Agent 任务 · ${total(e=>e.project.evaluation?.runs.length||0)} 组评测 · ${total(e=>e.journal.rows.length)} 条调用详情</p><p class="hint">备份时间 ${h(diagMoment(Date.parse(file.created)))}。历史审核、预算余额、人工评分和用量汇总随副本迁移。</p>`,
    btn('取消','close')+btn('恢复为新项目','backup-restore','folder','primary'));
}
async function backupAction(action){
  if(backupBusy)return;
  if(action==='backup-open'){backupPending=null;backupDialog(project());return;}
  if(action==='backup-pick'){pickFile('project-backup','.json,application/json');return;}
  backupBusy=true;
  try{
    if(action==='backup-export'){
      const p=project(),file=await makeBackup(p);
      const saved=await download((p.brief.name||'营销项目')+'-整项目备份.json',JSON.stringify(file),'application/json');
      if(saved!==false)toast('项目备份已导出。');return;
    }
    if(action==='backup-restore'&&backupPending){await installBackup(backupPending);backupPending=null;toast('已恢复为独立项目副本。');}
  }finally{backupBusy=false;}
}
