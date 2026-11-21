let csvPending=null,fileTask=null;
function resetFilters(){filters={market:'',platform:'',audit:'',country:'',adPlatform:''};}
function setProject(pid,dest='overview'){
  if(!db.projects.some(p=>p.id===pid))throw Error('未找到该任务。');db.active=pid;try{localStorage.setItem('meridian-last-space/'+spaceOf(project()),pid);}catch{}diagFilter='all';diagTask='';resetFilters();save();go(dest);
}
function projectDialog(wid=spaceOf(project())){
  const spaces=spaceList(),projects=db.projects.filter(q=>spaceOf(q)===wid).sort((a,b)=>projectModified(b)-projectModified(a));
  const picker=spaces.length>1?`<label class="field"><span>工作区</span><select id="project-space">${spaces.map(w=>option(w.id,w.name,wid)).join('')}</select></label>`:'';
  const rows=projects.map(p=>`<div class="rowline listrow"><div><h3>${h(p.brief.name||p.briefDraft?.name||'未命名营销任务')}</h3><p class="hint">第 ${p.round} 轮 · ${p.cards.length} 条创意 · ${p.restoredAt?'恢复副本':p.demo?'示例项目':'自建项目'}</p><small class="hint">最后更新 ${h(diagMoment(projectModified(p)))}</small></div>${p.id===db.active?badge('当前项目','green'):btn('打开','switch-project','folder','small',p.id)}</div>`).join('');
  openDialog('切换项目',`<div class="stack">${picker}${rows||'<p class="hint">该工作区还没有项目。</p>'}</div>`,btn('新建营销任务','new','plus','primary',wid));
}
function newProject(wid=spaceOf(project())){
  if(!spaceList().some(w=>w.id===wid))throw Error('未找到该工作区。');
  const p=emptyProject();p.workspaceId=wid;db.projects.push(p);setProject(p.id,'brief');
}
function getBriefDraft(){
  const f=$('#brief-form');if(!f)return project().briefDraft||project().brief;
  const d=new FormData(f),b={};for(const k of Object.keys(EMPTY_BRIEF))b[k]=['markets','platforms'].includes(k)?d.getAll(k):String(d.get(k)||'').trim();
  return b;
}
function saveDraft(){
  const p=project(),draft=getBriefDraft();
  if(JSON.stringify(draft)===JSON.stringify(p.briefDraft||p.brief))return;
  p.briefDraft=draft;p.updated=Date.now();
  const label=$('#plan-count');if(label)label.textContent=p.briefDraft.markets.length*p.briefDraft.platforms.length*3+' 条创意';save();
}
function saveBrief(){
  const form=$('#brief-form');if(!form.reportValidity())return;const b=getBriefDraft();
  const emptyTarget=['markets','platforms'].find(k=>!b[k].length);
  if(emptyTarget){openPicker(form.querySelector('[data-picker="'+emptyTarget+'"]'));toast('请至少选择一项'+pickerText[emptyTarget].label+'。');return;}
  validateBrief(b);const p=project();
  const changed=Object.keys(EMPTY_BRIEF).some(k=>JSON.stringify(b[k])!==JSON.stringify(p.brief[k]));
  if(changed&&p.cards.length){
    const q=emptyProject(b);q.parent=p.id;q.round=p.round+1;q.assets=clone(p.assets);q.currency=p.currency;
    delete p.briefDraft;p.updated=Date.now();db.projects.push(q);setProject(q.id,'creative');toast('已保存为第 '+q.round+' 轮，上一轮创意和投放记录可在「切换项目」中查看。');return;
  }
  if(changed||p.briefDraft)p.updated=Date.now();p.brief=clone(b);delete p.briefDraft;save();go('creative');toast('Brief 已保存。');
}
const cnKeys={任务名称:'name',项目名称:'name',品牌或产品名:'brand',品牌名:'brand',产品名称:'brand',产品介绍:'product',核心卖点:'benefits',品牌语气:'tone',目标受众:'audience',受众:'audience',营销目标:'goal',目标市场:'markets',市场:'markets',投放平台:'platforms',平台:'platforms',禁用词:'banned',必须保留的品牌术语:'terms',必须保留的术语:'terms',品牌术语:'terms',产品参数:'params',证据内容:'evidence',可引用反馈:'evidence',证据来源:'source',参考素材:'assetNotes',实验要求:'experiment',团队正文上限:'limit'};
function importBrief(raw,name){
  let obj;if(/\.json$/i.test(name)||raw.trimStart().startsWith('{')){const data=JSON.parse(raw.replace(/^\uFEFF/,''));obj=data.brief||data;}
  else{
    obj={};let current='';
    for(const line of raw.split(/\r?\n/)){const match=line.match(/^\s*(?:[-#*]+\s*)?([^:：]{1,36})[:：]\s*(.*)$/);
      if(match&&(cnKeys[match[1].trim()]||Object.hasOwn(EMPTY_BRIEF,match[1].trim()))){current=cnKeys[match[1].trim()]||match[1].trim();obj[current]=match[2];}
      else if(current)obj[current]+='\n'+line;else if(line.trim())obj.product=(obj.product?obj.product+'\n':'')+line;
    }
  }
  const b=clone(project().briefDraft||project().brief);let n=0;
  for(const [key,val] of Object.entries(obj)){const k=cnKeys[key]||key;if(!Object.hasOwn(EMPTY_BRIEF,k))continue;
    if(k==='markets'||k==='platforms'){
      const resolve=k==='markets'?resolveMarket:resolvePlatform;
      const vs=Array.isArray(val)?val:resolve(val)?[val]:String(val).split(/[;,，；、\/|\n]+/);
      const ids=vs.map(t=>String(t).trim()).filter(Boolean).map(t=>{
        const id=resolve(t);if(!id)throw Error('未识别'+(k==='markets'?'国家或地区':'媒体')+'「'+t+'」，请使用下拉菜单中的名称或常用简称。');return id;
      });
      b[k]=[...new Set(ids)];
    }else if(['string','number'].includes(typeof val)||Array.isArray(val))b[k]=String(Array.isArray(val)?val.join('；'):val).trim().slice(0,6500);else continue;
    n++;
  }
  if(!n)throw Error('未识别出 Brief 字段，请使用 Brief JSON 或按「产品介绍：…」填写文本。');
  if(!['购买转化','获取线索','网站引流','品牌认知'].includes(b.goal))throw Error('营销目标支持购买转化、获取线索、网站引流、品牌认知。');
  project().briefDraft=b;project().updated=Date.now();save();go('brief');toast('已导入 '+n+' 个字段，请确认并保存 Brief。');
}
function pickFile(kind,accept,multiple=false){const input=$('#filebox');fileTask={kind,pid:db.active};input.value='';input.accept=accept;input.multiple=multiple;input.click();}
async function toImage(file){
  const url=URL.createObjectURL(file),img=new Image();
  try{img.src=url;await img.decode();const scale=Math.min(1,960/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.7);
  }finally{URL.revokeObjectURL(url);}
}
function csvStart(){
  csvPending=null;openDialog('导入投放 CSV',`<p>每行记录一组素材、创意方向、受众、国家和四项原始投放数据。平台、币种可另列。</p><label class="field"><span>文件没有币种列时，使用</span><select id="csv-currency">${['USD','IDR','CNY','EUR','GBP'].map(x=>option(x,x,project().currency)).join('')}</select></label><div class="helper-info">必需表头：素材名称、创意方向、受众、国家、展示量、点击量、转化量、花费。支持 UTF-8 CSV 以及常见英文表头。使用同一统计周期和点击归因口径。</div><div class="buttons">${btn('选择 CSV 文件','select-csv','upload','primary')}${btn('下载示例 CSV','sample-csv','download')}</div><div id="csv-preview"></div>`);
}
async function handleFile(){
  const task=fileTask,files=[...$('#filebox').files];if(!files.length||!task)return;
  const p=db.projects.find(p=>p.id===task.pid);if(!p||p.id!==db.active)return;
  if(task.kind.startsWith('workspace-'))return spacePicked(files,task);
  if(task.kind==='project-backup'){const raw=await files[0].text();if(p.id===db.active)backupPreview(readBackup(raw));return;}
  if(task.kind==='asset'){
    if(p.assets.length+files.length>5)throw Error('每个任务最多附加 5 份参考素材。');
    const proposed=[];for(const f of files){if(f.size>12*1024*1024)throw Error('单份参考素材上限为 12 MB。');const a={id:id(),name:f.name};
      if(/^image\/(jpeg|png|webp)$/.test(f.type)){if([...p.assets,...proposed].filter(x=>x.image).length>=2)throw Error('单个任务最多附加 2 张参考图。');a.image=await toImage(f);}
      else if(/\.(txt|md)$/i.test(f.name)){const t=await f.text();if(t.length>6500)throw Error('每份文本参考请控制在 6,500 字以内。');a.text=t;}
      else if(docSupported(f.name)){const read=await readSpaceDocument(f);await spaceStoreFile(spaceOf(p),{name:f.name,path:f.name,kind:'file',ext:f.name.split('.').pop().toLowerCase(),bytes:f.size,modified:f.lastModified,partial:read.partial,notes:read.notes},{blob:f,parts:read.parts});a.text=agentClip(read.parts.map(x=>x.label+'\n'+x.text).join('\n\n'),6500);}
      else throw Error('请选择文档、文本或 JPG、PNG、WebP 图片。');proposed.push(a);
    }
    if(p.id!==db.active)return;saveDraft();p.assets.push(...proposed);resetSemanticForAssets(p);p.updated=Date.now();save();render();toast('已添加参考素材。');return;
  }
  const f=files[0];if(f.size>(task.kind==='csv'?8e6:350000))throw Error('文件过大，请缩小后再导入。');
  const t=await f.text();if(p.id!==db.active)return;
  if(task.kind==='agent-skill'){agentEditor(agentParseSkill(t));return;}
  if(task.kind==='brief'){importBrief(t,f.name);return;}
  const parsed=parseData(t,$('#csv-currency')?.value||'USD');csvPending={...parsed,name:f.name,pid:p.id};
  const div=$('#csv-preview');if(div)div.innerHTML=`<div class="slot"><h3>${h(f.name)}</h3><p>${parsed.rows.length} 条记录 · ${parsed.currency} · 合计花费 ${money(total(parsed.rows).spend,parsed.currency)}</p><p class="hint">${p.data.length?'确认后将用本文件替换当前任务的投放数据。':'确认后计算投放指标并生成实验建议。'}</p><div class="spacer"></div>${btn('确认导入并复盘','commit-csv','check','primary')}</div>`;
}
function resetSemanticForAssets(p){for(const c of p.cards){c.semantic=null;c.approval=null;c.revision++;}}
function loadCsvRows(){
  const p=project();if(!csvPending||csvPending.pid!==p.id)throw Error('请选择投放 CSV。');
  p.data=csvPending.rows;p.currency=csvPending.currency;p.sourceFile=csvPending.name;p.sourceType='导入数据';p.updated=Date.now();csvPending=null;filters.country=filters.adPlatform='';save();go('report');toast('投放复盘已更新。');
}
function nextBrief(index){
  const p=project(),x=activeReport(p).experiments[Number(index)];if(!x)throw Error('实验建议已更新，请重新选择。');
  const q=experimentProject(p,x);db.projects.push(q);setProject(q.id,'brief');toast('实验组、对照组、指标和来源已写入新 Brief。');
}
function experimentProject(p,x){
  const b=clone(p.brief);b.name=(b.name||'营销任务').replace(/ · R\d+$/,'')+' · R'+(p.round+1);b.experiment=experimentBrief(x);b.audience=x.audience;
  const matched=resolveMarket(x.country),medium=resolvePlatform(x.platform);
  if(matched)b.markets=[matched];if(medium)b.platforms=[medium];
  const q=emptyProject(b);q.round=p.round+1;q.parent=p.id;q.assets=clone(p.assets);q.currency=p.currency;return q;
}
function jobSet(message){if(job){job.message=message;updateProgress();}}
async function callModel(task,p,c,signal,config,assignment={}){
  const body={brief:p.brief,market:c.market,platform:c.platform,direction:c.direction,creative:task==='audit'?Object.fromEntries([...Object.keys(FIELDS),'shots'].map(k=>[k,c[k]])):undefined,images:p.assets.filter(x=>x.image).map(x=>x.image),notes:p.assets.filter(x=>x.text).map(x=>({name:x.name,text:x.text}))};
  return modelRequest(task,config,{...body,...assignment},signal);
}
async function runJob(type,ids,replace=false){
  if(job||agentActive)throw Error('另一个任务正在运行，请等待完成或先停止。');
  const p=project(),b=p.brief;validateBrief(b);
  if(!modelName()){
    const presetOnly=ids.every(key=>{const [m,platform]=key.split('.');return SAMPLE_BRIEF.markets.includes(m)&&SAMPLE_BRIEF.platforms.includes(platform);});
    if(type==='generate'&&isSampleProduct(b)&&!p.assets.length&&presetOnly){
      for(const id of ids){if(!p.cards.some(x=>x.id===id)){const [m,pf,d]=id.split('.');p.cards.push(sampleTriplet(b,m,pf).find(x=>x.direction===d));}}
      p.updated=Date.now();save();render();toast('已载入预置示例。自定义 Brief 请连接模型。');return;
    }
    go('settings/api');$('#settings-error').textContent='请先连接模型以生成所选组合或运行语义复核。内置示例覆盖印度尼西亚、美国的 TikTok 与 Meta。';return;
  }
  const contextVersion=JSON.stringify([b,p.assets]),config=activeConnection();
  const ctrl=new AbortController();job={pid:p.id,ctrl,message:'正在准备模型请求…'};closeDialog();render();let done=0,activeId='';
  try{for(const cid of ids){
    if(ctrl.signal.aborted)throw Error('任务已停止，已完成的结果已保留。');
    activeId=cid;const [m,pf,d]=cid.split('.'),old=p.cards.find(c=>c.id===cid);
    if(type==='generate'&&old&&!replace)continue;
    if(type==='audit'&&(!old||semanticReady(old)))continue;
    const before=old?.revision;
    jobSet((type==='generate'?'生成':'复核')+' '+(done+1)+' / '+ids.length+' · '+MARKETS[m].name+' / '+pf+' / '+DIRECTIONS[d].short);
    diagContexts.set(ctrl.signal,{pid:p.id,step:cid});
    const response=await callModel(type,p,old||{market:m,platform:pf,direction:d},ctrl.signal,config);
    if(ctrl.signal.aborted)throw Error('任务已停止。');
    if(JSON.stringify([p.brief,p.assets])!==contextVersion)throw Error('参考素材或 Brief 已更新，请按最新版本重新运行。');
    const live=p.cards.find(c=>c.id===cid);if(live?.revision!==before)throw Error('创意在执行期间已修改，已保留较新版本。');
    if(type==='generate'){
      const c=checkedCard(response.result,b,m,pf,d);c.revision=(old?.revision||0)+1;c.engine=response.engine;
      if(old)p.cards[p.cards.indexOf(old)]=c;else p.cards.push(c);
    }else{old.semantic={issues:checkedSemantic(response.result),engine:response.engine,at:new Date().toISOString(),revision:old.revision};old.approval=null;}
    done++;p.updated=Date.now();save();if(db.active===p.id)render();
  }toast('已完成 '+done+' 条'+(type==='generate'?'创意生成。':'语义复核。'));}
  catch(e){await diagError(e,'批量'+(type==='generate'?'生成':'复核'),{pid:p.id,step:activeId},ctrl.signal.aborted?'cancelled':'error');openDialog('任务进度',`<p class="warnbox">${h(e.message)}</p><p class="hint">本次已完成 ${done} 条。当前处理项：${h(activeId)}。已保存的结果可以继续审阅或续跑。</p>`,btn('关闭','close'));}
  finally{job=null;render();if(type==='audit'&&ids.length===1&&done===1&&p.id===db.active)reviewDialog(ids[0]);}
}
function startGen(cardId,force=false){
  const p=project();validateBrief(p.brief);
  const all=cardId?[cardId]:projectPairs(p.brief).flatMap(({m,p:pf})=>Object.keys(DIRECTIONS).map(d=>keyOf(m,pf,d)));
  const existing=new Set(p.cards.map(c=>c.id)),missing=all.filter(id=>!existing.has(id));
  if(!missing.length&&!force){
    if(!modelName()){if(isSampleProduct(p.brief)){go('creative');toast('本任务的示例创意已就绪，可打开脚本与分镜。');return;}go('settings/api');return;}
    openDialog('重新生成创意',`<p>所选 ${all.length} 条创意均已存在。重新生成会逐条替换文案，并清除对应版本的审核状态。</p>`,btn('取消','close')+btn('确认重新生成','regen','spark','primary',cardId||''));return;
  }
  return runJob('generate',force?all:missing,force);
}
async function act(action,value){
  if(action.startsWith('space-'))return spaceAction(action,value);
  if(action.startsWith('backup-'))return backupAction(action);
  if(action.startsWith('quality-'))return qualityAction(action,value);
  if(action.startsWith('diag-'))return diagAction(action,value);
  if(action.startsWith('agent-'))return agentAction(action,value);
  if(action.startsWith('mcp-')) return mcpAction(action,value);
  const p=project();
  switch(action){
    case 'settings-open':case 'settings-tab':{
      if(action==='settings-tab'&&value==='records'){diagTask='';diagFilter='all';}
      go(action==='settings-open'?'settings':'settings/'+value);
      $('.settings-tabs [aria-pressed="true"]')?.focus?.({preventScroll:true});break;
    }
    case 'settings-return':{
      go(settingsReturnTo);const heading=$('#view h1');if(heading){heading.setAttribute('tabindex','-1');heading.focus?.({preventScroll:true});}break;
    }
    case 'menu':$('#sidebar').classList.toggle('open');break;
    case 'nav':if(value==='diagnostics'){diagTask='';diagFilter='all';}go(value);break;
    case 'project-method':projectMethod();break;
    case 'close':closeDialog();break;
    case 'new':newProject(value||spaceOf(p));break;
    case 'projects':projectDialog();break;
    case 'switch-project':setProject(value);break;
    case 'save-brief':saveBrief();break;
    case 'brief-json':await download((getBriefDraft().name||'营销任务')+'-Brief.json',JSON.stringify(getBriefDraft(),null,2),'application/json');break;
    case 'import-brief':pickFile('brief','.json,.txt,.md');break;
    case 'asset':pickFile('asset','image/jpeg,image/png,image/webp,'+spaceFileAccept,true);break;
    case 'remove-asset':saveDraft();p.assets=p.assets.filter(a=>a.id!==value);resetSemanticForAssets(p);p.updated=Date.now();save();render();break;
    case 'import-csv':csvStart();break;
    case 'select-csv':pickFile('csv','.csv,text/csv');break;
    case 'commit-csv':loadCsvRows();break;
    case 'sample-csv':{const q=makeSample();await download('folda-demo.csv',dataCsv(q.data,q.currency),'text/csv;charset=utf-8');break;}
    case 'load-sample':{if(p.data.length)throw Error('任务已有数据，请使用 CSV 导入替换。');const q=makeSample();Object.assign(p,{data:q.data,currency:q.currency,sourceFile:q.sourceFile,sourceType:'模拟数据'});p.updated=Date.now();save();render();break;}
    case 'next-brief':nextBrief(value);break;
    case 'direction':{go('creative');const {m,pf}=currentPair(p);const c=p.cards.find(x=>x.id===keyOf(m,pf,value));if(c)detailDialog(c.id);break;}
    case 'detail':detailDialog(value);break;
    case 'edit':editDialog(value);break;
    case 'save-card':saveCard(value);break;
    case 'review':reviewDialog(value);break;
    case 'approve':case 'approve-export':await confirmCard(value,action==='approve-export');break;
    case 'export-one':await exportCards([cardById(value)]);break;
    case 'export':exportDialog();break;
    case 'export-approved':await exportCards(p.cards.filter(c=>reviewState(c,p.brief)==='已审核'));break;
    case 'connect':go('settings/api');await refreshModel();break;
    case 'detect-model':await refreshModel();if(settingsAt('api')&&$('#model-provider')?.value==='local')renderModelFields();break;
    case 'test-connect':await testConnection();break;
    case 'save-connect':saveConnection();break;
    case 'generate':await startGen();break;
    case 'generate-one':await startGen(value);break;
    case 'regen':await startGen(value,true);break;
    case 'audit-one':await runJob('audit',[value]);break;
    case 'audit-all':{const list=p.cards.filter(c=>!semanticReady(c));if(!list.length){toast(p.cards.length?'当前所有创意均有对应版本的语义复核记录。':'请先生成创意。');break;}await runJob('audit',list.map(c=>c.id));break;}
    case 'cancel-job':if(job){job.ctrl.abort();jobSet('正在停止…');}break;
  }
}
document.addEventListener('click',e=>{const el=e.target.closest('[data-act]');if(!el)return;e.preventDefault();act(el.dataset.act,el.dataset.id||'').catch(showError);});
document.addEventListener('input',e=>{
  if(e.target.id?.startsWith('space-'))spaceUiInput(e);
  if(e.target.id?.startsWith('quality-'))qualityForm(e);
  if(e.target.id?.startsWith('agent-'))agentFormChange(e);
  if(e.target.id==='mcp-url'){mcpEndpointDraft=e.target.value;mcpTokenDraft='';if($('#mcp-token'))$('#mcp-token').value='';}
  if(e.target.id==='mcp-command')mcpCommandDraft=e.target.value;
  if(e.target.id==='mcp-stdio-args')mcpArgsDraft=e.target.value;
  if(e.target.id==='mcp-stdio-env')mcpEnvDraft=e.target.value;
  if(e.target.id==='mcp-token')mcpTokenDraft=e.target.value;
  if(e.target.id==='mcp-args')mcpArguments=e.target.value;
  if(e.target.id==='mcp-excerpt'&&mcpOutput)mcpOutput.excerpt=e.target.value;
  if(e.target.closest('#brief-form')&&e.target.name)saveDraft();
  if(['model-base','model-id','session-key'].includes(e.target.id)){
    if(e.target.id==='model-base'){$('#session-key').value='';updateKeyHint();}
    modelFormEdited=true;resetProbe();$('#settings-error').textContent='';
  }
});
document.addEventListener('change',e=>{
  if(e.target.id?.startsWith('space-')||e.target.id==='timer-freq'||e.target.classList?.contains?.('space-run-file'))spaceUiInput(e);if(e.target.id?.startsWith('quality-'))qualityForm(e);if(e.target.dataset.filter){filters[e.target.dataset.filter]=e.target.value;render();}
  if(e.target.id?.startsWith('agent-'))agentFormChange(e);
  if(e.target.id==='project-space')projectDialog(e.target.value);
  if(e.target.id==='mcp-tool'){mcpChoose(e.target.value);mcpRedraw();}
  if(e.target.id==='model-provider'){modelFormEdited=true;renderModelFields();}
  if(e.target.id==='csv-currency'){csvPending=null;const v=$('#csv-preview');if(v)v.textContent='已修改币种，请重新选择文件。';}
  if(e.target.id==='filebox')handleFile().catch(showError);});
document.addEventListener('submit',e=>{e.preventDefault();if(e.target.id==='brief-form')act('save-brief').catch(showError);});
$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
window.addEventListener('hashchange',()=>go(location.hash.slice(1)||'overview',false));
window.addEventListener('resize',()=>{if(page==='overview')drawMap(project().brief.markets);});
window.addEventListener('error',e=>{if(e.error)diagError(e.error,'界面运行异常');});
window.addEventListener('unhandledrejection',e=>{if(e.reason instanceof Error)diagError(e.reason,'异步操作异常');});
for(const el of document.querySelectorAll('[data-ico]'))el.innerHTML=ico(el.dataset.ico);
save();if(page==='settings')go('settings/'+settingsTab,false);else render();refreshModel();recoverRestores();spaceBoot();

