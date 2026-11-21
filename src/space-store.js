const spaceDefault='default',spaceMain={id:'default',name:'默认工作区',instructions:'',created:0};
let spaceDirectoryReport=null,spaceTab='files',spaceFileCache=new Map(),spaceVaultPromise,spaceNotice='',spaceBusy=false,spaceFolderFallback=null;
function spaceList(){
  const all=[...agentRecords].filter(([k])=>k.startsWith('workspace/')).map(([,v])=>v);
  return [all.find(x=>x.id===spaceDefault)||spaceMain,...all.filter(x=>x.id!==spaceDefault).sort((a,b)=>a.created-b.created)];
}
function spaceOf(p){const seen=new Set();while(p&&!seen.has(p.id)){if(p.workspaceId)return p.workspaceId;seen.add(p.id);p=db.projects.find(x=>x.id===p.parent);}return spaceDefault;}
function spaceInfo(wid=spaceOf(project())){return agentRecords.get('workspace/'+wid)||spaceMain;}
function spaceSet(key,value){
  const raw=JSON.stringify(value);localStorage.setItem(agentPrefix+key,raw);agentRecords.set(key,value);agentVolatile.delete(key);
}
function spaceRemove(key){localStorage.removeItem(agentPrefix+key);agentRecords.delete(key);agentVolatile.delete(key);}
function spaceNotes(wid){return [...agentRecords].filter(([k])=>k.startsWith('space-note/'+wid+'/')).map(([,v])=>v).sort((a,b)=>b.updated-a.updated);}
function spaceTerms(s){const text=String(s||'').toLowerCase(),terms=text.match(/[a-z0-9][a-z0-9._-]{1,}|[\p{Script=Han}]/gu)||[];
  for(const x of text.match(/[\p{Script=Han}]{2,}/gu)||[])for(let i=0;i<x.length-1;i++)terms.push(x.slice(i,i+2));return [...new Set(terms)].slice(0,90);}
