async function spaceRefresh(wid=spaceOf(project())){
  await spaceIndex(wid,true).catch(e=>{spaceNotice=e.message;});
  if(wid===spaceOf(project())&&['agent','workspace'].includes(page))render();
}
async function spaceAfterImport(wid,report,agent=false,before=[],folder=false){
  if(!report)return;
  const notes=[`已导入 ${report.done} 份`,report.skipped?`跳过 ${report.skipped} 份`:'',...report.errors].filter(Boolean).join('\n');
  if(wid!==spaceOf(project()))return;
  if(folder)spaceDirectoryReport={wid,text:notes};
  spaceNotice=notes;if(agent){const draft=agentDraft(project()),rows=await spaceIndex(wid);
    draft.files=[...new Set([...(draft.files||[]),...rows.filter(f=>!before.includes(f.id)).map(f=>f.id)])].slice(0,20);draft.openInputs=true;}
  render();toast(agentClip(notes,180));
}
async function spacePicked(files,task){
  const wid=task.wid||spaceOf(project()),before=(await spaceIndex(wid)).map(f=>f.id);
  spaceBusy=true;if(page==='workspace'||settingsAt('directory'))render();try{
    if(task.kind==='workspace-folder'&&files[0]?.webkitRelativePath){const folder=files[0].webkitRelativePath.split('/')[0];spaceSet('workspace/'+wid,{...spaceInfo(wid),id:wid,folder});}
    await spaceAfterImport(wid,await spaceImportFiles(wid,files,task.kind==='workspace-folder'),task.kind==='workspace-agent',before,task.kind==='workspace-folder');
  }finally{spaceBusy=false;if(page==='workspace'||settingsAt('directory'))render();}
}
async function spaceAction(action,value){
  const p=project(),wid=spaceOf(p),draft=agentDraft(p);
  const localId=()=>spaceSchedules().find(s=>s.id===value&&db.projects.some(q=>q.id===s.pid&&spaceOf(q)===wid));
  if(action==='space-tab'){spaceTab=value;spaceNotice='';go('workspace');await spaceRefresh();return;}
  if(action==='space-inputs'){draft.openInputs=true;go('agent');await spaceRefresh();return;}
  if(action==='space-new'||action==='space-edit'){spaceEdit(wid,action==='space-new');return;}
  if(action==='space-save'){
    const name=$('#space-name').value.trim(),instructions=$('#space-rules').value.trim();if(!name)throw Error('请填写工作区名称。');
    const cur=value==='new'?{id:id(),created:Date.now()}:spaceInfo(wid);
    spaceSet('workspace/'+cur.id,{...cur,name,instructions});if(value==='new')spaceSelect(cur.id);else{closeDialog();render();}return;
  }
  if(action==='space-move'){
    const list=spaceList().filter(x=>x.id!==wid);if(!list.length)throw Error('请先创建另一个工作区。');
    openDialog('移动当前项目及关联轮次',`<p>项目记忆和定时任务随项目移动。工作区共享文件和记忆保留在原工作区。</p><label class="field"><span>目标工作区</span><select id="space-move-to">${list.map(x=>option(x.id,x.name,'')).join('')}</select></label>`,btn('移动项目','space-move-confirm','folder','primary'));return;
  }
  if(action==='space-move-confirm'){
    const dest=$('#space-move-to').value;if(!spaceList().some(w=>w.id===dest))throw Error('未找到目标工作区。');
    if(agentActive||job)throw Error('请等待当前任务结束后再移动项目。');
    for(const q of familyRounds(p)){q.workspaceId=dest;q.updated=Date.now();}save();spaceSelect(dest);return;
  }
  if(['space-upload','space-agent-upload'].includes(action)){pickFile(action==='space-upload'?'workspace-files':'workspace-agent',spaceFileAccept,true);if(fileTask)fileTask.wid=wid;return;}
  if(action==='space-folder'||action==='space-folder-new'){
    if(spaceBusy)return;spaceBusy=true;spaceDirectoryReport=null;try{await spaceAfterImport(wid,await spaceDirectory(wid,action==='space-folder'&&!!spaceInfo(wid).folder),false,[],true);}finally{spaceBusy=false;if(settingsAt('directory'))render();}return;
  }
  if(action==='space-read'){spaceViewer=await spaceGet(wid,value);const terms=spaceTerms(spaceSearchTerm);let best=0;
    if(terms.length){const scores=spaceViewer.content.parts.map(r=>spaceRank(r.text,terms));best=scores.indexOf(Math.max(...scores));}spaceReadDialog(best);return;}
  if(action==='space-use-doc'){if(spaceViewer?.info.wid!==wid)return;draft.files=[...new Set([...(draft.files||[]),spaceViewer.info.id])];draft.openInputs=true;go('agent');return;}
  if(action==='space-original'){if(spaceViewer?.info.wid!==wid||!spaceViewer.content.blob)return;const url=URL.createObjectURL(spaceViewer.content.blob),a=document.createElement('a');a.href=url;a.download=spaceViewer.info.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);return;}
  if(action==='space-attach'){if(spaceViewer?.info.wid!==wid)return;if(p.assets.length>=5)throw Error('当前 Brief 已有 5 份参考素材。');const part=spaceViewer.content.parts[spaceViewer.index];
    p.assets.push({id:id(),name:spaceViewer.info.name+' · '+part.label,text:agentClip(part.text+(spaceViewer.info.url?'\n'+spaceViewer.info.url:''),6500)});resetSemanticForAssets(p);p.updated=Date.now();save();closeDialog();render();toast('原文摘录已加入当前 Brief。');return;}
  if(action==='space-remove-doc'||action==='space-del-note'||action==='space-del-schedule'){
    const title=action==='space-remove-doc'?'移除工作区保存的文件':action==='space-del-note'?'删除这条本地记忆':'删除这个定时任务';
    openDialog(title,`<p>${action==='space-remove-doc'?'工作区中的原件副本与正文索引将一并移除。':action==='space-del-note'?'后续任务将停止读取这条记忆。':'以前的执行结果仍可在项目任务记录里查看。'}</p>`,btn('取消','close')+btn('确认','space-confirm-remove','check','primary',action+'|'+value));return;
  }
  if(action==='space-confirm-remove'){
    const [op,key]=value.split('|');if(op==='space-remove-doc'){await spaceGet(wid,key);await spaceWrite(['index','content'],tx=>{tx.objectStore('index').delete(key);tx.objectStore('content').delete(key);});await spaceIndex(wid,true);}
    else if(op==='space-del-note')spaceRemove('space-note/'+wid+'/'+key);
    else if(op==='space-del-schedule'&&spaceSchedules().some(s=>s.id===key&&db.projects.some(q=>q.id===s.pid&&spaceOf(q)===wid)))spaceRemove('schedule/'+key);
    closeDialog();render();await spaceWakeSync();return;
  }
  if(action==='space-file-search'){spaceSearchTerm=$('#space-file-search').value.trim();if(!spaceSearchTerm)spaceFiltered=null;else{const rows=await spaceIndex(wid),q=spaceSearchTerm.toLowerCase(),ids=[];
    for(const r of rows){if(r.name.toLowerCase().includes(q)||(await spaceGet(wid,r.id)).content.parts.some(s=>s.text.toLowerCase().includes(q)))ids.push(r.id);}spaceFiltered={wid,ids};}render();return;}
  if(action==='space-note'){spaceNoteForm(wid,value);return;}
  if(action==='space-save-note'){const title=$('#space-note-title').value.trim(),text=$('#space-note-text').value.trim();if(!title||!text)throw Error('请填写标题和记忆内容。');
    const key=value||id();spaceSet('space-note/'+wid+'/'+key,{id:key,title,text,pinned:$('#space-note-pin').checked,updated:Date.now()});closeDialog();render();return;}
  if(action==='space-engine-save'){
    const engine=$('#space-engine').value,key=$('#space-engine-key')?.value.trim();
    if(!Object.hasOwn(spaceEngines,engine))throw Error('请选择搜索服务。');
    if(engine!=='wiki'&&!key&&!spaceSearchKeys.has(wid+'/'+engine))throw Error('请填写搜索服务的 API Key。');
    spaceSet('workspace/'+wid,{...spaceInfo(wid),id:wid,engine});
    if(key)spaceSearchKeys.set(wid+'/'+engine,key);
    spaceWebPending=null;$('#space-search-key-field').innerHTML=settingsSearchKey(wid,engine);
    $('#settings-error').textContent='';toast('已保存当前工作区的搜索配置。');return;
  }
  if(action==='space-web-fetch'||action==='space-web-search'){
    if(spaceBusy)return;const fetchPage=action==='space-web-fetch',input=$(fetchPage?'#space-fetch-url':'#space-search-q').value.trim();
    spaceBusy=true;spaceNotice=fetchPage?'正在读取网页正文…':'正在查询搜索服务…';render();
    try{const refs=await spaceResearch(fetchPage?'fetch':'search',input,p);if(spaceOf(project())===wid){spaceWebPending={wid,refs};spaceNotice='';}}
    catch(e){if(spaceOf(project())===wid){spaceNotice=e.message;spaceWebPending=null;}throw e;}finally{spaceBusy=false;if(page==='workspace')render();}return;
  }
  if(action==='space-save-web'){const r=spaceWebPending?.wid===wid&&spaceWebPending.refs[+value];if(!r)throw Error('搜索结果已变更。');const doc=new SpaceDocument();doc.add('网页正文或搜索摘要',r.text||r.label);
    await spaceStoreFile(wid,{name:r.label,path:r.url,url:r.url,kind:'web',ext:'web',bytes:0,partial:false,notes:[]},{parts:doc.parts},true);await spaceIndex(wid,true);toast('已保存文字和来源链接。');return;}
  if(action==='space-find'||action==='space-find-submit'){
    const query=action==='space-find'?value:$('#space-skills-search').value;if(!settingsAt('skills'))go('settings/skills');spaceFindDialog(query);return;
  }
  if(action==='space-install'){const old=agentLibrary().find(s=>s.name===value);if(old)spaceRemove('off/'+value);else{const s=spaceCatalog.find(s=>s.name===value);if(!s)throw Error('未找到该技能。');spaceSet('skill/'+value,s);}
    render();spaceFindDialog($('#space-skills-search')?.value||'');toast('技能已安装并启用。');return;}
  if(action==='space-public-load'){
    const search=$('#space-skills-search');await spaceLoadPublicSkills(p);if(search?.isConnected)spaceFindDialog(search.value);return;
  }
  if(action==='space-public-preview'){
    if(!spacePublicSkills?.includes(value))throw Error('请先载入公开技能目录。');
    const current=$('#space-skills-search'),url='https://raw.githubusercontent.com/anthropics/skills/main/skills/'+value+'/SKILL.md';
    const rows=await spaceResearch('fetch',url,p);if(current?.isConnected)agentEditor(agentParseSkill(rows[0].text));return;
  }
  if(action==='space-skill-url'){const refs=await spaceResearch('fetch',$('#space-skill-url').value.trim(),p);agentEditor(agentParseSkill(refs[0].text));return;}
  if(action==='space-export-skill'){
    const s=agentRecords.get('skill/'+value);if(!s)throw Error('请先保存技能。');
    return download('SKILL.md','---\nname: '+s.name+'\ndescription: '+JSON.stringify(s.description)+'\n---\n\n'+s.body+'\n','text/markdown;charset=utf-8');
  }
  if(action==='space-draft-skill'){const r=agentRecords.get('run/'+value);if(r?.pid===p.id){const s=r.steps.find(s=>s.result?.skillDraft)?.result.skillDraft;if(s){go('settings/skills');agentEditor(s);}}return;}
  if(action==='space-schedule'){spaceScheduleForm(wid,value);return;}
  if(action==='space-save-schedule'){
    const previous=localId(),zone=previous?.zone||Intl.DateTimeFormat().resolvedOptions().timeZone,q=$('#timer-goal').value.trim(),dt=$('#timer-time').value,match=dt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if(!q||!match)throw Error('请填写任务目标和有效的执行时间。');
    const anchor=spaceFromWall({year:+match[1],month:+match[2],day:+match[3],hour:+match[4],minute:+match[5]},zone),freq=$('#timer-freq').value,minutes=Number($('#timer-minutes').value||60);
    if(freq==='interval'&&(!Number.isInteger(minutes)||minutes<1||minutes>43200))throw Error('间隔需为 1–43,200 分钟。');
    if(freq==='once'&&anchor<=Date.now())throw Error('一次性任务请选择未来时间。');
    const pid=$('#timer-project').value;if(!db.projects.some(q=>q.id===pid&&spaceOf(q)===wid))throw Error('项目不属于当前工作区。');
    const url=$('#timer-url').value.trim();
    const s={...previous,id:previous?.id||id(),pid,goal:q,pick:$('#timer-skill').value,budget:readTokenLimit($('#timer-budget').value),inputs:{query:$('#timer-query').value.trim().slice(0,500),url:url?spaceUrl(url):'',files:[...document.querySelectorAll('.space-timer-file:checked')].map(x=>x.value)},freq,zone,anchor,minutes,enabled:true,next:anchor,updated:Date.now()};
    if(anchor<=Date.now())s.next=spaceNext(s,anchor,Date.now());spaceSet('schedule/'+s.id,s);closeDialog();render();await spaceWakeSync();return;
  }
  if(action==='space-toggle-schedule'){const s=localId();if(!s)return;s.enabled=!s.enabled;
    if(s.enabled&&(!s.next||s.next<=Date.now())){if(s.freq==='once'){spaceScheduleForm(wid,s.id);return;}s.next=spaceNext(s,s.anchor,Date.now());}
    spaceSet('schedule/'+s.id,s);render();await spaceWakeSync();return;}
  if(action==='space-run-now'){const s=localId();if(!s)return;if(job||agentActive||spaceTicking)throw Error('请等当前任务结束后再试。');await spaceFire(s,Date.now(),true);return;}
  if(action==='space-schedule-result'){const s=localId();if(!s?.lastRun)return;agentSelection.set(s.pid,s.lastRun);setProject(s.pid,'agent');return;}
}
function spaceUiInput(e){
  const t=e.target,p=project(),d=agentDraft(p),wid=spaceOf(p);
  if(t.id==='space-run-query')d.webQuery=t.value;if(t.id==='space-run-url')d.webUrl=t.value;
  if(e.type!=='change')return;
  if(t.matches?.('.space-run-file'))d.files=[...document.querySelectorAll('.space-run-file:checked')].map(c=>c.value);
  if(t.id==='space-switch')spaceSelect(t.value);
  if(t.id==='space-part')spaceReadDialog(+t.value);
  if(t.id==='space-engine'){$('#space-search-key-field').innerHTML=settingsSearchKey(wid,t.value);$('#settings-error').textContent='';}
  if(t.id==='timer-freq')$('#timer-interval-field').hidden=t.value!=='interval';
  if(t.id==='space-system-wake'){localStorage.setItem('meridian-system-wake',t.checked?'on':'off');spaceWakeSync(true).then(()=>{if(settingsAt('records'))render();}).catch(e=>{if(settingsAt('records'))render();showError(e);});}
  if(t.id==='space-folderbox'&&spaceFolderFallback){const key=spaceFolderFallback;spaceFolderFallback=null;spacePicked([...t.files],{wid:key,kind:'workspace-folder'}).catch(showError);}
}
