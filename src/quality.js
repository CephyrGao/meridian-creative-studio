const qualityRubric='marketing-review-1',qualitySelection=new Map();
const qualityScale=['明显违背品牌语气','多处措辞需要改写','方向基本合适，仍需编辑','仅需微调','可直接使用且符合语气'];
function qualityBuiltins(){
  const make=(id,name,market,platform,direction,fields,checks)=>({id,name,market,platform,direction,brief:{...clone(EMPTY_BRIEF),...fields,name,markets:[market],platforms:[platform]},assets:[],checks});
  return {id:'marketing-v1',version:1,rubric:qualityRubric,cases:[
    make('cup','通勤随行杯','US','TikTok','scene',{brand:'Folda Go',product:'可折叠随行杯，供通勤外带咖啡使用。',benefits:'350 mL 容量，折叠后高度 6 cm。',params:'350 mL；6 cm',audience:'乘地铁的咖啡爱好者',tone:'像同事分享日常经验，短句、具体、克制。',terms:'Folda Go',banned:'permanently leakproof；best in the world'},['至少演示一次折叠收纳。','参数仅可使用 350 mL、6 cm。']),
    make('note','会议便签','CN','小红书','pain',{brand:'拾页',product:'给会议行动项做记录的方格便签。',benefits:'每本 60 页，封底有待办清单。',params:'60 页',audience:'需要在会后分派任务的项目助理',tone:'实用、平实，像项目同事在分享自己的做法。',terms:'拾页',banned:'效率翻倍；全网第一'},['明确一个会后跟进场景。','页数为 60，禁止虚构效率提升比例。']),
    make('light','夹扣阅读灯','ID','Meta','proof',{brand:'Luma Clip',product:'可以夹在书页上的阅读灯。',benefits:'两个亮度档位，USB-C 充电。',params:'2 档；USB-C',audience:'夜间阅读的学生',tone:'温和、自然的印尼语，用个人感受表达。',terms:'Luma Clip；USB-C',banned:'pasti berhasil；护眼认证',evidence:'Lampunya bisa dijepit di buku saya.',source:'教学访谈 ID-L07（本案例允许引用）'},['个人访谈仅描述夹在书本上的体验。','检查受众文案的印尼语语气和 USB-C 拼写。'])
  ]};
}
function qualityBook(p){return p.evaluation||{suites:[qualityBuiltins()],runs:[]};}
function qualityChoice(p){
  if(!qualitySelection.has(p.id))qualitySelection.set(p.id,{suite:'',a:'',b:'',budget:''});
  const choice=qualitySelection.get(p.id),book=qualityBook(p);
  const suite=book.suites.find(s=>s.id===choice.suite)||book.suites.at(-1);
  const runs=book.runs.filter(r=>r.suiteId===suite.id).slice().reverse();
  if(!runs.some(r=>r.id===choice.a))choice.a=runs[1]?.id||runs[0]?.id||'';
  if(!runs.some(r=>r.id===choice.b)||choice.b===choice.a)choice.b=runs.find(r=>r.id!==choice.a)?.id||'';
  return {choice,book,suite,runs,a:runs.find(r=>r.id===choice.a),b:runs.find(r=>r.id===choice.b)};
}
function qualitySave(p){
  p.updated=Date.now();save();
  if(saveFailed)throw Error('评测记录暂存于当前窗口。请导出项目备份，释放本机空间后继续。');
}
function qualityAddDialog(p){
  validateBrief(p.brief);
  openDialog('添加当前 Brief',`<p>${h(p.brief.name)} 的已保存 Brief 和参考素材将固定在新版本中。</p><div class="stack">
    <label class="field"><span>市场</span><select id="quality-market">${p.brief.markets.map(m=>option(m,MARKETS[m].name,p.brief.markets[0])).join('')}</select></label>
    <label class="field"><span>渠道</span><select id="quality-platform">${p.brief.platforms.map(k=>option(k,platformLabel(k),p.brief.platforms[0])).join('')}</select></label>
    <label class="field"><span>创意方向</span><select id="quality-direction">${Object.entries(DIRECTIONS).map(([k,d])=>option(k,d.name,'scene')).join('')}</select></label>
    <label class="field"><span>审阅要点（每行一条）</span><textarea id="quality-checks" maxlength="2400" rows="3" placeholder="例如：不得虚构销量，语气像同事分享。"></textarea></label></div>`,btn('保存新版本','quality-add-save','check','primary'));
}
function qualityAddCase(p){
  const {book,suite,choice}=qualityChoice(p),b=clone(p.brief),market=$('#quality-market').value,platform=$('#quality-platform').value,direction=$('#quality-direction').value;
  if(!b.markets.includes(market)||!b.platforms.includes(platform)||!Object.hasOwn(DIRECTIONS,direction))throw Error('请选择有效的评测范围。');
  b.markets=[market];b.platforms=[platform];
  const entry={id:id(),name:b.name,brief:b,market,platform,direction,assets:clone(p.assets),checks:$('#quality-checks').value.split('\n').map(s=>s.trim()).filter(Boolean)};
  const next={id:id(),version:Math.max(...book.suites.map(s=>s.version))+1,rubric:qualityRubric,cases:[...suite.cases,entry]};
  book.suites.push(next);p.evaluation=book;choice.suite=next.id;qualitySave(p);closeDialog();render();
}
function qualityConfig(){
  if(!modelName())throw new AgentNeeds('请先在「设置 → API 接入」选定用于本组评测的模型。','model');
  const cfg=activeConnection(),name=cfg.model||modelName();
  return {cfg,name,signature:agentFingerprint([cfg.provider,cfg.baseUrl||'',name])};
}
function qualityStats(run){
  const rows=run?.items||[],made=rows.filter(i=>i.status==='done'),reviewed=made.filter(i=>i.review);
  const rate=(n,d)=>d?Math.round(n*100/d)+'%':'待审';
  const checked=made.filter(i=>i.rules),ruleRate=k=>checked.length?rate(checked.filter(i=>i.rules[k]).length,checked.length):'—';
  return {generated:made.length,total:rows.length,reviewed:reviewed.length,
    autoFacts:ruleRate('facts'),autoBrand:ruleRate('brand'),facts:rate(reviewed.filter(i=>i.review.facts==='pass').length,reviewed.length),
    tone:reviewed.length?(reviewed.reduce((s,i)=>s+i.review.tone,0)/reviewed.length).toFixed(1)+'/5':'待审',
    pass:rate(reviewed.filter(i=>i.review.decision==='pass').length,reviewed.length)};
}
async function qualityStart(p){
  if(job||agentActive)throw Error('请先完成或停止正在执行的任务。');
  const {book,suite,choice}=qualityChoice(p),config=qualityConfig();
  const r={id:id(),pid:p.id,kind:'evaluation',suiteId:suite.id,rubric:suite.rubric,created:Date.now(),name:config.name,provider:config.cfg.provider,signature:config.signature,
    budget:{limit:readTokenLimit(choice.budget),reported:0,held:0},status:'pending',items:suite.cases.map(c=>({caseId:c.id,status:'pending'}))};
  const prior=book.runs.filter(x=>x.suiteId===suite.id).at(-1);
  book.runs.push(r);p.evaluation=book;choice.a=prior?.id||r.id;choice.b=prior?r.id:'';
  qualitySave(p);await qualityContinue(p,r,config);
}
async function qualityContinue(p,r,connection){
  if(job||agentActive)throw Error('请先完成或停止正在执行的任务。');
  const model=connection||qualityConfig();
  if(model.signature!==r.signature)throw Error('续跑需连接创建此组时使用的模型和服务地址。比较其他模型请新开一组。');
  const suite=p.evaluation.suites.find(s=>s.id===r.suiteId);
  const ctrl=new AbortController(),ctx={pid:p.id,runId:r.id,budgetRun:r};diagContexts.set(ctrl.signal,ctx);
  const activeJob={pid:p.id,ctrl,message:'准备营销评测'};job=activeJob;
  const run=async()=>{
    budgetRecover(r);let current;
    try{
      r.status='running';delete r.error;qualitySave(p);
      for(const [i,item] of r.items.entries()){
        if(item.status==='done')continue;
        current=item;ctrl.signal.throwIfAborted();
        const c=suite.cases.find(x=>x.id===item.caseId);
        ctx.step='评测 · '+c.name;job.message=`${r.name} · ${i+1}/${r.items.length} · ${c.name}`;
        item.status='running';delete item.error;qualitySave(p);if(db.active===p.id)render();
        const answer=await callModel('generate',c,c,ctrl.signal,model.cfg);
        ctrl.signal.throwIfAborted();
        const card=checkedCard(answer.result,c.brief,c.market,c.platform,c.direction);
        const issues=audit(card,c.brief),rules={facts:!issues.some(i=>i.topic==='fact'),brand:!issues.some(i=>i.topic==='brand')};
        Object.assign(item,{status:'done',engine:answer.engine,card,issues,rules,finished:Date.now()});qualitySave(p);
      }
      r.status='done';
    }catch(e){
      r.status=ctrl.signal.aborted||e.action==='budget'?'paused':'failed';r.error=ctrl.signal.aborted?'已停止，已完成的案例可以审阅。':e.message;
      if(current&&current.status!=='done'){current.status=r.status;current.error=r.error;}
      await diagError(e,ctx.step||'营销评测',ctx,r.status==='paused'?'blocked':'error');
    }finally{r.updated=Date.now();save();}
  };
  try{
    if(globalThis.navigator?.locks?.request){
      await navigator.locks.request('meridian-evaluation-'+r.id,{ifAvailable:true},async lock=>{
        if(!lock)throw Error('此组评测已在另一窗口执行。');
        const latest=JSON.parse(localStorage.getItem(storeKey)||'null')?.projects.find(x=>x.id===p.id)?.evaluation?.runs.find(x=>x.id===r.id);
        if(latest&&!saveFailed)Object.assign(r,latest);
        if(r.status!=='done')await run();
      });
    }else if(r.status!=='done')await run();
  }finally{if(job===activeJob)job=null;if(db.active===p.id)render();}
}
