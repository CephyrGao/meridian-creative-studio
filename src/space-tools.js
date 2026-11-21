const spaceBuiltinTools=[
  ['web-search','联网搜索','globe','通过工作区选定的搜索服务查找资料，返回标题、链接和摘要。',/联网搜|搜索(服务|网页|资料|市场|竞品)|网上查|web.?search|search the web/i],
  ['fetch-url','读取网页 · FetchURL','globe','读取指定公开 URL 的正文并保留原文地址。',/https?:\/\/|fetch.?url|读取网页|抓取网页/i],
  ['read-files','读取文件','file','从工作区上传的 Word、Excel、PDF 或文本提取相关段落，标注页码、行号或单元格。',/读.{0,6}(附件|文件|文档|表格|pdf|word|excel)|根据.{0,5}(附件|文档|表格)|read.files/i],
  ['memory-recall','检索本地记忆','history','查找当前项目与工作区的品牌约定、偏好和长期笔记。',/本地记忆|回忆|查.{0,3}记忆|已记住|memory.recall/i],
  ['find-skills','发现技能 · find-skills','layers','搜索已安装技能和内置可安装目录，查看用途并安装。',/find.skills|找.{0,4}技能|发现技能|搜索技能/i],
  ['skill-creator','创建技能 · skill-creator','plus','把一段任务说明整理为可编辑的 SKILL.md 草稿。',/skill.creator|创[建作].{0,4}技能|新[建增].{0,4}技能/i]
];
for(const [name,title,icon,description,match] of spaceBuiltinTools)AGENT_BUILTINS.push({name,title,icon,description,match,example:description});
const spaceCatalog=[
  ['brand-voice-editor','品牌语气审校','按品牌语气逐句检查文案，并给出可直接替换的版本。','摘录当前 Brief 的语气、必用词和禁用词。逐句列出原文、修改稿和原因，引用输入来源；缺少原文时列出待补充项。'],
  ['competitor-evidence','竞品证据表','把联网结果、网页和文档整理为带出处的竞品对照表。','按品牌、渠道、宣称、支持原文和来源制作表格。逐项标注来源编号，区分观察事实与推断。将没有证据的项目留空。'],
  ['weekly-market-brief','市场周报','根据本周资料撰写简报并列出可验证的行动建议。','用报告日期界定本周。按市场整理来源与证据日期，写三项变化、相关原文和建议。如果没有本周记录，明确资料时间范围。'],
  ['sheet-insights','表格洞察','从已选工作表数据提取异常、趋势和后续核对项。','从提供的工作表、行号和单元格中提取指标。交代分母与币种，给出观察和原始位置，仅在样本足够时比较趋势。']
].map(([name,title,description,body])=>agentInstructions(name,description,'# '+title+'\n\n'+body));
let spacePublicSkills=null;
const spacePublicCatalog='https://api.github.com/repos/anthropics/skills/contents/skills';
async function spaceLoadPublicSkills(p){
  const refs=await spaceResearch('fetch',spacePublicCatalog,p),rows=JSON.parse(refs[0].text);
  if(!Array.isArray(rows))throw Error('公开技能目录返回了无法识别的数据。');
  spacePublicSkills=rows.filter(x=>x.type==='dir'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x.name)).map(x=>x.name).sort();
}
function spaceFindSkills(query){
  const installed=new Map(agentLibrary().map(s=>[s.name,s])),rows=[...installed.values(),...spaceCatalog.filter(s=>!installed.has(s.name))];
  const terms=spaceTerms(String(query||'').replace(/find.skills|帮我|查找|寻找|发现|搜索|技能|适合/g,' '));
  return rows.map(s=>({s,installed:installed.has(s.name),score:spaceRank(s.name+' '+s.title+' '+s.description,terms)}))
    .filter(x=>!terms.length||x.score>0).sort((a,b)=>b.score-a.score||Number(a.installed)-Number(b.installed));
}
function spaceSkillDraft(goal){
  const title=String(goal||'自定义营销技能').replace(/^(?:请|帮我)?(?:创建|新建|新增)(?:一个|一项)?(?:技能)?[：:\s]*/,'').trim().slice(0,65)||'自定义营销技能';
  const slug=(title.toLowerCase().match(/[a-z0-9]+/g)||[]).join('-').slice(0,42);
  return agentInstructions((slug||'marketing-skill')+'-'+id().replace(/[^a-z0-9]/gi,'').slice(0,7).toLowerCase(),'用于'+title+'。',`# ${title}\n\n## 目标\n${goal}\n\n## 执行步骤\n1. 核对当前 Brief、工作区约定和用户选定的资料。\n2. 根据目标整理证据，每个关键判断注明来源编号。\n3. 给出可交付的结果、资料缺口和下一步。`);
}
function spaceRunInputs(draft){
  return {query:String(draft.webQuery||'').trim().slice(0,500),url:String(draft.webUrl||'').trim().slice(0,4096),files:[...new Set(draft.files||[])].slice(0,20)};
}
function spaceToolRefs(refs,title){
  return {headline:refs.length?title+' · '+refs.length+' 条':'没有匹配结果',text:refs.length?refs.map(r=>`${r.label}\n${agentClip(r.text,1300)}${r.url?'\n'+r.url:''}`).join('\n\n'):'没有找到匹配的资料。',source:title,refs:refs.map(r=>({...r,text:agentClip(r.text,2400)}))};
}
async function spaceToolRun(name,p,run,signal,config){
  const wid=spaceOf(p),inputs=run.inputs||{};
  if(name==='read-files'){
    let refs;try{refs=await spacePassages(wid,inputs.files,run.goal);}catch(e){throw new AgentNeeds(e.message,'files');}
    if(!refs.length)throw new AgentNeeds('请在当前工作区上传并选择资料，或在任务目标里写出要查的内容。','files');
    return spaceToolRefs(refs,'工作区文档');
  }
  if(name==='web-search'||name==='fetch-url'){
    let q=inputs.query||run.goal.replace(/^(?:帮我|请)?(?:联网搜索|搜索网页|联网查找|搜索)[：:\s]*/,'').slice(0,500);
    if(name==='fetch-url'){q=inputs.url||run.goal.match(/https?:\/\/[^\s<>"，。；）】]+/i)?.[0];if(!q)throw new AgentNeeds('请在任务的「资料与联网」填写网页 URL。','inputs');}
    return spaceToolRefs(await spaceResearch(name==='fetch-url'?'fetch':'search',q,p,signal),name==='fetch-url'?'网页正文':spaceEngines[spaceEngine(wid)]);
  }
  if(name==='memory-recall'){
    const notes=spaceNotes(wid),terms=spaceTerms(run.goal),matches=notes.map(n=>({n,score:spaceRank(n.title+' '+n.text,terms)})).sort((a,b)=>b.score-a.score);
    const refs=[{label:'项目记忆',text:agentRecords.get('memory/'+p.id)?.text},{label:'工作区约定',text:spaceInfo(wid).instructions},...matches.slice(0,8).map(({n})=>({label:n.title,text:n.text}))].filter(r=>r.text);
    return spaceToolRefs(refs,'本地记忆');
  }
  if(name==='find-skills'){
    const rows=spaceFindSkills(run.goal);return {headline:'匹配到 '+rows.length+' 项技能',text:rows.map(({s,installed})=>(installed?'已安装':'可安装')+' · '+s.name+'\n'+s.description).join('\n\n')||'没有匹配项，可以创建或导入 SKILL.md。',source:'本机技能库与内置目录',skillQuery:run.goal};
  }
  let skill=spaceSkillDraft(run.goal);
  if(config){
    const written=await agentWrite(p,run,{name,body:'为用户的任务编写一份可复用的中文 SKILL.md。正文用一级标题命名，说明适用条件、所需输入、执行步骤与验收标准。留给用户审阅，使用通用变量代替本次项目里的名称或账户。'},config,signal);
    skill=agentInstructions(skill.name,skill.description,agentClip(written.text,24000));
    return {...written,skillDraft:skill};
  }
  return {headline:skill.title,text:skill.body,source:'本地技能草稿',skillDraft:skill};
}
function spaceAgentFields(p,draft){
  const wid=spaceOf(p),docs=spaceFileCache.get(wid)||[];
  return `<details class="agent-scope" id="space-agent-inputs" ${draft.openInputs?'open':''}><summary>资料与联网</summary><div class="stack">
    <div class="rowline"><strong>工作区文件</strong>${btn('上传文件','space-agent-upload','upload','small')}</div>
    ${docs.length?`<div class="space-checks">${docs.map(f=>`<label><input type="checkbox" class="space-run-file" value="${h(f.id)}" ${(draft.files||[]).includes(f.id)?'checked':''}>${h(f.name)}</label>`).join('')}</div>`:'<small class="hint">可上传 Word、Excel、PDF 或文本作为本次任务资料。</small>'}
    <label class="field"><span>联网搜索词</span><input id="space-run-query" maxlength="500" value="${h(draft.webQuery||'')}" placeholder="填写后，任务先搜索再执行"></label>
    <label class="field"><span>读取网页 URL</span><input id="space-run-url" type="url" value="${h(draft.webUrl||'')}" placeholder="https://…"></label></div></details>`;
}
