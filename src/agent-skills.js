const AGENT_BUILTINS=[
  {name:'brief-check',title:'Brief 诊断',icon:'file',description:'检查产品、受众、品牌约束与证据是否足够，列出需要补问的资料。',example:'检查这份 Brief，告诉我哪些资料还需要补。',
    match:/^(?:brief|需求诊断)$|(?:检查|诊断|审核|补全|check|review).{0,12}brief|brief.{0,12}(?:诊断|缺|补全|检查)|需求诊断|缺什么|资料缺口|补问|检查需求/i},
  {name:'source-research',title:'素材与竞品研究',icon:'quote',description:'从项目素材和 MCP 查询结果中提取可引用证据，整理竞品差异与待核实项。',example:'整理现有素材里能引用的证据，标出来源。',
    match:/竞品|调研|用户反馈|研究|证据整理|整理.{0,8}(证据|参考|素材)|research|competitor/i},
  {name:'channel-fit',title:'市场与渠道适配',icon:'globe',description:'核对目标市场语言、渠道版位、正文限制和执行建议。',example:'为当前目标市场整理语言和渠道版位要求。',
    match:/渠道适配|市场适配|版位|本地化要求|市场语言|渠道.{0,8}(适配|要求|规范)|channel|placement/i},
  {name:'creative-script',title:'15 秒广告脚本',icon:'frame',description:'根据 Brief、参考资料和任务目标撰写指定市场的一条四镜头广告。',example:'为当前市场写一条 15 秒场景种草脚本。',
    match:/脚本|分镜|写.{0,8}(文案|广告|创意)|生成.{0,8}(文案|广告|创意)|storyboard|copywriting/i},
  {name:'creative-check',title:'创意质检',icon:'shield',description:'定位文案或分镜中的品牌、事实与渠道问题，给出带字段位置的修改建议。',example:'检查这条广告文案，列出需要修改的原句。',
    match:/质检|审稿|审核|复核|合规|校对|检查.{0,10}(文案|广告|创意|脚本)|audit/i},
  {name:'campaign-review',title:'投放复盘',icon:'chart',description:'计算实际投放指标，在同市场、渠道、受众里比较素材并定位转化问题。',example:'找出点击高但转化差的素材，再给我下一轮 A/B 测试方案。',
    match:/复盘|投放表现|点击|转化差|转化低|转化率|投放数据|表现.{0,5}(好|差)|分析.{0,8}(素材|投放)|CTR|CVR|CPA|performance/i},
  {name:'experiment-design',title:'A/B 实验设计',icon:'beaker',description:'依据复盘观察，设计单变量对照实验，指定主要指标、观察指标和下一轮 Brief。',example:'根据本轮表现，为下一轮设计一个 A/B 实验。',
    match:/实验|下一轮|对照组|单变量|\bA\s*[/-]\s*B\b|\bAB\s*(?:测试|test)/i}
];
const agentPrefix='meridian-agent-v1/';
const agentRecords=new Map();
const agentVolatile=new Set();
try {
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(!key?.startsWith(agentPrefix))continue;
    try {agentRecords.set(key.slice(agentPrefix.length),JSON.parse(localStorage.getItem(key)));} catch {}
  }
} catch {}
function agentPut(key,value) {
  agentRecords.set(key,value);
  try{localStorage.setItem(agentPrefix+key,JSON.stringify(value));agentVolatile.delete(key);}
  catch{agentVolatile.add(key);}
}
function agentLibrary() {
  const custom=Array.from(agentRecords).filter(([key])=>key.startsWith('skill/')).map(([,s])=>s);
  return [...AGENT_BUILTINS,...custom].map(s=>({...s,enabled:!agentRecords.get('off/'+s.name)}));
}
function agentRunsFor(pid) {
  return Array.from(agentRecords).filter(([key,r])=>key.startsWith('run/')&&r.pid===pid)
    .map(([,r])=>r).sort((a,b)=>b.created-a.created);
}
function agentInstructions(name,description,body) {
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)||name.length>64)throw Error('技能标识需使用 1–64 个小写字母、数字或单个连字符。');
  if(!description.trim()||description.trim().length>1024)throw Error('用途说明需为 1–1,024 字。');
  if(!body.trim()||body.trim().length>24000)throw Error('执行说明需为 1–24,000 字。');
  const title=body.match(/^#\s+(.+)$/m)?.[1]?.trim().slice(0,80)||name;
  return {name,title,description:description.trim(),body:body.trim(),custom:true,icon:'layers'};
}
// Only the two text fields used by the single-file workflow are interpreted.
function agentParseSkill(text) {
  const lines=String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  const end=lines.findIndex((s,i)=>i>0&&/^(?:---|\.\.\.)[ \t]*$/.test(s));
  if(!/^---[ \t]*$/.test(lines[0])||end<1)throw Error('SKILL.md 需要由 --- 括起的 name 和 description。');
  const fields=Object.create(null);
  for(let i=1;i<end;i++){
    const match=/^(name|description):(?:[ \t]+(.*)|[ \t]*)$/.exec(lines[i]);
    if(!match)continue;
    const key=match[1];if(Object.hasOwn(fields,key))throw Error('元数据字段重复：'+key);
    let raw=(match[2]||'').trim(),extra=[];
    if(/^[|>][+-]?(?:\s+#.*)?$/.test(raw) || !raw || !/^["']/.test(raw)){
      while(i+1<end && (/^[ \t]+/.test(lines[i+1]) || !lines[i+1].trim()))extra.push(lines[++i].trim());
    }
    if(/^[|>][+-]?(?:\s+#.*)?$/.test(raw))raw=extra.join(raw[0]==='|'?'\n':' ').trim();
    else if(raw[0]==='"'){
      const part=raw.match(/^("(?:\\.|[^"\\])*")\s*(?:#.*)?$/);
      if(!part)throw Error('请检查 '+key+' 的引号。');raw=JSON.parse(part[1]);
    }else if(raw[0]==="'"){
      const part=raw.match(/^'((?:''|[^'])*)'\s*(?:#.*)?$/);
      if(!part)throw Error('请检查 '+key+' 的引号。');raw=part[1].replace(/''/g,"'");
    }else{
      if(/^[&*!\{\[]/.test(raw))throw Error('请把 '+key+' 写为普通文本。');
      raw=[raw.replace(/\s+#.*$/,''),...extra].filter(Boolean).join(' ');
    }
    fields[key]=raw.trim();
  }
  return agentInstructions(fields.name||'',fields.description||'',lines.slice(end+1).join('\n'));
}
const agentDrafts=new Map(),agentSelection=new Map(),agentToolInputs=new Map();
let agentActive=null;
function agentDraft(p) {
  if(!agentDrafts.has(p.id))agentDrafts.set(p.id,{goal:'',pick:'',market:'',platform:'',direction:'scene',tool:'',args:'{}'});
  return agentDrafts.get(p.id);
}
function agentLocalPlan(goal,skills) {
  const matches=skills.filter(s=>{
    if(!s.custom)return s.match.test(goal);
    const q=goal.toLowerCase();return q.includes(s.name)||q.includes(s.title.toLowerCase());
  });
  return matches.map(s=>s.name);
}
function agentScope(p,form) {
  const b=p.brief,q=form.goal;
  function mentions(label,code=false){
    if(!label)return false;
    if(/\p{Script=Han}/u.test(label))return q.includes(label);
    const literal=label.replace(/[.*+?^$(){}|[\]\\]/g,'\\$&');
    return new RegExp('(?:^|[^A-Za-z0-9])'+literal+'(?=$|[^A-Za-z0-9])',code?'':'i').test(q);
  }
  function mentioned(ids,match,label){
    const hits=ids.filter(match);
    if(hits.length>1&&hits.length<ids.length)throw Error('本次目标指定了多个'+label+'。请在执行范围中选择其中一个，或将目标改为全部'+label+'。');
    return hits.length===1?hits[0]:'';
  }
  const market=form.market||mentioned(b.markets,k=>mentions(k,true)||mentions(MARKETS[k]?.alpha3,true)
    ||[MARKETS[k]?.name,MARKETS[k]?.english,...(MARKET_ALIASES[k]||[])].some(s=>mentions(s)),'市场');
  const platform=form.platform||mentioned(b.platforms,k=>[k,platformLabel(k),...(PROFILE[k]?.keys||[])].some(s=>mentions(s)),'渠道');
  const direction=/痛点/.test(q)?'pain':/社会证明|口碑/.test(q)?'proof':form.direction||'scene';
  return {market,platform,direction};
}
function agentFingerprint(value){
  const raw=JSON.stringify(value);let a=2166136261;
  for(let i=0;i<raw.length;i++)a=Math.imul(a^raw.charCodeAt(i),16777619);
  return raw.length+'-'+(a>>>0).toString(36);
}
function agentScopeRows(p,scope){
  if(!scope.market && !scope.platform)return p.data;
  return p.data.filter(r=>(!scope.market||resolveMarket(r.country)===scope.market)&&(!scope.platform||resolvePlatform(r.platform)===scope.platform));
}
function agentClip(text,n){const s=String(text??'');return s.length<=n?s:s.slice(0,n-1)+'…';}
class AgentNeeds extends Error {
  constructor(message,action){super(message);this.action=action;}
}
function agentSources(p,run) {
  const refs=[];
  const add=(label,text)=>{if(typeof text==='string'&&text.trim())refs.push({id:'S'+(refs.length+1),label,text:agentClip(text.trim(),6500)});};
  add(p.brief.source||'Brief 中的反馈（未填出处）',p.brief.evidence);
  add('Brief 素材摘要',p.brief.assetNotes);
  for(const a of p.assets||[])add(a.name,a.text);
  const external=run.steps.find(s=>s.name==='@mcp'&&s.status==='done');
  if(external)add(external.result.source,external.result.text);
  for(const s of run.steps)if(s.status==='done')for(const r of (s.result?.refs||[]).slice(0,8))if(refs.length<26)add(r.label+(r.url?' · '+r.url:''),r.text);
  return refs;
}
