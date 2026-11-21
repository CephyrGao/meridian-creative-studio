import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import worker from '../worker/index.js';
const html=await readFile(new URL('../dist/local/preview.html',import.meta.url),'utf8');
const pageScript=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const storage=new Map(),requests=[];
const localStorage={get length(){return storage.size;},key(i){return [...storage.keys()][i];},getItem(k){return storage.get(k)??null;},setItem(k,v){storage.set(k,v);},removeItem(k){storage.delete(k);}};
const actualFetch=globalThis.fetch;
let reply={skills:['campaign-review','experiment-design']};
globalThis.fetch=async(url,options)=>{
  const payload=JSON.parse(options.body);requests.push({url,payload});
  const text=JSON.stringify(reply);
  const envelope=String(url).includes('/api/chat')?{model:'local-fixture',message:{content:text}}:
    String(url).endsWith('/responses')?{model:'response-fixture',output:[{content:[{type:'output_text',text}]}]}:
    {model:'marketing-fixture',choices:[{finish_reason:'stop',message:{content:text}}]};
  return Response.json(envelope);
};
const api=(path,data,extra={},env={IS_LOCAL:true})=>worker.fetch(new Request('http://127.0.0.1:8764'+path,{method:'POST',headers:{'content-type':'application/json',...extra},body:JSON.stringify(data)}),env);
function windowFixture(){
  const nodes=new Map();
  function element(s){
    if(!nodes.has(s))nodes.set(s,{value:'',open:false,innerHTML:'',textContent:'',dataset:{},classList:{toggle(){},add(){},remove(){}},querySelectorAll(){return [];},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;},focus(){},addEventListener(){}});
    return nodes.get(s);
  }
  const ctx=createContext({console,Intl,Date,Math,crypto:webcrypto,structuredClone,localStorage,URL,Blob,Headers,Response,Request,AbortSignal,AbortController,
    document:{title:'',querySelector:element,querySelectorAll:()=>[],addEventListener(){}},location:{hash:'#overview',protocol:'http:'},history:{replaceState(){}},
    window:{addEventListener(){},scrollTo(){}},requestAnimationFrame(){},setTimeout:()=>0,clearTimeout(){},assert,
    fetch:async(path,opt)=>path==='/api/status'?Response.json({server:null,local:null}):api(path,JSON.parse(opt.body),Object.fromEntries(new Headers(opt.headers)))});
  runInContext(pageScript,ctx);return code=>runInContext(code,ctx);
}
try {
  const w=windowFixture();
  w(`const original=project();const check=(v,m)=>{if(!v)throw Error(m);};
     go('agent');check($('#view').innerHTML.includes('任务目标'),'main navigation');const demoForm=agentDraft(original);
     demoForm.goal='找出点击高但转化差的素材，再给我下一轮 A/B 测试方案。';`);
  w(`const scopeOf=goal=>agentScope(original,{goal});check(scopeOf('只看 US TikTok').market==='US','ISO market');
     check(scopeOf('只看印尼和 Facebook').market==='ID'&&scopeOf('只看印尼和 Facebook').platform==='Meta','market and media aliases');
     check(!scopeOf('focus on TikTok').market,'partial words are not market codes');`);
  await w('agentStart(original)');
  w(`const first=agentCurrentRun(original);check(first.status==='done',first.error);
     check(first.steps.map(s=>s.name).join()==='campaign-review,experiment-design','plan order');
     check(first.steps[0].result.text.includes('3.50%')&&first.steps[1].result.text.includes('6.04%'),'actual cohort figures');
     agentApplyResult(original,first,'experiment-design');const next=project();
     check(next.parent===original.id&&next.brief.experiment.includes('CVR'),'experiment brief');
     const count=db.projects.length;agentApplyResult(original,first,'experiment-design');check(db.projects.length===count,'idempotent handoff');
     setProject(original.id,'agent');`);
  const originalId=w('original.id');
  const reload=windowFixture();assert.equal(reload(`agentRunsFor(${JSON.stringify(originalId)})[0].status`),'done');
  await w(`(async()=>{
    for(const name of ['brief-check','channel-fit','source-research','creative-script','creative-check']){
      demoForm.pick=name;demoForm.goal=agentLibrary().find(s=>s.name===name).example;await agentStart(original);
      const run=agentCurrentRun(original);check(run.status==='done',name+' '+run.error);
      if(name==='creative-script')check(!run.steps[0].result.generated&&run.steps[0].result.text.includes('12–15s'),'example provenance');
    }
    const blank=emptyProject({...clone(SAMPLE_BRIEF),name:'空白项目'});db.projects.push(blank);setProject(blank.id,'agent');
    Object.assign(agentDraft(blank),{pick:'campaign-review',goal:'复盘数据'});await agentStart(blank);
    const interrupted=agentCurrentRun(blank);check(interrupted.status==='blocked'&&interrupted.help==='csv','missing data');
    blank.data=clone(original.data);await agentResume(blank,interrupted);check(interrupted.status==='done','safe resume');
    check(agentRunsFor(blank.id).length===1&&!agentRunsFor(original.id).includes(interrupted),'isolated history');
    setProject(original.id,'agent');
  })()`);
  w(`const imported=agentParseSkill('\\ufeff---\\r\\nname: brand-voice\\r\\ndescription: >-\\r\\n  核对品牌语气\\r\\n  并给出修改稿\\r\\nmetadata:\\r\\n  author: example\\r\\n---\\r\\n# 品牌语气\\r\\n按来源重写一句。');
     check(imported.description==='核对品牌语气 并给出修改稿'&&imported.title==='品牌语气','frontmatter');
     assert.throws(()=>agentParseSkill('---\\nname: Bad--Skill\\ndescription: test\\n---\\n# 内容'));
     assert.throws(()=>agentParseSkill('---\\nname: a\\nname: a\\ndescription: test\\n---\\n# 内容'));
     agentPut('skill/'+imported.name,imported);agentPut('memory/'+original.id,{text:'品牌约定_短句'});
     providerChosen=true;provider='compatible';sessionOptions={baseUrl:'https://marketing-fixture.invalid/v1',model:'fixture-model',key:'session-test-only'};
     Object.assign(demoForm,{pick:'brand-voice',goal:'按品牌语气改写'});`);
  reply={headline:'文案建议',body:'已核实的折叠杯信息 [S1]。',sources:['S1'],questions:[]};
  await w('agentStart(original)');
  w(`const customRun=agentCurrentRun(original);check(customRun.status==='done',customRun.error);check(customRun.steps[0].result.source.includes('[S1]'),'cited sources');`);
  const input=JSON.parse(requests.at(-1).payload.messages[1].content);
  assert.equal(input.context.projectMemory,'品牌约定_短句');assert.match(input.workflow,/按来源重写/);
  assert.ok(!JSON.stringify([...storage.values()]).includes('session-test-only'));
  reply=w("clone(original.cards.find(c=>c.market===original.brief.markets[0]&&c.platform===original.brief.platforms[0]&&c.direction==='scene'))");
  reply.title='Fixture creative';
  w(`demoForm.pick='creative-script';demoForm.goal='写一条场景脚本';`);
  await w('agentStart(original)');
  w(`const writing=agentCurrentRun(original),out=writing.steps[0].result;check(writing.status==='done'&&out.generated,'generated script');
     const before=db.projects.length;agentApplyResult(original,writing,'creative-script');const round=project();
     check(round.parent===original.id&&round.cards[0].title==='Fixture creative'&&!round.cards[0].approval,'saved draft');
     check(original.cards.find(c=>c.id===out.card.id).title!=='Fixture creative','existing creative preserved');
     agentApplyResult(original,writing,'creative-script');check(db.projects.length===before+1,'script write is idempotent');
     setProject(original.id,'agent');`);
  reply={skills:['campaign-review','experiment-design']};w(`demoForm.pick='';demoForm.goal='分析并设计实验';`);
  await w(`agentStart(original)`);assert.match(w('agentCurrentRun(original).planner'),/marketing-fixture/);
  const catalogPayload=JSON.parse(requests.at(-1).payload.messages[1].content);
  assert.ok(catalogPayload.catalog.some(x=>x.name==='brand-voice'));assert.ok(!JSON.stringify(catalogPayload).includes('按来源重写一句'));
  reply={headline:'未知来源',body:'证据 [S999]',sources:['S999'],questions:[]};
  w("demoForm.pick='brand-voice'");await w('agentStart(original)');assert.equal(w('agentCurrentRun(original).status'),'failed');
  await w(`(async()=>{
    provider='';demoForm.pick='source-research';demoForm.goal='整理研究资料';demoForm.tool='market_lookup';demoForm.args='{"market":"JP"}';
    let calls=0;mcpConnection={endpoint:'https://marketing-fixture.invalid/mcp',name:'渠道查询',tools:[{name:'market_lookup',annotations:{readOnlyHint:true},inputSchema:{type:'object',required:['market']}}],
      call:async(n,a)=>{calls++;check(a.market==='JP','MCP inputs');return {content:[{type:'text',text:'查询记录 JP-03'}]};}};
    await agentStart(original);const run=agentCurrentRun(original);
    check(run.status==='done'&&run.steps[1].result.text.includes('查询记录 JP-03')&&calls===1,'MCP -> research');
    run.steps[1].status='paused';run.status='paused';await agentResume(original,run);check(calls===1,'completed tools not replayed');
    let signalStarted;const started=new Promise(resolve=>{signalStarted=resolve;}),workingCall=mcpConnection.call;
    mcpConnection.call=(name,args,signal)=>new Promise((resolve,reject)=>{
      signal.addEventListener('abort',()=>reject(signal.reason),{once:true});signalStarted();
    });
    const pending=agentStart(original);await started;agentActive.ctrl.abort();await pending;
    const paused=agentCurrentRun(original);check(paused.status==='paused'&&paused.steps[0].status==='paused','cancel in flight');
    mcpConnection.call=workingCall;await agentResume(original,paused);
    check(paused.status==='done'&&calls===2&&paused.steps.every(s=>s.status==='done'),'resume a cancelled tool');
    mcpConnection.tools[0].annotations.readOnlyHint=false;assert.throws(()=>agentBoundTool(demoForm));
    demoForm.tool='';agentPut('off/brand-voice',true);demoForm.pick='brand-voice';await agentStart(original);check(agentCurrentRun(original).status==='blocked','disabled skill blocked');
  })()`);
  const data={goal:'编制营销建议',skill:{body:'按来源反馈。'},context:{sources:[]}},headers={'x-session-model-key':'fixture'};
  reply={headline:'完成',body:'可执行建议',sources:[],questions:[]};
  for(const [provider,env] of [['openai',{}],['deepseek',{}],['compatible',{IS_LOCAL:true}],['session',{}],['local',{LOCAL_MODEL:'fixture-ollama'}]]){
    const opts=provider==='compatible'?{baseUrl:'https://marketing-fixture.invalid/v1',model:'fixture'}:{};
    const res=await api('/api/agent/write',{...data,provider,...opts},provider==='local'?{}:headers,env);
    assert.equal(res.status,200,provider);assert.equal((await res.json()).result.headline,'完成');
  }
  assert.equal((await api('/api/agent/plan',{provider:'openai',goal:'x',catalog:[]},headers)).status,400);
  reply={headline:'试算',body:'已核对输入资料 [S1]。',sources:['S1'],questions:[]};
  w(`provider='compatible';agentPut('off/brand-voice',false);Object.assign(demoForm,{pick:'brand-voice',budget:'1',tool:'',goal:'检查品牌'});`);
  const before=requests.length;
  await w('agentStart(original)');assert.equal(requests.length,before);assert.equal(w('agentCurrentRun(original).status'),'paused');
  await w(`(async()=>{const r=agentCurrentRun(original);await changeBudget(original,r,'150000');await agentResume(original,r);
    check(r.status==='done'&&r.budget.reported===0&&r.budget.held>0&&!r.budget.pending,'missing receipt is reserved');
    const unfinished={budget:{limit:9000,reported:10,held:0,pending:{amount:890}},pid:original.id,id:id(),steps:[],goal:'中断恢复',status:'paused'};
    budgetRecover(unfinished);check(unfinished.budget.held===890&&!unfinished.budget.pending,'recover uncertain spend after interruption');
    agentRecords.delete('run/'+unfinished.id);localStorage.removeItem(agentPrefix+'run/'+unfinished.id);
    demoForm.budget='1';provider='';demoForm.pick='campaign-review';await agentStart(original);check(agentCurrentRun(original).status==='done','offline rules do not need tokens');
  })()`);
  await w(`(async()=>{const file=await makeBackup(original);globalThis.backupText=JSON.stringify(file);
    const parsed=readBackup(backupText);check(parsed.rounds.length>=2,'family backup');assert.throws(()=>readBackup('{"version":9}'));
    const bad=clone(parsed);bad.rounds[0].project.assets.push({id:'bad',name:'bad',image:'data:text/html,SAMPLE'});assert.throws(()=>readBackup(JSON.stringify(bad)));
    const originalCount=db.projects.length,prior=localStorage.getItem(storeKey),keyList=()=>Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).sort().join();
    const keysBefore=keyList(),realSet=localStorage.setItem;
    localStorage.setItem=function(k,v){if(k===storeKey)throw Error('simulated full disk');return realSet.call(this,k,v);};
    try{await assert.rejects(installBackup(parsed));}finally{localStorage.setItem=realSet;}
    check(prior===localStorage.getItem(storeKey)&&keyList()===keysBefore&&db.projects.length===originalCount,'all-or-nothing restore');
    const custom=agentRecords.get('skill/brand-voice');agentPut('skill/brand-voice',{...custom,body:'更新后的现有技能'});
    const restoredId=await installBackup(parsed),restored=project();globalThis.restoredId=restoredId;
    check(restored.id!==original.id&&db.projects.length===originalCount+file.rounds.length,'restored as copy');
    const rr=agentRunsFor(restoredId);check(rr.some(r=>r.pick.startsWith('brand-voice-copy-')),'skill collision remapped');
    check(agentRecords.get('skill/brand-voice').body==='更新后的现有技能','existing skill preserved');
    check(agentRecords.get('memory/'+restoredId).text===agentRecords.get('memory/'+original.id).text,'project memory migrated');
    check(file.rounds.find(e=>e.project.id===original.id).journal.sum.calls===diagViewState(restoredId).sum.calls,'retained lifetime usage');
  })()`);
  const fresh=windowFixture();await fresh('diagEnsure(project().id,true)');assert.equal(fresh('project().id'),w('restoredId'));
  assert.equal(fresh('diagViewState(project().id).sum.calls'),w('diagViewState(restoredId).sum.calls'));
  const transfer=w('backupText');storage.clear();
  const newDevice=windowFixture();
  await newDevice('installBackup(readBackup('+JSON.stringify(transfer)+'))');
  assert.ok(newDevice("agentRecords.has('skill/brand-voice')&&!!agentRecords.get('memory/'+project().id)?.text"));
  assert.equal(newDevice('familyRounds(project()).length'),JSON.parse(transfer).rounds.length);
  assert.ok(newDevice("agentRunsFor(project().id).some(r=>r.budget?.held>0)&&!sessionOptions.key&&!mcpConnection"));
  console.log('Agent passed: integrated built-ins, chained metrics and experiment, accurate sample labels, saved/isolated history, SKILL.md, project memory, provider routing, gated tools, cited evidence, retry, task budget pause and resume, interrupted spend, family backup recovery, rollback and skill conflicts.');
}finally{globalThis.fetch=actualFetch;}
