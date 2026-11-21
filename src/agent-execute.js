function agentTarget(p,scope){
  const market=scope.market||p.brief.markets?.[0],platform=scope.platform||p.brief.platforms?.[0];
  if(!MARKETS[market]||!PROFILE[platform])throw new AgentNeeds('请先在 Brief 中保存目标市场和渠道。','brief');
  return {market,platform,direction:scope.direction,id:keyOf(market,platform,scope.direction)};
}
function agentProjectStamp(p){return agentFingerprint([p.brief,p.assets]);}
function agentReviewData(p,run){
  const rows=agentScopeRows(p,run.scope);
  if(!rows.length)throw new AgentNeeds('当前范围没有投放记录。请导入投放 CSV，或调整范围后发起新任务。','csv');
  return {rows,report:report(rows,p.currency,p.brief.goal),source:[p.sourceType||'项目投放数据',p.sourceFile].filter(Boolean).join(' · ')};
}
function agentBriefResult(p){
  const b=p.brief,fields=[['name','任务名称'],['brand','品牌'],['product','产品介绍'],['benefits','可核实卖点'],['audience','受众'],['tone','语气'],['goal','营销目标'],['markets','目标市场'],['platforms','投放渠道']];
  const missing=fields.filter(([k])=>!b[k]?.length).map(([,label])=>label);
  const facts=[b.product,b.benefits].filter(Boolean);
  const checks=[];
  if(missing.length)checks.push('待补齐：'+missing.join('、')+'。');
  if(b.evidence&&!b.source)checks.push('反馈已有原文，需要补充可追溯的来源。');
  if(!b.evidence)checks.push('采用社会证明方向前，需要一条获准引用的反馈及出处。');
  if(!b.params)checks.push('请确认哪些产品参数可用于广告。');
  const lines=[...(facts.length?['现有产品事实',...facts]:[]),...(b.audience?['目标受众 · '+b.audience]:[]),
    ...(b.banned?['禁用表述 · '+b.banned]:[]),...(b.terms?['保留术语 · '+b.terms]:[]),...(checks.length?['\n跟进事项',...checks]:['\n核心字段、参数和反馈出处均已填写。'])];
  return {headline:`${fields.length-missing.length}/${fields.length} 项核心信息已填写`,text:lines.join('\n'),source:'已保存的项目 Brief',open:'brief'};
}
function agentChannelResult(p,run){
  const b=p.brief,markets=run.scope.market?[run.scope.market]:b.markets,platforms=run.scope.platform?[run.scope.platform]:b.platforms;
  if(!markets?.length||!platforms?.length)throw new AgentNeeds('请先保存目标市场和渠道。','brief');
  const lines=['市场语言',...markets.map(m=>`${MARKETS[m].name} · ${MARKETS[m].lang}（${MARKETS[m].code}）`),'','渠道与版位'];
  for(const id of platforms){const pf=PROFILE[id];lines.push(`${pf.label} · ${pf.placement}\n${pf.guidance}`);if(pf.source)lines.push(pf.source);}
  if(b.tone)lines.push('','本项目品牌语气 · '+b.tone);
  return {headline:`${markets.length} 个市场，${platforms.length} 个渠道`,text:lines.join('\n'),source:'项目 Brief · 工作台市场与版位目录'};
}
function agentPerformance(p,run){
  const {rows,report:r,source}=agentReviewData(p,run),a=r.all;
  const lines=[`${rows.length} 条记录 · ${number(a.impressions)} 次展示 · ${number(a.clicks)} 次点击 · ${number(a.conversions)} 次转化`,
    `花费 ${money(a.spend,p.currency)}　CTR ${pct(a.ctr)}　CVR ${pct(a.cvr)}　CPA ${money(a.cpa,p.currency)}`,''];
  for(const x of r.experiments)lines.push(`${x.name} · ${x.country} / ${x.platform}\n${x.signal}`);
  return {headline:r.experiments[0]?.type||'投放表现汇总',text:lines.join('\n'),source,experiments:r.experiments,open:'report'};
}
function agentExperiment(p,run){
  const prior=run.steps.find(s=>s.name==='campaign-review'&&s.status==='done');
  const data=prior?{experiments:prior.result.experiments,source:'本次任务的投放复盘 · '+prior.result.source}:
    (()=>{const d=agentReviewData(p,run);return {experiments:d.report.experiments,source:d.source};})();
  const x=data.experiments?.[0];
  if(!x)throw new AgentNeeds('需要至少一组可分析的投放记录才能设计数据驱动的实验。','csv');
  return {headline:`${x.name} · ${x.type}`,text:experimentBrief(x),source:data.source,experiment:x};
}
function agentModelContext(p,run) {
  const refs=agentSources(p,run);
  const memory=spaceMemory(p,run.goal);
  return {brief:Object.fromEntries(Object.entries(p.brief).map(([k,v])=>[k,typeof v==='string'?agentClip(v,2400):v])),
    scope:run.scope,projectMemory:memory,dataOrigin:p.sourceType||'',sources:refs.map(s=>({...s,text:agentClip(s.text,2400)})),
    previousSteps:run.steps.filter(s=>s.status==='done'&&s.name!=='@mcp').map(s=>({skill:s.title,result:agentClip(s.result.text,1700)}))};
}
async function agentWrite(p,run,def,config,signal) {
  const context=agentModelContext(p,run);
  const answer=await modelRequest('agent/write',config,{goal:run.goal,skill:{body:def.body},context},signal);
  const {headline,body,sources,questions}=answer.result||{};
  if(typeof headline!=='string'||!headline.trim()||typeof body!=='string'||!body.trim()||body.length>32000||!Array.isArray(sources)||!Array.isArray(questions))
    throw Error('模型没有给出完整的技能成果，请重试。');
  const refs=new Map(context.sources.map(s=>[s.id,s.label]));
  const cited=new Set([...sources,...Array.from(body.matchAll(/\[(S\d+)\]/g),m=>m[1])]);
  for(const id of cited)if(!refs.has(id))throw Error('模型引用了输入中不存在的来源 '+agentClip(id,60)+'，请重试。');
  if(def.name==='source-research' && refs.size&&!cited.size)throw Error('研究结果缺少来源编号，请重试。');
  const follow=questions.filter(q=>typeof q==='string'&&q.trim());
  return {headline:agentClip(headline,160),text:body.trim()+(follow.length?'\n\n待补充\n'+follow.join('\n'):''),
    source:[answer.engine,...Array.from(cited,id=>`[${id}] ${refs.get(id)}`)].join(' · ')};
}
function agentCreativeText(c){
  return [c.title,c.copy,'行动引导 · '+c.cta,'',...c.shots.map(s=>`${s.time}　${s.visual}\n旁白：${s.voice}\n字幕：${s.subtitle}`)].join('\n');
}
function agentAssignment(p,run){
  const context=agentModelContext(p,run);
  return {agentGoal:run.goal,agentMemory:context.projectMemory,agentPrevious:context.previousSteps,
    notes:context.sources.map(s=>({name:s.label,text:s.text}))};
}
async function agentCreative(p,run,config,signal) {
  try{validateBrief(p.brief);}catch(e){throw new AgentNeeds(e.message,'brief');}
  const t=agentTarget(p,run.scope),saved=p.cards.find(c=>c.id===t.id);
  let card,source,generated=false;
  const stamp=agentProjectStamp(p);
  if(!config){
    if(!p.demo||!isSampleProduct(p.brief)||!saved||saved.origin!=='sample')throw new AgentNeeds('创作新脚本需要先连接模型。','model');
    card=clone(saved);source='项目已有示例脚本';
  }else{
    const {result,engine}=await callModel('generate',p,t,signal,config,agentAssignment(p,run));
    card=checkedCard(result,p.brief,t.market,t.platform,t.direction);card.engine=engine;
    generated=true;source=engine+' · 营销 Brief';
  }
  return {headline:`${MARKETS[t.market].name} / ${platformLabel(t.platform)} · ${card.title}`,text:agentCreativeText(card),source,card,generated,stamp};
}
async function agentCreativeCheck(p,run,config,signal) {
  const previous=run.steps.find(s=>s.name==='creative-script'&&s.status==='done');
  const t=agentTarget(p,run.scope);
  const card=previous?.result.card||p.cards.find(c=>c.id===t.id);
  if(!card)throw new AgentNeeds('此市场、渠道和方向还没有脚本。请先生成创意，或在新任务中选择已有脚本的范围。','creative');
  const issues=audit(card,p.brief);let source='工作台规则检查',semantic=null;
  const stamp=agentProjectStamp(p),reviewStamp=agentFingerprint([card.revision,card.semantic,card.approval]);
  if(config){
    const response=await callModel('audit',p,card,signal,config,agentAssignment(p,run));
    semantic={issues:checkedSemantic(response.result),engine:response.engine,at:new Date().toISOString(),revision:card.revision};
    issues.push(...semantic.issues);source+=' · '+semantic.engine;
  }else if(semanticReady(card)){issues.push(...card.semantic.issues);source+=' · '+card.semantic.engine;}
  const high=issues.filter(i=>i.level==='高').length;
  const lines=[card.title,...issues.slice(0,35).map(i=>`${i.level}风险 · ${fieldName(i.path)}\n原文：${i.quote}\n${i.reason} ${i.fix}`)];
  if(!issues.length)lines.push('已运行的检查未发现问题。');
  if(issues.length>35)lines.push(`共 ${issues.length} 项，已展示前 35 项。`);
  return {headline:`${issues.length} 项发现，${high} 项高风险`,text:lines.join('\n\n'),source,checkedId:card.id,semantic,stamp,reviewStamp,fromDraft:!!previous?.result.generated,open:'audit'};
}
async function agentExecute(step,p,run,config,signal){
  if(step.name==='@mcp'){
    const chosen=run.tool,live=mcpConnection;
    const entry=live?.tools.find(t=>t.name===chosen.name&&t.annotations?.readOnlyHint===true);
    if(!entry||agentFingerprint(live.endpoint)!==chosen.endpoint)throw new AgentNeeds('请重新连接本任务选用的只读 MCP 工具，再继续。','mcp');
    const args=agentToolInputs.get(run.id);
    if(!args)throw new AgentNeeds('请在任务范围中重新选择该工具并填写参数，然后继续。','tool');
    const result=await live.call(chosen.name,args,signal),text=mcpResultText(result);
    if(result.isError)throw Error('MCP 工具返回错误。'+agentClip(text,350));
    if(!text.trim()||!((result.content||[]).some(c=>c.type==='text'||c.resource?.text||c.type==='resource_link')||result.structuredContent))throw Error('该工具没有返回可用于营销分析的文字或结构化数据。');
    return {headline:'已取回查询结果',text:agentClip(text,6500),source:`MCP · ${chosen.server} / ${chosen.name}`};
  }
  const def=agentLibrary().find(s=>s.name===step.name&&s.enabled);
  if(!def)throw new AgentNeeds('该技能已停用。启用后可以继续当前步骤。','skills');
  if(spaceBuiltinTools.some(([name])=>name===step.name))return spaceToolRun(step.name,p,run,signal,config);
  switch(step.name){
    case 'brief-check': return agentBriefResult(p);
    case 'channel-fit': return agentChannelResult(p,run);
    case 'campaign-review': return agentPerformance(p,run);
    case 'experiment-design': return agentExperiment(p,run);
    case 'creative-script': return agentCreative(p,run,config,signal);
    case 'creative-check': return agentCreativeCheck(p,run,config,signal);
    case 'source-research': {
      const refs=agentSources(p,run);
      if(!refs.length||(/竞品|competitor/i.test(run.goal)&&!p.assets.some(a=>a.text)&&!p.brief.assetNotes&&!run.steps.some(s=>s.status==='done'&&(s.name==='@mcp'||s.result?.refs?.length))))
        throw new AgentNeeds('请在 Brief 中添加研究资料，或为任务选择只读 MCP 查询。','brief');
      if(config)return agentWrite(p,run,{...def,body:'围绕用户的研究问题逐项比较已提供的资料，列出可引用的事实、差异、证据局限和下一项待验证假设。每个关键判断引用实际提供的来源编号。'},config,signal);
      return {headline:`已编出 ${refs.length} 条资料索引`,text:refs.map(s=>`[${s.id}] ${s.label}\n${agentClip(s.text,900)}`).join('\n\n'),
        source:'项目资料摘录 · 本地整理'};
    }
    default:
      if(!config)throw new AgentNeeds('运行自定义文字技能需要先连接模型。','model');
      return agentWrite(p,run,step.definition||def,config,signal);
  }
}