function spaceRank(text,terms){const s=String(text).toLowerCase();return terms.reduce((sum,t)=>sum+(s.includes(t)?Math.min(t.length,8):0),0);}
function spaceMemory(p,goal=''){
  const wid=spaceOf(p),terms=spaceTerms(goal),meta=spaceInfo(wid),notes=spaceNotes(wid)
    .map(n=>({n,score:spaceRank(n.title+' '+n.text,terms)})).filter(x=>x.n.pinned||x.score>0)
    .sort((a,b)=>Number(b.n.pinned)-Number(a.n.pinned)||b.score-a.score||b.n.updated-a.n.updated).slice(0,5);
  return [agentRecords.get('memory/'+p.id)?.text,meta.instructions,...notes.map(({n})=>n.title+' · '+agentClip(n.text,750))].filter(Boolean).join('\n').slice(0,6000);
}
function spaceVault(){
  if(!spaceVaultPromise)spaceVaultPromise=new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(Error('本机文件存储不可用，请使用桌面版或允许浏览器保存数据。'));return;}
    const req=indexedDB.open('meridian-workspace-files-v1',1);
    req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('index',{keyPath:'id'}).createIndex('space','wid');db.createObjectStore('content');db.createObjectStore('folders');};
    req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();spaceVaultPromise=null;};resolve(req.result);};req.onerror=()=>reject(req.error);
  }).catch(e=>{spaceVaultPromise=null;throw e;});
  return spaceVaultPromise;
}
async function spaceRead(store,key){const disk=await spaceVault();return new Promise((yes,no)=>{const r=disk.transaction(store).objectStore(store).get(key);r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error);});}
async function spaceIndex(wid,force=false){
  if(!force&&spaceFileCache.has(wid))return spaceFileCache.get(wid);
  const disk=await spaceVault();const rows=await new Promise((yes,no)=>{const r=disk.transaction('index').objectStore('index').index('space').getAll(wid);r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error);});
  rows.sort((a,b)=>b.updated-a.updated);spaceFileCache.set(wid,rows);return rows;
}
async function spaceWrite(stores,change){const db=await spaceVault();return new Promise((yes,no)=>{const tx=db.transaction(stores,'readwrite');try{change(tx);}catch(e){tx.abort();no(e);return;}tx.oncomplete=yes;tx.onabort=()=>no(tx.error||Error('无法保存本机文件。'));});}
async function spaceStoreFile(wid,meta,content,replace=false){
  const save=async()=>{
    const index=await spaceIndex(wid,true),existing=replace&&index.find(f=>f.path===meta.path);
    const key=existing?.id||id(),row={...meta,id:key,wid,updated:Date.now(),chars:content.parts.reduce((a,x)=>a+x.text.length,0),count:content.parts.length};
    await spaceWrite(['index','content'],tx=>{tx.objectStore('index').put(row);tx.objectStore('content').put(content,key);});
    spaceFileCache.delete(wid);return row;
  };
  return globalThis.navigator?.locks?.request?navigator.locks.request('meridian-doc-files/'+wid,save):save();
}
async function spaceImportFiles(wid,files,fromFolder=false){
  const result={done:0,skipped:0,errors:[]};
  const entries=Array.from(files).map(f=>f.file?f:{file:f,path:f.webkitRelativePath||f.name});
  for(const {file,path} of entries){
    if(!docSupported(file.name)){result.skipped++;continue;}
    try{
      const existing=fromFolder&&(await spaceIndex(wid)).find(f=>f.path===path);
      if(existing&&existing.bytes===file.size&&existing.modified===file.lastModified){result.skipped++;continue;}
      const read=await readSpaceDocument(file);
      await spaceStoreFile(wid,{name:file.name,path,kind:'file',ext:file.name.split('.').pop().toLowerCase(),bytes:file.size,modified:file.lastModified,partial:read.partial,notes:read.notes},
        {blob:file,parts:read.parts},fromFolder);
      result.done++;
    }catch(e){result.errors.push(file.name+' · '+String(e.message||e));}
  }
  await spaceIndex(wid,true);return result;
}
async function spaceGet(wid,fid){
  const info=await spaceRead('index',fid);if(!info||info.wid!==wid)throw Error('当前工作区找不到该文件。');
  const content=await spaceRead('content',fid);if(!content)throw Error('本机文件内容已丢失，请重新导入。');return {info,content};
}
async function spacePassages(wid,ids,query){
  const all=await spaceIndex(wid),terms=spaceTerms(query),chosen=ids?.length?all.filter(f=>ids.includes(f.id)):all;
  if(ids?.some(id=>!chosen.some(f=>f.id===id)))throw Error('所选资料已移除，请重新选择。');
  const ranked=[];
  for(const f of chosen){
    const {content}=await spaceGet(wid,f.id),nameScore=spaceRank(f.name,terms);
    const scores=content.parts.map((part,j)=>({label:f.name+' · '+part.label,text:part.text,score:spaceRank(part.text+' '+part.label,terms)+nameScore,order:j}));
    scores.sort((a,b)=>b.score-a.score||a.order-b.order);
    ranked.push(...scores.slice(0,4));
  }
  const hits=ranked.filter(x=>x.score>0);return (hits.length?hits:ids?.length||chosen.length===1?ranked:[]).sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,8).map(({label,text})=>({label,text:agentClip(text,2200)}));
}
async function spaceDirectory(wid,refresh=false){
  if(!globalThis.showDirectoryPicker){spaceFolderFallback=wid;const inp=$('#space-folderbox');inp.value='';inp.click();return;}
  let dir=refresh?await spaceRead('folders',wid):null;
  try{
    if(dir){if(await dir.requestPermission({mode:'read'})!=='granted')throw Error('需要重新选择可读取的文件夹。');}
    else dir=await showDirectoryPicker({mode:'read',id:'meridian-workspace'});
  }catch(e){if(e.name==='AbortError')return;if(['NotAllowedError','SecurityError'].includes(e.name)){spaceFolderFallback=wid;const inp=$('#space-folderbox');inp.value='';inp.click();return;}throw e;}
  await spaceWrite(['folders'],tx=>tx.objectStore('folders').put(dir,wid));spaceSet('workspace/'+wid,{...spaceInfo(wid),id:wid,folder:dir.name});
  const list=[];
  async function walk(node,path){for await(const [name,h] of node.entries()){
    if(name.startsWith('.')||['node_modules','__pycache__'].includes(name))continue;
    if(h.kind==='directory')await walk(h,path+name+'/');else if(docSupported(name))list.push({file:await h.getFile(),path:path+name});}}
  await walk(dir,dir.name+'/');return spaceImportFiles(wid,list,true);
}
