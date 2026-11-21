let spaceViewer=null,spaceSearchTerm='',spaceFiltered=null;
const spaceFreq={once:'一次',daily:'每天',weekly:'每周',interval:'固定间隔'};
const spaceWhen=(ms,zone)=>ms?new Date(ms).toLocaleString('zh-CN',{timeZone:zone,hour12:false}):'—';
function spaceView(p){
  const wid=spaceOf(p),w=spaceInfo(wid),docs=spaceFileCache.get(wid)||[];
  const tabs=[['files','文件资料'],['memory','本地记忆'],['web','联网检索'],['timers','定时任务']];
  let content='';
  if(spaceTab==='files'){
    const shown=spaceFiltered?.wid===wid?docs.filter(f=>spaceFiltered.ids.includes(f.id)):docs;
    content=panel('文件资料',`<div class="space-toolbar"><input id="space-file-search" aria-label="搜索文件和正文" value="${h(spaceSearchTerm)}" placeholder="搜索文件名或正文">${btn('查找','space-file-search','search','small')}</div>
      <div class="space-list">${shown.map(f=>`<div class="rowline listrow"><div><strong>${h(f.name)}</strong><small class="hint">${h(f.path&&f.path!==f.name?f.path:f.url||f.ext.toUpperCase())} · ${f.count} 段 · ${number(f.chars)} 字${f.partial?' · 已截取':''}</small></div><div class="buttons">${btn('阅读','space-read','file','small',f.id)}${btn('移除','space-remove-doc','','small',f.id)}</div></div>`).join('')||'<p class="hint">暂无匹配资料。可上传 Word、Excel、PDF、CSV 或文本。</p>'}</div>`,
      btn('上传文件','space-upload','upload','primary'));
  }else if(spaceTab==='memory'){
    const notes=spaceNotes(wid),mem=agentRecords.get('memory/'+p.id)?.text;
    content=panel('工作区记忆',`<div class="space-list">${notes.map(n=>`<div class="rowline listrow"><div><strong>${h(n.title)}</strong><small class="hint">${n.pinned?'优先用于任务':'按目标检索'} · ${h(spaceWhen(n.updated))}</small><p>${h(agentClip(n.text,200))}</p></div><div class="buttons">${btn('编辑','space-note','edit','small',n.id)}${btn('删除','space-del-note','','small',n.id)}</div></div>`).join('')||'<p class="hint">保存品牌口径、受众偏好或复盘结论。置顶记忆优先进入后续模型任务，每次最多引用五条工作区笔记。</p>'}</div>`,btn('新增记忆','space-note','plus','primary'))+
      panel('当前项目记忆',`<p>${h(mem||'尚未填写项目约定。')}</p>`,btn('编辑项目记忆','agent-memory','edit','small'));
  }else if(spaceTab==='web')content=spaceWebView(p);
  else content=spaceTimersView(wid);
  return head('项目资料',w.name+' · '+(p.brief.name||'未命名项目'),btn('切换项目','projects','folder','small'))+
    `<div class="space-tabs" aria-label="项目资料功能">${tabs.map(([k,l])=>`<button data-act="space-tab" data-id="${k}" aria-pressed="${spaceTab===k}">${l}</button>`).join('')}</div>
    <div class="stack">${spaceBusy?'<p role="status" class="hint">正在读取资料…</p>':''}${spaceNotice?`<p class="space-msg" role="status">${h(spaceNotice)}</p>`:''}${content}</div>`;
}
function spaceWebView(p){
  const wid=spaceOf(p),engine=spaceEngine(wid),pending=spaceWebPending?.wid===wid?spaceWebPending:null;
  const results=pending?`<div class="space-list">${pending.refs.map((r,i)=>`<article><strong>${h(r.label)}</strong><p>${h(agentClip(r.text,550))}</p><a href="${h(r.url)}" target="_blank" rel="noreferrer">${h(r.url)}</a><div class="buttons">${btn('存入资料库','space-save-web','plus','small',String(i))}</div></article>`).join('')||'<p>没有搜索结果。</p>'}</div>`:'';
  return panel('搜索资料',`<div class="stack"><small class="hint">使用 ${h(spaceEngines[engine])}</small>
    <div class="space-toolbar"><input id="space-search-q" aria-label="搜索关键词" placeholder="输入关键词">${btn('联网搜索','space-web-search','globe','primary')}</div></div>`)+
    panel('读取网页 · FetchURL',`<div class="space-toolbar"><input id="space-fetch-url" type="url" aria-label="公开网页地址" placeholder="https://…">${btn('读取正文','space-web-fetch','file')}</div>`)+(pending?panel('来源与正文',results):'');
}
function spaceTimersView(wid){
  const schedules=spaceSchedules().filter(s=>db.projects.some(p=>p.id===s.pid&&spaceOf(p)===wid));
  return panel('定时任务',`<div class="space-list">${schedules.map(s=>{
    const r=agentRecords.get('run/'+s.lastRun),p=db.projects.find(x=>x.id===s.pid);
    return `<article><div class="rowline"><strong>${h(s.goal)}</strong>${badge(s.enabled?'已启用':s.freq==='once'&&s.lastRun?'已触发':'已暂停',s.enabled?'green':'')}</div>
      <p>${h(p?.brief.name||'未命名项目')} · ${s.freq==='interval'?'每 '+s.minutes+' 分钟':spaceFreq[s.freq]} · ${h(s.zone)}</p><small class="hint">下次 ${h(spaceWhen(s.next,s.zone))}${s.lastRun?' · 上次 '+h(spaceWhen(s.lastAt,s.zone))+' · '+h(agentStatus(r?.status||'queued',r?.id===agentActive?.id)):''}</small>
      <div class="buttons">${btn('立即运行','space-run-now','play','small',s.id)}${s.lastRun?btn('查看结果','space-schedule-result','file','small',s.id):''}${btn('编辑','space-schedule','edit','small',s.id)}${btn(s.enabled?'暂停':'启用','space-toggle-schedule','','small',s.id)}${btn('删除','space-del-schedule','','small',s.id)}</div></article>`;}).join('')||'<p class="hint">选择一个项目、任务目标和运行时间。结果会写入该项目的 Agent 任务记录。</p>'}</div>
    <p class="hint">工作台运行时自动执行。错过多次时，下次打开补跑一次。</p>`,btn('新建定时任务','space-schedule','plus','primary'));
}
function spaceEdit(wid,create=false){
  const w=create?{name:'',instructions:''}:spaceInfo(wid);
  openDialog(create?'新建工作区':'工作区设置',`<div class="stack"><label class="field"><span>工作区名称</span><input id="space-name" maxlength="80" value="${h(w.name)}" placeholder="例如：品牌内容组"></label>
    <label class="field"><span>工作区约定</span><textarea id="space-rules" rows="4" maxlength="3500" placeholder="这个工作区默认使用的写作口径、团队约定等">${h(w.instructions||'')}</textarea></label></div>`,btn('保存','space-save','check','primary',create?'new':wid));
}
function spaceSelect(wid){
  const list=db.projects.filter(p=>spaceOf(p)===wid);if(!list.length){const p=emptyProject();p.workspaceId=wid;db.projects.push(p);list.push(p);}
  const target=list.find(q=>q.id===localStorage.getItem('meridian-last-space/'+wid))||list[0];
  spaceNotice='';spaceWebPending=null;spaceFiltered=null;spaceSearchTerm='';setProject(target.id,settingsAt('directory')?'settings/directory':'workspace');
}
function spaceNoteForm(wid,nid){
  const n=spaceNotes(wid).find(x=>x.id===nid)||{title:'',text:'',pinned:false};
  openDialog(nid?'编辑工作区记忆':'新增工作区记忆',`<div class="stack"><label class="field"><span>标题</span><input id="space-note-title" maxlength="120" value="${h(n.title)}"></label>
   <label class="field"><span>记忆内容</span><textarea id="space-note-text" maxlength="6500" rows="6">${h(n.text)}</textarea></label><label class="space-inline"><input type="checkbox" id="space-note-pin" ${n.pinned?'checked':''}>置顶，模型任务优先读取</label></div>`,btn('保存记忆','space-save-note','check','primary',nid));
}
function spaceScheduleForm(wid,sid){
  const p=project(),s=spaceSchedules().find(x=>x.id===sid)||{pid:p.id,goal:agentDraft(p).goal,pick:'',freq:'once',minutes:60,inputs:spaceRunInputs(agentDraft(p)),zone:Intl.DateTimeFormat().resolvedOptions().timeZone};
  const dt=spaceZoned(s.next||s.anchor||Date.now()+3600000,s.zone),pad=n=>String(n).padStart(2,'0'),local=dt.year+'-'+pad(dt.month)+'-'+pad(dt.day)+'T'+pad(dt.hour)+':'+pad(dt.minute);
  const files=spaceFileCache.get(wid)||[];
  openDialog(sid?'编辑定时任务':'新建定时任务',`<div class="stack"><label class="field"><span>所属项目</span><select id="timer-project">${db.projects.filter(x=>spaceOf(x)===wid).map(x=>option(x.id,x.brief.name||'未命名项目',s.pid)).join('')}</select></label>
    <label class="field"><span>任务目标</span><textarea id="timer-goal" rows="2" maxlength="2000">${h(s.goal||'')}</textarea></label>
    <div class="space-grid"><label class="field"><span>执行技能</span><select id="timer-skill">${option('','自动选择',s.pick)}${agentLibrary().filter(t=>t.enabled).map(t=>option(t.name,t.title,s.pick)).join('')}</select></label><label class="field"><span>单次 Token 预算</span><input id="timer-budget" type="number" min="1" value="${h(s.budget||'')}" placeholder="留空不限"></label></div>
    <div class="space-grid"><label class="field"><span>首次或下次时间（${h(s.zone)}）</span><input type="datetime-local" id="timer-time" value="${local}"></label><label class="field"><span>频率</span><select id="timer-freq">${Object.entries(spaceFreq).map(([k,v])=>option(k,v,s.freq)).join('')}</select></label></div>
    <label class="field" id="timer-interval-field" ${s.freq==='interval'?'':'hidden'}><span>间隔分钟</span><input id="timer-minutes" type="number" min="1" max="43200" value="${h(s.minutes||60)}"></label>
    <details><summary>任务资料与联网参数</summary><div class="stack"><label class="field"><span>搜索词</span><input id="timer-query" value="${h(s.inputs?.query||'')}"></label><label class="field"><span>读取网页 URL</span><input id="timer-url" value="${h(s.inputs?.url||'')}"></label><div class="space-checks">${files.map(f=>`<label><input type="checkbox" class="space-timer-file" value="${h(f.id)}" ${s.inputs?.files?.includes(f.id)?'checked':''}>${h(f.name)}</label>`).join('')}</div></div></details>
    </div>`,btn('保存定时任务','space-save-schedule','check','primary',sid),true);
}
function spaceFindDialog(query=''){
  const rows=spaceFindSkills(query),publicMatches=(spacePublicSkills||[]).filter(n=>!query||n.includes(query.trim().toLowerCase()));
  const publicPanel=`<details ${spacePublicSkills?'open':''}><summary>公开技能目录 · Anthropic</summary><div class="stack">
    <small class="hint">按英文技能名查找，预览后可保存文字指令。依赖脚本或附属文件的步骤需要相应的运行环境。</small>
    ${spacePublicSkills?`<div class="space-list">${publicMatches.map(n=>`<div class="rowline listrow"><strong>${h(n)}</strong>${btn('预览 SKILL.md','space-public-preview','file','small',n)}</div>`).join('')||'<small>没有匹配名称，可清空搜索词查看目录。</small>'}</div>`:''}
    <div class="buttons">${btn(spacePublicSkills?'刷新公开目录':'联网加载目录','space-public-load','globe','small')}</div></div></details>`;
  openDialog('发现与安装技能',`<div class="space-toolbar"><input id="space-skills-search" value="${h(query)}" placeholder="按用途或技能名搜索">${btn('查找','space-find-submit','search','small')}</div>
    <div class="space-list">${rows.map(({s,installed})=>`<div class="rowline listrow"><div><strong>${h(s.title)}</strong><small class="hint">${h(s.name)} · ${installed?'已安装':'内置可安装目录'}</small><p>${h(s.description)}</p></div>${installed?s.enabled?btn('使用','agent-use','','small',s.name):btn('启用','space-install','','small',s.name):btn('安装','space-install','plus','small',s.name)}</div>`).join('')||'<p>没有匹配技能。</p>'}</div>
    ${publicPanel}<details><summary>从链接导入 SKILL.md</summary><div class="space-toolbar"><input id="space-skill-url" type="url" placeholder="公开的 SKILL.md 原文链接">${btn('读取并预览','space-skill-url','','small')}</div></details>`,btn('导入本地 SKILL.md','agent-import','upload')+btn('创建技能','agent-new','plus','primary'),true);
}
function spaceReadDialog(index=0){
  const {info,content}=spaceViewer,parts=content.parts,i=Math.max(0,Math.min(index,parts.length-1));spaceViewer.index=i;
  openDialog(info.name,`<div class="stack"><small class="hint">${h(info.path||info.url||info.name)} · ${number(info.chars)} 字${info.partial?' · 已截取':''}</small>
    ${(info.notes||[]).length?`<p class="hint">${h(info.notes.join(' '))}</p>`:''}<label class="field"><span>原文位置</span><select id="space-part">${parts.map((s,n)=>option(String(n),s.label,String(i))).join('')}</select></label>
    <pre class="space-text">${h(parts[i]?.text||'')}</pre></div>`,btn('加入当前 Brief','space-attach','plus')+(content.blob?btn('下载原件','space-original','download'):'')+btn('用于 Agent 任务','space-use-doc','layers','primary'),true);
}
