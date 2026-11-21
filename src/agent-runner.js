function agentSaveRun(run) {
  run.updated=Date.now();agentPut('run/'+run.id,run);
  if(db.active===run.pid){if(page==='agent')render();else updateProgress();}
}
function agentCurrentRun(p){
  const chosen=agentRecords.get('run/'+agentSelection.get(p.id));
  return chosen?.pid===p.id?chosen:agentRunsFor(p.id)[0];
}
function agentStep(def){
  return {name:def.name,title:def.title,status:'pending',...(def.custom?{definition:{name:def.name,body:def.body}}:{})};
}
async function agentPlan(p,run,config,signal) {
  const skills=agentLibrary().filter(s=>s.enabled);
  if(!skills.length)throw new AgentNeeds('请先启用一项营销技能。','skills');
  let names;
  if(run.pick){
    if(!skills.some(s=>s.name===run.pick))throw new AgentNeeds('所选技能已停用，请先启用。','skills');
    names=[run.pick];run.planner='手动指定技能';
  }else if(config){
    const data=await modelRequest('agent/plan',config,{goal:run.goal,project:p.brief.name,
      catalog:skills.map(({name,description})=>({name,description}))},signal);
    names=data.result?.skills;
    if(!Array.isArray(names)||names.length>12||names.some(n=>!skills.some(s=>s.name===n)))
      throw Error('模型计划中包含不可用的技能，请重试或指定技能。');
    names=[...new Set(names)];run.planner='模型规划 · '+data.engine;
  }else{names=agentLocalPlan(run.goal,skills);run.planner='本地目标匹配';}
  if(!names.length&&!run.inputs?.files?.length&&!run.inputs?.query&&!run.inputs?.url)throw new AgentNeeds('目标与已启用技能没有匹配项。请在技能库选择技能，或换一个更具体的目标。','skills');
  const inputs=run.inputs||{};
  for(const [name,enabled] of [['read-files',inputs.files?.length],['web-search',inputs.query],['fetch-url',inputs.url]])if(enabled){
    if(!skills.some(s=>s.name===name))throw new AgentNeeds('请先在技能库启用 '+name+'。','skills');names=[name,...names.filter(n=>n!==name)];
  }
  const dependencies=new Map([['experiment-design',['campaign-review']],
    ['creative-script',['brief-check','source-research','channel-fit','campaign-review','experiment-design']],['creative-check',['creative-script']]]);
  const ordered=new Set();
  function visit(name){
    if(ordered.has(name))return;
    for(const prerequisite of dependencies.get(name)||[])if(names.includes(prerequisite))visit(prerequisite);
    ordered.add(name);
  }
  for(const name of ['read-files','web-search','fetch-url','memory-recall'])if(names.includes(name))visit(name);
  names.forEach(visit);
  const steps=Array.from(ordered,n=>agentStep(skills.find(s=>s.name===n)));
  if(run.tool)steps.unshift({name:'@mcp',title:'MCP 查询 · '+run.tool.name,status:'pending'});
  return steps;
}
async function agentContinue(p,run){
  if(agentActive||job)throw Error('有任务正在执行，请等待完成或先停止。');
  if(run.status==='done')return;
  const ctrl=new AbortController(),live={id:run.id,pid:p.id,ctrl};
  const context={pid:p.id,runId:run.id,step:'任务规划',budgetRun:run};diagContexts.set(ctrl.signal,context);
  agentActive=live;
  const execute=async()=>{
    budgetRecover(run);
    const conf=modelName()?activeConnection():null;
    let step;
    try{
      if(!run.steps.length){
        run.status='planning';delete run.error;delete run.help;agentSaveRun(run);
        const planned=await agentPlan(p,run,conf,ctrl.signal);
        ctrl.signal.throwIfAborted();run.steps=planned;
      }
      run.status='running';delete run.error;delete run.help;agentSaveRun(run);
      for(step of run.steps){
        if(step.status==='done')continue;
        context.step=step.title;
        ctrl.signal.throwIfAborted();
        step.status='running';delete step.error;agentSaveRun(run);
        const out=await agentExecute(step,p,run,conf,ctrl.signal);
        ctrl.signal.throwIfAborted();
        step.result=out;step.status='done';step.finished=Date.now();agentSaveRun(run);
      }
      run.status='done';
    }catch(e){
      const interrupted=ctrl.signal.aborted;
      run.status=interrupted||e.action==='budget'?'paused':e instanceof AgentNeeds?'blocked':'failed';
      run.error=interrupted?'已停止，完成的步骤已保留。':String(e.message||e);
      if(e instanceof AgentNeeds)run.help=e.action;
      await diagError(e,context.step,context,interrupted?'cancelled':e instanceof AgentNeeds?'blocked':'error');
      if(step&&step.status!=='done'){step.status=run.status;step.error=run.error;}
    }finally{agentSaveRun(run);}
  };
  try{
    if(globalThis.navigator?.locks?.request){
      await navigator.locks.request('meridian-agent-'+run.id,{ifAvailable:true},async lock=>{
        if(!lock)throw Error('此任务正在另一个窗口执行。');
        try{
          const stored=!agentVolatile.has('run/'+run.id)&&JSON.parse(localStorage.getItem(agentPrefix+'run/'+run.id)||'null');
          if(stored && stored.updated>=run.updated){Object.assign(run,stored);}
        }catch{}
        if(run.status!=='done')await execute();
      });
    }else await execute();
  }finally{
    if(agentActive===live)agentActive=null;
    if(db.active===p.id){if(page==='agent')render();else updateProgress();}
  }
}
function agentReadToolArgs(raw){
  let args;try{args=JSON.parse(raw);}catch{throw Error('MCP 工具参数需要有效的 JSON。');}
  if(!args||typeof args!=='object'||Array.isArray(args))throw Error('MCP 工具参数需要 JSON 对象。');
  return args;
}
function agentBoundTool(draft) {
  if(!draft.tool)return null;
  const c=mcpConnection,t=c?.tools.find(x=>x.name===draft.tool&&x.annotations?.readOnlyHint===true);
  if(!t)throw Error('所选只读工具已断开或不可用，请重新选择。');
  const args=agentReadToolArgs(draft.args||'{}');
  for(const key of t.inputSchema?.required||[])if(!Object.hasOwn(args,key))throw Error('MCP 工具缺少参数 '+key+'。');
  return {binding:{name:t.name,server:c.name,endpoint:agentFingerprint(c.endpoint)},args};
}
async function agentStart(p) {
  if(agentActive||job)throw Error('有任务正在执行，请等待完成或先停止。');
  const form=agentDraft(p),goal=form.goal.trim();
  if(!goal||goal.length>2000)throw Error('请填写 1–2,000 字的任务目标。');
  const bound=agentBoundTool(form),now=Date.now();
  const run={id:id(),pid:p.id,created:now,updated:now,goal,pick:form.pick,inputs:spaceRunInputs(form),scope:agentScope(p,form),
    budget:{limit:readTokenLimit(form.budget),reported:0,held:0},status:'queued',steps:[],tool:bound?.binding||null};
  if(bound)agentToolInputs.set(run.id,bound.args);
  agentSelection.set(p.id,run.id);agentSaveRun(run);
  await agentContinue(p,run);
}
async function agentResume(p,run){
  const replacement=spaceRunInputs(agentDraft(p));
  if(run.help==='files'&&replacement.files.length){run.inputs={...run.inputs,files:replacement.files};agentSaveRun(run);}
  if(run.help==='inputs'&&replacement.url){run.inputs={...run.inputs,url:spaceUrl(replacement.url)};agentSaveRun(run);}
  const m=run.steps.find(s=>s.name==='@mcp');
  if(run.tool&&(!m||m.status!=='done')&&!agentToolInputs.has(run.id)){
    const bound=agentBoundTool(agentDraft(p));
    if(!bound||bound.binding.name!==run.tool.name||bound.binding.endpoint!==run.tool.endpoint)
      throw Error('先在「执行范围」重新绑定原只读工具及参数。');
    agentToolInputs.set(run.id,bound.args);
  }
  await agentContinue(p,run);
}
function agentApplyResult(p,run,name){
  if(agentActive?.id===run.id)throw Error('请等待当前任务完成后再写入项目。');
  const step=run.steps.find(s=>s.name===name&&s.status==='done'),out=step?.result;
  if(!out)throw Error('此步骤尚无可用成果。');
  if(name==='creative-check'&&out.semantic&&!out.fromDraft){
    const card=p.cards.find(c=>c.id===out.checkedId);
    if(!card)throw Error('待审创意已移除。');
    if(!out.appliedPid){
      if(out.stamp!==agentProjectStamp(p)||out.reviewStamp!==agentFingerprint([card.revision,card.semantic,card.approval]))throw Error('创意、资料或审核状态已更改，请重新执行质检。');
      card.semantic=clone(out.semantic);card.approval=null;p.updated=Date.now();save();out.appliedPid=p.id;agentSaveRun(run);
    }
    setProject(p.id,'audit');reviewDialog(card.id);return;
  }
  const dest=name==='experiment-design'?'brief':'creative';
  if(out.appliedPid){const existing=db.projects.find(q=>q.id===out.appliedPid);if(existing){setProject(existing.id,dest);return;}}
  const existing=db.projects.find(q=>q.agentSource===run.id+'/'+name);
  if(existing){out.appliedPid=existing.id;agentSaveRun(run);setProject(existing.id,dest);return;}
  let target;
  if(name==='experiment-design'&&out.experiment)target=experimentProject(p,out.experiment);
  else if(name==='creative-script'&&out.card){
    if(!out.generated){setProject(p.id,'creative');detailDialog(out.card.id);return;}
    if(out.stamp!==agentProjectStamp(p))throw Error('项目 Brief 或参考素材已变更，请按最新资料重新运行脚本技能。');
    const card=clone(out.card);
    if(p.cards.some(c=>c.agentSource===run.id)){out.appliedPid=p.id;agentSaveRun(run);setProject(p.id,'creative');return;}
    if(p.cards.some(c=>c.id===card.id)){
      target=emptyProject(p.brief);target.parent=p.id;target.round=p.round+1;target.assets=clone(p.assets);target.currency=p.currency;
    }else target=p;
    card.approval=null;card.agentSource=run.id;
    const checked=run.steps.find(s=>s.name==='creative-check'&&s.result?.checkedId===card.id&&s.status==='done');
    if(checked?.result.semantic)card.semantic=clone(checked.result.semantic);
    target.cards.push(card);
  }else throw Error('该成果无法写入此项目。');
  if(target!==p){target.agentSource=run.id+'/'+name;db.projects.push(target);}
  target.updated=Date.now();save();out.appliedPid=target.id;agentSaveRun(run);setProject(target.id,dest);
}
