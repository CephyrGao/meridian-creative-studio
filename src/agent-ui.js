const AGENT_STATUS={queued:'已创建',planning:'规划中',pending:'待执行',running:'执行中',done:'已完成',paused:'已暂停',blocked:'待补充',failed:'执行失败'};
function agentStatus(status,active){
  return !active&&(status==='planning'||status==='running'||status==='queued')?'可继续':AGENT_STATUS[status]||status;
}
function agentView(p){
  const draft=agentDraft(p),skills=agentLibrary().filter(s=>s.enabled);
  const runs=agentRunsFor(p.id),current=agentCurrentRun(p);
  const readTools=typeof mcpConnection!=='undefined'?mcpConnection?.tools.filter(t=>t.annotations?.readOnlyHint===true)||[]:[];
  const available=skills.some(s=>s.name===draft.pick);
  if(draft.pick&&!available)draft.pick='';
  const savedMemory=agentRecords.get('memory/'+p.id)?.text;
  const extras=`<details id="agent-scope" class="agent-scope" ${draft.expanded?'open':''}><summary>执行范围与 MCP 资料</summary><div class="stack"><div class="agent-scope-fields">
    <label class="field"><span>市场</span><select id="agent-market">${option('','按目标选择',draft.market)}${p.brief.markets.map(k=>option(k,MARKETS[k].name,draft.market)).join('')}</select></label>
    <label class="field"><span>渠道</span><select id="agent-platform">${option('','按目标选择',draft.platform)}${p.brief.platforms.map(k=>option(k,platformLabel(k),draft.platform)).join('')}</select></label>
    <label class="field"><span>脚本方向</span><select id="agent-direction">${Object.entries(DIRECTIONS).map(([k,d])=>option(k,d.name,draft.direction)).join('')}</select></label></div>
    ${readTools.length?`<label class="field"><span>本次可查询的 MCP 工具</span><select id="agent-tool">${option('','仅使用项目资料',draft.tool)}${readTools.map(t=>option(t.name,t.title||t.name,draft.tool)).join('')}</select></label>
    ${draft.tool?`<label class="field"><span>工具参数（JSON）</span><textarea id="agent-args" rows="3" spellcheck="false">${h(draft.args)}</textarea></label>`:''}`:
    `<small class="hint">本次使用项目资料。在「设置 → MCP 连接」接入的只读工具也可供任务选择。</small>`}</div></details>`;
  const form=`<section class="panel agent-composer"><label class="field"><span>任务目标</span><textarea id="agent-goal" rows="3" maxlength="2000" placeholder="例如：找出点击高但转化差的素材，再给我下一轮 A/B 测试方案。">${h(draft.goal)}</textarea></label>
    <div class="agent-start"><label class="field"><span>执行方式</span><select id="agent-pick">${option('','自动选择技能',draft.pick)}${skills.map(s=>option(s.name,s.title,draft.pick)).join('')}</select></label>
    <label class="field agent-budget-field"><span>任务 Token 预算</span><input id="agent-budget" type="number" min="1" step="1" placeholder="留空不限" value="${h(draft.budget||'')}"></label><button class="btn primary" type="button" data-act="agent-start" ${agentActive||job?'disabled':''}>${ico('play')}开始任务</button></div><small class="hint">${modelName()?'模型 · '+h(modelName())+' · 按任务读取项目资料':'本地模式 · 可直接诊断 Brief、复盘数据和设计实验'}</small>${spaceAgentFields(p,draft)}${extras}</section>`;
  const examples=!current?`<div class="agent-examples">${[['campaign-review','复盘并设计 A/B 测试'],['brief-check','检查 Brief 缺口'],['creative-script','起草 15 秒脚本']].filter(([n])=>skills.some(s=>s.name===n)).map(([n,l])=>btn(l,'agent-example','','small',n)).join('')}</div>`:'';
  const history=runs.length?`<div class="agent-history">${runs.map(r=>`<button type="button" data-act="agent-history" data-id="${h(r.id)}" aria-current="${r.id===current?.id}" class="${r.id===current?.id?'selected':''}"><strong>${h(r.goal)}</strong><small>${h(new Date(r.created).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))} · ${h(agentStatus(r.status,agentActive?.id===r.id))}</small></button>`).join('')}</div>`:'<p class="hint">本项目的任务和执行结果会保存在这里。</p>';
  const right=`<aside class="stack agent-aside">${panel('任务记录',history)}
    ${panel('项目记忆',savedMemory?`<p class="agent-memory-preview">${h(agentClip(savedMemory,180))}</p>`:'<p class="hint">把常用的品牌语气、受众偏好或写作约定留给后续任务。</p>',btn(savedMemory?'编辑':'添加','agent-memory','edit','small'))}</aside>`;
  return head('Agent 工作台',p.brief.name||'当前营销项目')+
    `<div class="agent-layout"><div class="stack">${form}${examples}${current?agentRunView(p,current):''}</div>${right}</div>`;
}
function agentRunView(p,r){
  const active=agentActive?.id===r.id,canResume=!active&&r.status!=='done';
  const meta=[r.planner,r.scope.market?MARKETS[r.scope.market]?.name:null,r.scope.platform?platformLabel(r.scope.platform):null].filter(Boolean);
  const done=r.steps.filter(s=>s.status==='done').length;
  meta.push(budgetLabel(r.budget));
  const controls='<div class="buttons">'+(!active&&r.status!=='done'?btn('调整预算','agent-budget-edit','coins','small',r.id):'')+btn('调用明细','diag-run','list','small',r.id)+(active?btn('停止','agent-stop','','small'):canResume?btn('继续未完成步骤','agent-resume','play','small'):'')+'</div>';
  const suggested={files:['选择任务文件','space-inputs',''],inputs:['填写资料与联网','space-inputs',''],web:['配置搜索服务','settings-tab','api'],brief:['填写 Brief','nav','brief'],creative:['打开创意工坊','nav','creative'],csv:['导入投放 CSV','import-csv',''],model:['连接模型','connect',''],
    mcp:['连接 MCP 服务','mcp-open',''],skills:['管理本地技能','settings-tab','skills'],tool:['填写工具参数','agent-scope-open','']};
  const next=suggested[r.help];
  const heading=`<div class="agent-run-top"><div><small class="hint">${h(agentStatus(r.status,active))}${r.steps.length?' · '+done+'/'+r.steps.length+' 步':''}</small><h2>${h(r.goal)}</h2><small class="hint">${h(meta.join(' · '))}</small></div>${controls}</div>`;
  const notice=r.error?`<div class="agent-notice" role="status">${h(r.error)}${next?btn(next[0],next[1],'','small',next[2]):''}</div>`:'';
  const warning=agentVolatile.has('run/'+r.id)?'<div class="agent-notice" role="status">本机存储空间不足，本次任务仅保存在当前窗口。</div>':'';
  const steps=r.steps.map((s,i)=>{
    const out=s.result;
    const status=agentStatus(s.status,active);
    if(!out)return `<div class="agent-step"><span class="agent-step-mark">${i+1}</span><div><strong>${h(s.title)}</strong><small>${h(status)}</small></div></div>`;
    let action='';
    if(out.experiment)action=btn(out.appliedPid?'打开下一轮 Brief':'创建下一轮 Brief','agent-apply','plus','small',s.name);
    else if(out.card){
      const label=out.appliedPid?'打开已保存创意':!out.generated?'查看已有脚本':p.cards.some(c=>c.id===out.card.id)?'另存为下一轮创意':'保存到创意工坊';
      action=btn(label,'agent-apply','frame','small',s.name);
    }else if(out.checkedId&&out.semantic&&!out.fromDraft)action=btn(out.appliedPid?'打开审阅':'采用复核结果并审阅','agent-apply','shield','small',s.name);
    else if(out.open)action=btn({report:'查看投放复盘',audit:'打开审核队列',brief:'打开营销 Brief'}[out.open]||'打开','nav','','small',out.open);
    if(out.skillDraft)action=btn('编辑并保存技能','space-draft-skill','edit','small',r.id);
    if(out.skillQuery)action=btn('查看与安装技能','space-find','layers','small',out.skillQuery);
    if(active)action='';
    return `<details class="agent-result" ${i===r.steps.length-1||r.steps.length===1?'open':''}><summary><span class="agent-step-mark done">${ico('check')}</span><span><strong>${h(s.title)}</strong><small>${h(out.headline)}</small></span></summary><div class="agent-result-body">
      <div class="agent-prose">${h(out.text)}</div><p class="agent-source">${ico('file')}${h(out.source||'项目数据')}</p>${action}</div></details>`;
  }).join('');
  return `<section class="panel agent-run" aria-label="任务进度">${heading}${notice}${warning}${steps}</section>`;
}
function agentLibraryView(){
  const catalog=agentLibrary();
  const list=catalog.map(s=>`<div class="agent-skill-row"><div class="agent-skill-icon">${ico(s.icon)}</div><div class="agent-skill-copy"><strong>${h(s.title)}</strong><small>${h(s.description)}</small></div>
    <div class="buttons"><button class="agent-switch" type="button" role="switch" aria-label="${h(s.title)}" aria-checked="${s.enabled}" data-act="agent-toggle" data-id="${h(s.name)}">${s.enabled?'已启用':'已停用'}</button>
    ${s.custom?btn('编辑','agent-edit','','small',s.name):''}${s.enabled?btn('使用','agent-use','','small',s.name):''}</div></div>`).join('');
  return panel('本地技能',`<div class="agent-library">${list}</div>`,`<div class="buttons">${btn('发现技能','space-find','layers','small')}${btn('导入 SKILL.md','agent-import','upload','small')}${btn('新建技能','agent-new','plus','primary small')}</div>`);
}
function agentEditor(s={},original=''){
  openDialog(original?'编辑技能':'添加技能',`<div class="stack"><label class="field"><span>技能标识</span><input id="agent-name" maxlength="64" value="${h(s.name||'')}" placeholder="brand-voice-review" ${original?'readonly':''}></label>
    <label class="field"><span>何时使用这个技能</span><textarea id="agent-desc" maxlength="1024" rows="2" placeholder="检查社交媒体文案是否符合品牌语气，并逐句给出修改稿。">${h(s.description||'')}</textarea></label>
    <label class="field"><span>执行说明（Markdown）</span><textarea id="agent-body" maxlength="24000" rows="8" placeholder="# 品牌语气审校&#10;读取当前 Brief 的语气要求，摘出原句，给出改写并说明理由。">${h(s.body||'')}</textarea>
    <small class="hint">支持含 name、description 和正文的单文件指令型技能。步骤由已连接的模型执行，素材从当前项目读取。</small></label></div>`,
    btn('返回本地技能','agent-library')+(original?btn('导出 SKILL.md','space-export-skill','download','',original):'')+btn('保存并启用','agent-save','check','primary',original));
}
function agentMemoryDialog(p){
  openDialog('项目记忆',`<label class="field"><span>${h(p.brief.name||'当前项目')} 的长期约定</span><textarea id="agent-memory-text" rows="6" maxlength="2400" placeholder="例如：面向通勤者，文案尽量用短句，避免制造焦虑。">${h(agentRecords.get('memory/'+p.id)?.text||'')}</textarea><small class="hint">后续脚本创作和模型分析会读取这些约定。</small></label>`,btn('保存约定','agent-save-memory','check','primary'));
}
async function agentAction(action,value){
  const p=project(),draft=agentDraft(p),run=agentCurrentRun(p);
  switch(action){
    case 'agent-start':return agentStart(p);
    case 'agent-budget-edit':case 'agent-budget-save':{const r=agentRecords.get('run/'+value);if(!r||r.pid!==p.id)return;if(action==='agent-budget-edit')return budgetDialog(r);return changeBudget(p,r,$('#budget-change').value);}
    case 'agent-stop':if(agentActive?.id===(value||run?.id))agentActive.ctrl.abort();return;
    case 'agent-track':if(agentActive){agentSelection.set(agentActive.pid,agentActive.id);go('agent');}return;
    case 'agent-resume':if(run)return agentResume(p,run);return;
    case 'agent-history':agentSelection.set(p.id,value);render();return;
    case 'agent-apply':if(run)agentApplyResult(p,run,value);return;
    case 'agent-library':go('settings/skills');return;
    case 'agent-import':pickFile('agent-skill','.md,text/markdown');return;
    case 'agent-new':agentEditor();return;
    case 'agent-edit':{const s=agentRecords.get('skill/'+value);if(s)agentEditor(s,s.name);return;}
    case 'agent-save':{
      const s=agentInstructions($('#agent-name').value.trim(),$('#agent-desc').value,$('#agent-body').value);
      if((value && value!==s.name)||agentLibrary().some(x=>x.name===s.name&&(!value||!x.custom)))throw Error('该技能标识已存在，请使用另一个标识。');
      agentPut('skill/'+s.name,s);agentPut('off/'+s.name,false);go('settings/skills');
      toast(agentVolatile.has('skill/'+s.name)?'空间不足，技能仅在本窗口可用。':'技能已启用。');return;
    }
    case 'agent-toggle':{const s=agentLibrary().find(x=>x.name===value);if(s){agentPut('off/'+value,s.enabled);render();}return;}
    case 'agent-example':case 'agent-use':{
      const s=agentLibrary().find(x=>x.name===value&&x.enabled);if(!s)return;
      draft.pick=action==='agent-use'?s.name:'';if(action==='agent-example'||!draft.goal.trim())draft.goal=s.example||s.description;
      go('agent');$('#agent-goal').focus();return;
    }
    case 'agent-memory':agentMemoryDialog(p);return;
    case 'agent-save-memory':agentPut('memory/'+p.id,{text:$('#agent-memory-text').value.trim().slice(0,2400),updated:Date.now()});closeDialog();render();
      toast(agentVolatile.has('memory/'+p.id)?'空间不足，项目记忆仅在本窗口可用。':'项目记忆已保存。');return;
    case 'agent-scope-open':draft.expanded=true;render();$('#agent-scope').scrollIntoView({block:'nearest'});return;
  }
}
function agentFormChange(e){
  const draft=agentDraft(project()),id=e.target.id;
  const names={'agent-budget':'budget','agent-goal':'goal','agent-pick':'pick','agent-market':'market','agent-platform':'platform','agent-direction':'direction','agent-args':'args'};
  if(names[id])draft[names[id]]=e.target.value;
  if(id==='agent-tool'&&e.type==='change'){
    const tool=mcpConnection?.tools.find(t=>t.name===e.target.value);
    draft.tool=tool?.name||'';draft.args=tool?mcpSeed(tool.inputSchema):'{}';draft.expanded=true;render();
  }
}
document.addEventListener('toggle',e=>{if(e.target.id==='agent-scope'&&e.target.isConnected)agentDraft(project()).expanded=e.target.open;},true);
window.addEventListener('storage',e=>{
  if(!e.key?.startsWith(agentPrefix))return;
  const key=e.key.slice(agentPrefix.length);
  if(agentVolatile.has(key))return;
  try{if(e.newValue==null)agentRecords.delete(key);else agentRecords.set(key,JSON.parse(e.newValue));}catch{return;}
  if((page==='agent'&&!agentActive)||(settingsAt('skills')&&!$('#dialog').open&&(key.startsWith('skill/')||key.startsWith('off/'))))render();
});
