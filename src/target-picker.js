const pickerGroups = {
  markets: MARKET_GROUPS,
  platforms: MEDIA_GROUPS.map(g=>({label:g.label,scope:g.scope,ids:g.items.map(row=>row[0])}))
};
const pickerText = {
  markets:{label:'目标市场与语言',empty:'选择国家或地区',search:'搜索中文名、英文名或国家代码',unit:'个市场'},
  platforms:{label:'投放平台',empty:'选择投放媒体',search:'搜索媒体名称或简称',unit:'家媒体'}
};
function targetLabel(kind,id){return kind==='markets'?MARKETS[id].name:platformLabel(id);}
function selectionSummary(kind,ids,max=2){
  if(!ids.length)return pickerText[kind].empty;
  const text=ids.slice(0,max).map(id=>targetLabel(kind,id)).join('、');
  return ids.length>max?text+' 等 '+ids.length+' '+pickerText[kind].unit:text;
}
function pickerInputs(kind,ids){
  return ids.map(id=>`<input type="hidden" name="${kind}" value="${h(id)}">`).join('');
}
function targetPicker(kind,selected){
  const t=pickerText[kind];
  return `<div class="field target-picker" data-picker="${kind}">
    <span id="${kind}-label">${t.label}<em>*</em></span>
    <button type="button" class="picker-trigger" data-pick-action="toggle" aria-haspopup="dialog" aria-expanded="false" aria-controls="${kind}-menu" aria-labelledby="${kind}-label ${kind}-summary">
      <span class="picker-summary" id="${kind}-summary">${h(selectionSummary(kind,selected))}</span><i aria-hidden="true"></i>
    </button>
    <div class="picker-values" hidden>${pickerInputs(kind,selected)}</div>
    <div class="picker-pop" id="${kind}-menu" role="dialog" aria-labelledby="${kind}-label" hidden>
      <input type="search" class="picker-search" aria-label="${t.search}" placeholder="${t.search}" autocomplete="off" spellcheck="false">
      ${kind==='platforms'?`<div class="picker-scopes" role="group" aria-label="媒体范围">${['全部','海外','国内'].map((scope,i)=>`<button type="button" data-pick-scope="${scope}" aria-pressed="${i===0}">${scope}</button>`).join('')}</div>`:''}
      <div class="picker-tools"><button type="button" data-pick-action="all">全选当前结果</button><button type="button" data-pick-action="clear">清空已选</button></div>
      <div class="picker-list"></div>
      <div class="picker-foot"><span role="status" aria-live="polite"></span><button type="button" data-pick-action="done">完成</button></div>
    </div></div>`;
}
function selectedTargets(root){return Array.from(root.querySelector('.picker-values').children,el=>el.value);}
function visiblePickerGroups(kind,query,scope){
  const key=searchKey(query);
  const exact=kind==='markets'&&/^[a-z]{2,3}$/i.test(query.trim())?resolveMarket(query):null;
  const catalog=kind==='markets'?MARKETS:PROFILE;
  return pickerGroups[kind].filter(g=>!g.scope||scope==='全部'||g.scope===scope).map(g=>{
    const ids=g.ids.filter(id=>exact?id===exact:!key||catalog[id].keys.some(name=>name.includes(key)));
    return {label:g.label,ids};
  }).filter(g=>g.ids.length);
}
function pickerStatus(root,selected){
  const total=root.querySelectorAll('.picker-list input').length;
  root.querySelector('.picker-summary').textContent=selectionSummary(root.dataset.picker,selected);
  root.querySelector('.picker-foot span').textContent=`已选 ${selected.length} · 当前 ${total} 项`;
  root.querySelector('[data-pick-action="clear"]').disabled=!selected.length;
  root.querySelector('[data-pick-action="all"]').disabled=total===0||!root.querySelector('.picker-list input:not(:checked)');
}
function renderPickerList(root){
  const kind=root.dataset.picker, selected=selectedTargets(root), checked=new Set(selected);
  const groups=visiblePickerGroups(kind,root.querySelector('.picker-search').value,root.dataset.scope||'全部');
  const list=root.querySelector('.picker-list');
  list.innerHTML=groups.length?groups.map(({label,ids})=>`<section role="group" aria-label="${h(label)}"><h4>${h(label)}</h4>${ids.map(id=>{
    const detail=kind==='markets'?`<small>${h(MARKETS[id].lang)} · ${id}</small>`:'';
    return `<label class="picker-option"><input type="checkbox" data-pick-id="${h(id)}" ${checked.has(id)?'checked':''}><span>${h(targetLabel(kind,id))}</span>${detail}</label>`;
  }).join('')}</section>`).join(''):'<p class="picker-empty">没有匹配项，请尝试其他名称或简称。</p>';
  list.scrollTop=0;
  pickerStatus(root,selected);
}
function updateTargets(root,values){
  const kind=root.dataset.picker,ids=[...new Set(values)],checked=new Set(ids);
  root.querySelector('.picker-values').innerHTML=pickerInputs(kind,ids);
  for(const input of root.querySelectorAll('.picker-list input'))input.checked=checked.has(input.dataset.pickId);
  pickerStatus(root,ids);
  if(kind==='platforms'){
    const note=document.querySelector('#brief-placement-notes');if(note)note.innerHTML=placementNotes(ids);
  }
  saveDraft();
}
function closePicker(root,refocus=false){
  if(!root)return;
  const trigger=root.querySelector('.picker-trigger');
  root.querySelector('.picker-pop').hidden=true;trigger.setAttribute('aria-expanded','false');
  if(refocus)trigger.focus({preventScroll:true});
}
function placePicker(root){
  const anchor=root.querySelector('.picker-trigger').getBoundingClientRect(),menu=root.querySelector('.picker-pop');
  const width=Math.min(Math.max(anchor.width,350),window.innerWidth-24);
  const below=window.innerHeight-anchor.bottom-10,above=anchor.top-10,up=below<270&&above>below;
  menu.style.width=width+'px';
  menu.style.left=Math.max(8,Math.min(anchor.left,window.innerWidth-width-8))+'px';
  menu.style.maxHeight=Math.min(430,Math.max(130,up?above:below))+'px';
  menu.style.top=up?'auto':Math.max(4,anchor.bottom+4)+'px';
  menu.style.bottom=up?Math.max(4,window.innerHeight-anchor.top+4)+'px':'auto';
}
function openPicker(root){
  const active=document.querySelector('.picker-trigger[aria-expanded="true"]')?.closest('.target-picker');
  if(active&&active!==root)closePicker(active);
  const search=root.querySelector('.picker-search');
  search.value='';root.dataset.scope='全部';
  for(const tab of root.querySelectorAll('[data-pick-scope]'))tab.setAttribute('aria-pressed',String(tab.dataset.pickScope==='全部'));
  renderPickerList(root);
  const anchor=root.querySelector('.picker-trigger').getBoundingClientRect();
  const preferred=Math.min(395,window.innerHeight-95),below=window.innerHeight-anchor.bottom-12;
  if(below<preferred && anchor.top-12<preferred){
    const distance=Math.min(preferred-below,Math.max(0,anchor.top-68));
    if(distance>0)window.scrollBy({top:distance,behavior:'instant'});
  }
  root.querySelector('.picker-pop').hidden=false;
  root.querySelector('.picker-trigger').setAttribute('aria-expanded','true');
  placePicker(root);search.focus({preventScroll:true});
}
document.addEventListener('click',e=>{
  const root=e.target.closest('.target-picker');
  const active=document.querySelector('.picker-trigger[aria-expanded="true"]')?.closest('.target-picker');
  if(active&&active!==root)closePicker(active);
  if(!root)return;
  const control=e.target.closest('button');
  if(!control)return;
  const action=control.dataset.pickAction;
  if(action==='toggle'){if(root.querySelector('.picker-pop').hidden)openPicker(root);else closePicker(root,true);}
  else if(action==='done')closePicker(root,true);
  else if(action==='clear')updateTargets(root,[]);
  else if(action==='all')updateTargets(root,[...selectedTargets(root),...Array.from(root.querySelectorAll('[data-pick-id]'),el=>el.dataset.pickId)]);
  else if(control.dataset.pickScope){
    root.dataset.scope=control.dataset.pickScope;
    for(const tab of root.querySelectorAll('[data-pick-scope]'))tab.setAttribute('aria-pressed',String(tab===control));
    renderPickerList(root);
  }
});
document.addEventListener('input',e=>{
  if(e.target.matches('.picker-search'))renderPickerList(e.target.closest('.target-picker'));
});
document.addEventListener('change',e=>{
  const input=e.target;
  if(!input.hasAttribute('data-pick-id'))return;
  const root=input.closest('.target-picker'),ids=selectedTargets(root),id=input.dataset.pickId;
  updateTargets(root,input.checked?[...ids,id]:ids.filter(v=>v!==id));
});
document.addEventListener('keydown',e=>{
  const root=e.target.closest('.target-picker');if(!root)return;
  const menu=root.querySelector('.picker-pop');
  if(menu.hidden){if(e.key==='ArrowDown'){e.preventDefault();openPicker(root);}return;}
  if(e.key==='Escape'){e.preventDefault();closePicker(root,true);return;}
  const search=root.querySelector('.picker-search');
  if(e.target===search&&e.key==='Enter'){e.preventDefault();root.querySelector('[data-pick-id]')?.focus();return;}
  if(e.target.hasAttribute('data-pick-id')&&e.key==='Enter'){e.preventDefault();e.target.click();return;}
  if(!['ArrowDown','ArrowUp'].includes(e.key)||!(e.target===search||e.target.hasAttribute('data-pick-id')))return;
  const options=[...root.querySelectorAll('[data-pick-id]')],index=options.indexOf(e.target);
  e.preventDefault();
  if(e.key==='ArrowUp'&&index<=0)search.focus();
  else options[Math.min(options.length-1,index+(e.key==='ArrowDown'?1:-1))]?.focus();
});
document.addEventListener('focusout',e=>{
  const root=e.target.closest('.target-picker');
  if(root&&e.relatedTarget&&!root.contains(e.relatedTarget))closePicker(root);
});
function positionOpenPicker(e){
  const menu=document.querySelector('.picker-pop:not([hidden])');
  if(menu&&!(e.target instanceof Element&&menu.contains(e.target)))placePicker(menu.closest('.target-picker'));
}
window.addEventListener('resize',positionOpenPicker);
document.addEventListener('scroll',positionOpenPicker,true);

