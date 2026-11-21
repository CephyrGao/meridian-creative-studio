const settingsSections=[
  ['api','API 接入','plug'],['directory','本地工作目录','folder'],['mcp','MCP 连接','layers'],
  ['skills','本地技能','spark'],['records','运行与备份','history']
];
function workbenchRoute(key){
  if(key==='diagnostics')return {page:'settings',tab:'records'};
  if(key==='settings')return {page:'settings'};
  if(key.startsWith('settings/')){
    const tab=key.slice(9);
    return settingsSections.some(s=>s[0]===tab)?{page:'settings',tab}:null;
  }
  return navItems.some(s=>s[0]===key)?{page:key}:null;
}
function settingsAt(tab){return page==='settings'&&settingsTab===tab;}
function settingsView(p){
  const nav=settingsSections.map(([key,title,icon])=>
    `<button type="button" data-act="settings-tab" data-id="${key}" aria-pressed="${key===settingsTab}">${ico(icon)}${h(title)}</button>`).join('');
  const views={
    api:()=>modelSettingsView()+settingsSearchView(p),
    directory:()=>settingsDirectoryView(p),
    mcp:()=>panel('MCP 连接','<div id="settings-mcp">'+mcpPane()+'</div>'),
    skills:agentLibraryView,
    records:()=>settingsRecordsView(p)
  };
  const previous=navItems.find(item=>item[0]===settingsReturnTo)?.[1]||'项目总览';
  return head('设置','经纬创意 · '+MCP_IDENT.version+' 测试版',btn('返回'+previous,'settings-return','back'))+
    `<nav class="settings-tabs" aria-label="设置类别">${nav}</nav><div id="settings-content" class="stack settings-content" data-tab="${settingsTab}" data-project="${h(p.id)}"><p id="settings-error" class="error-msg" role="alert"></p>${views[settingsTab]()}</div>`;
}
function settingsRecordsView(p){
  const backup=panel('项目备份',`<p class="hint">导出 ${h(p.brief.name||'当前项目')} 及其关联轮次，或从备份恢复为新项目。</p>`,btn('备份与恢复','backup-open','folder','small'));
  const wake=globalThis.meridianDesktop?panel('定时任务唤起',`<label class="space-inline"><input type="checkbox" id="space-system-wake" ${localStorage.getItem('meridian-system-wake')==='on'?'checked':''}>允许 Windows 在工作台退出后按时启动</label><p class="hint">需要当前用户保持登录。定时任务的时间和目标在「项目资料 → 定时任务」中设置。</p>${spaceWakeError?`<p class="error-msg">${h(spaceWakeError)}</p>`:''}`):'';
  return diagnosticView(p)+backup+wake;
}
function settingsDirectoryView(p){
  const wid=spaceOf(p),w=spaceInfo(wid),list=spaceList();
  const picker=`<label class="field"><span>当前工作区</span><select id="space-switch">${list.map(x=>option(x.id,x.name,wid)).join('')}</select></label>`;
  const selectFolder=w.folder?btn('更换目录','space-folder-new','folder','small')+btn('刷新目录','space-folder','history','primary small'):btn('选择本地目录','space-folder-new','folder','primary small');
  const folder=panel('本地工作目录',picker+`<div class="settings-folder">${ico('folder')}<div><strong>${h(w.folder||'尚未选择目录')}</strong><small class="hint">当前工作区的资料来源</small></div></div>
    <p class="hint">选择文件夹后，会将支持的文档导入「项目资料」。刷新目录可读取新增或修改的文件。</p>
    ${spaceBusy?'<p role="status" class="hint">正在读取目录…</p>':''}${spaceDirectoryReport?.wid===wid?`<p role="status" class="space-msg">${h(spaceDirectoryReport.text)}</p>`:''}`,
    `<div class="buttons">${selectFolder}</div>`);
  const workspace=panel('工作区管理',(w.instructions?`<p class="hint">${h(w.instructions)}</p>`:'')+
    `<div class="settings-project"><div><strong>${h(p.brief.name||'未命名项目')}</strong><small class="hint">当前项目 · ${db.projects.filter(q=>spaceOf(q)===wid).length} 个项目与轮次</small></div>${btn('移动当前项目','space-move','','small')}</div>`,
    `<div class="buttons">${btn('编辑工作区','space-edit','edit','small')}${btn('新建工作区','space-new','plus','small')}</div>`);
  return folder+workspace;
}
function settingsSearchKey(wid,engine){
  if(engine==='wiki')return '<p class="hint">维基百科搜索可直接使用。</p>';
  const configured=spaceSearchKeys.has(wid+'/'+engine);
  return `<label class="field"><span>搜索服务 API Key</span><input type="password" id="space-engine-key" autocomplete="off" placeholder="${configured?'留空沿用当前会话密钥':'填写服务商密钥'}"><small class="hint">密钥仅用于当前工作区和本次会话。</small></label>`;
}
function settingsSearchView(p){
  const wid=spaceOf(p),engine=spaceEngine(wid);
  return panel('搜索 API',`<div class="stack"><label class="field"><span>搜索服务 · ${h(spaceInfo(wid).name)}</span><select id="space-engine">${Object.entries(spaceEngines).map(([key,name])=>option(key,name,engine)).join('')}</select></label>
    <div id="space-search-key-field">${settingsSearchKey(wid,engine)}</div><div class="buttons">${btn('保存搜索配置','space-engine-save','check','small')}</div></div>`);
}
