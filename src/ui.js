const paths={
  back:'M19 12H5m6-6-6 6 6 6',settings:'M3 6h6m4 0h8 M3 12h11m4 0h3 M3 18h3m4 0h11 M9 3v6 M16 9v6 M8 15v6',
  grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',file:'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h5',spark:'m12 2 1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z M19 15l1 3 3 1-3 1-1 3-1-3-3-1 3-1z',shield:'M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z M8 12l3 3 5-6',chart:'M3 3v17h18 M7 16v-4 M12 16V6 M17 16v-7',folder:'M3 6h7l2 2h9v11H3z M3 6V4h6l2 2',plug:'m8 5 3 3m3-7 3 3 M6 9l8-8 M4 11l1-1 8 8-1 1a5 5 0 0 1-7-7z M3 20l3-3 M7 9l5-5 M11 13l5-5',menu:'M3 6h18M3 12h18M3 18h18',plus:'M12 5v14M5 12h14',check:'m4 12 5 5L20 6',cloud:'M6 17a5 5 0 0 1 0-10 6 6 0 0 1 11-2 6 6 0 0 1 2 11 M8 15l3 3 5-6',globe:'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0z M3 12h18 M12 3c5 4 5 14 0 18-5-4-5-14 0-18z',layers:'m12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5',focus:'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6 M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0z',frame:'M3 4h18v16H3z M6 4v16 M18 4v16 m-8-10 4 2-4 2z',quote:'M4 6h7v7l-4 5H4l3-5H4z M14 6h7v7l-4 5h-3l3-5h-3z',coins:'M5 7c0-4 14-4 14 0s-14 4-14 0z M5 7v5c0 4 14 4 14 0V7 M5 12v5c0 4 14 4 14 0v-5',cursor:'m4 3 6 17 3-7 7-3z',funnel:'M3 4h18l-7 8v6l-4 2v-8z',flag:'M5 21V4m0 1c5-4 9 3 15-1v10c-7 3-9-3-15 0',beaker:'M8 3h8 M10 3v6l-6 10c-.5 1 .2 2 2 2h12c1.8 0 2.5-1 2-2L14 9V3 M7 15h10',download:'M12 3v12m-5-5 5 5 5-5 M4 15v5h16v-5',upload:'M12 16V3m-5 5 5-5 5 5 M4 15v5h16v-5',x:'m5 5 14 14M19 5 5 19',info:'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0z M12 11v5 M12 7v.1',edit:'m4 16 11-11 4 4L8 20l-5 1z M13 7l4 4',list:'M8 6h13M8 12h13M8 18h13 M3 6h.1M3 12h.1M3 18h.1',play:'m6 3 14 9-14 9z',filter:'M3 6h18M6 12h12M9 18h6',clock:'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0z M12 6v6l4 2',image:'M3 3h18v18H3z M3 16l6-6 5 5 2-2 5 5',copy:'M8 8h12v13H8z M5 16H3V3h12v2',pin:'M12 22s8-8 8-13A8 8 0 0 0 4 9c0 5 8 13 8 13z M15 9a3 3 0 1 1-6 0 3 3 0 1 1 6 0z',history:'M3 12a9 9 0 1 1 2 6 M3 5v7h7 M12 7v5l4 3'
};
const ico=name=>`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.grid}"/></svg>`;
const h=escapeHtml;
function btn(label,act,icon='',cls='',value=''){return `<button type="button" class="btn ${cls}" data-act="${h(act)}" data-id="${h(value)}">${icon?ico(icon):''}${h(label)}</button>`;}
const badge=(label,cls='')=>`<span class="badge ${cls}">${h(label)}</span>`;
const empty=(title,body,action='')=>`<div class="empty">${ico('layers')}<h3>${h(title)}</h3><p>${h(body)}</p>${action}</div>`;
const head=(title,subtitle,actions='')=>`<div class="pagehead"><div><h1>${h(title)}</h1>${subtitle?`<p class="sub">${h(subtitle)}</p>`:''}</div><div class="buttons">${actions}</div></div>`;
const option=(v,label,selected)=>`<option value="${h(v)}" ${v===selected?'selected':''}>${h(label)}</option>`;
function field(label,k,value,opts={}){const attr=`name="${h(k)}" ${opts.req?'required':''} maxlength="${opts.max||6500}" placeholder="${h(opts.placeholder||'')}"`;
  return `<label class="field ${opts.wide?'wide':''}"><span>${h(label)}${opts.req?'<em>*</em>':''}</span>${opts.rows?`<textarea rows="${opts.rows}" ${attr}>${h(value)}</textarea>`:`<input type="text" ${attr} value="${h(value)}">`}${opts.hint?`<small class="hint">${h(opts.hint)}</small>`:''}</label>`;
}
const panel=(title,body,extra='')=>`<section class="panel"><div class="panel-title"><h2>${h(title)}</h2>${extra}</div>${body}</section>`;
function riskBadge(c,b){const s=reviewState(c,b);return badge(s,{'高风险':'high','已审核':'good','待人工审核':'medium','待语义复核':'blue'}[s]);}
function directionIcon(d){return `<span class="icon-tile ${DIRECTIONS[d].color}">${ico(DIRECTIONS[d].icon)}</span>`;}
const navItems=[['overview','项目总览','grid'],['agent','Agent 工作台','layers'],['workspace','项目资料','folder'],['brief','营销 Brief','file'],['creative','创意工坊','spark'],['audit','质检与审核','shield'],['report','投放复盘','chart'],['quality','营销评测','beaker']];
const storeKey='meridian-creative-workspace-v1';
let db;
try{const val=JSON.parse(localStorage.getItem(storeKey)||'null');if(val?.projects?.length&&val.projects.some(p=>p.id===val.active))db=val;}catch{}
if(!db){const p=makeSample();db={version:1,projects:[p],active:p.id};}
const project=()=>db.projects.find(p=>p.id===db.active);
const firstRoute=workbenchRoute(location.hash.slice(1))||{page:'overview'};
let page=firstRoute.page,settingsTab=firstRoute.tab||'api',settingsReturnTo='overview',modelFormEdited=false;
let modelStatus={local:null,server:null,localApp:false,configured:{}},provider='',providerChosen=false;
let sessionOptions={baseUrl:'',model:'',key:''},saveFailed=false,toastTimer,job=null;
let filters={market:'',platform:'',audit:'',country:'',adPlatform:''},modalCtx=null;
const $=s=>document.querySelector(s);
function save(){try{localStorage.setItem(storeKey,JSON.stringify(db));saveFailed=false;}catch{saveFailed=true;}savedStatus();}
function savedStatus(){const el=$('#save-status');if(el)el.innerHTML=ico(saveFailed?'info':'check')+(saveFailed?'存储空间不足，本次修改仅在当前会话中可用':globalThis.meridianDesktop?'已保存到本机':'已保存到此浏览器');}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('on'),4200);}
function activeConnection(){
  if(!Object.hasOwn(CHAT_PROVIDERS,provider))return {provider};
  const preset=CHAT_PROVIDERS[provider],saved=modelStatus.configured?.[provider];
  return {provider,baseUrl:sessionOptions.baseUrl||saved?.baseUrl||preset.baseUrl,model:sessionOptions.model||saved?.model||preset.model,key:sessionOptions.key};
}
function modelName(){
  if(provider==='local')return modelStatus.local;
  if(!Object.hasOwn(CHAT_PROVIDERS,provider))return null;
  return activeConnection().model||null;
}
function updateModelLabel(){
  const label=$('#settings-model-status');if(label)label.textContent=modelName()||'示例模式';
}
async function refreshModel(){
  try{const res=await fetch('/api/status',{signal:AbortSignal.timeout(5500)});if(res.ok){const s=await res.json();if('server' in s)modelStatus=s;}}catch{}
  if(!providerChosen)provider=modelStatus.local?'local':Object.keys(modelStatus.configured||{})[0]||'';
  updateModelLabel();if(settingsAt('records'))diagSyncInbound(db.active);
  if(settingsAt('api')&&!modelFormEdited&&$('#settings-model-form')&&$('#model-provider')){
    const select=$('#model-provider'),available=modelProviderOptions();
    if(select.dataset.options!==available){select.innerHTML=available;select.dataset.options=available;renderModelFields();}
  }
}
function progressHtml(){
  if(job)return `<div class="progress-box" role="status"><span class="spin"></span><span>${h(job.message)}</span>${btn('停止','cancel-job','','small')}</div>`;
  if(agentActive&&page!=='agent'&&agentActive.pid===db.active)return `<div class="progress-box" role="status"><span class="spin"></span><span>Agent 正在执行项目任务</span>${btn('查看进度','agent-track','','small')}${btn('停止','agent-stop','','small',agentActive.id)}</div>`;
  return '';
}
function updateProgress(){const box=$('#job-area');if(box)box.innerHTML=progressHtml();}
function render(force=false){
  const p=project(),inSettings=page==='settings',label=inSettings?'设置':navItems.find(n=>n[0]===page)[1];
  document.title=label+' · 经纬创意';
  $('#nav').innerHTML=navItems.map(([key,title,icon])=>`<button class="nav-item ${key===page?'active':''}" data-act="nav" data-id="${key}" ${key===page?'aria-current="page"':''}>${ico(icon)}${title}</button>`).join('');
  const launch=$('#settings-launch');
  if(launch){launch.classList.toggle('active',inSettings);launch.setAttribute('aria-current',inSettings?'page':'false');}
  $('#crumb').textContent=label;
  const current=$('#settings-content');
  if(!force&&inSettings&&['api','mcp'].includes(settingsTab)&&current?.dataset?.tab===settingsTab&&current.dataset.project===p.id){updateProgress();return;}
  const views={overview:overviewView,workspace:spaceView,agent:agentView,brief:briefView,creative:creativeView,audit:auditView,report:reportView,quality:qualityView,settings:settingsView};
  $('#view').innerHTML=`<div id="job-area">${progressHtml()}</div>${views[page](p)}`;
  if(settingsAt('api')){
    modelFormEdited=false;const select=$('#model-provider');if(select){select.dataset.options=modelProviderOptions();renderModelFields();}
  }
  if(page==='overview')requestAnimationFrame(()=>drawMap(p.brief.markets));
  savedStatus();
}
function go(key,record=true){
  const route=workbenchRoute(key);if(!route)return;
  const tab=route.tab||settingsTab;
  if(page!=='settings'&&route.page==='settings')settingsReturnTo=page;
  if(settingsAt('api')&&(route.page!=='settings'||tab!=='api'))resetProbe();
  const same=page===route.page&&(page!=='settings'||settingsTab===tab);
  closeDialog();page=route.page;settingsTab=tab;
  const hash='#'+(page==='settings'?'settings/'+tab:page);
  if(location.hash!==hash){
    if(record&&history.pushState)history.pushState(null,'',hash);else history.replaceState(null,'',hash);
  }
  $('#sidebar').classList.remove('open');render(!same);
  if(settingsAt('records')){diagEnsure(db.active,true);diagSyncInbound(db.active);}
  if(settingsAt('mcp')&&mcpTab==='in'&&mcpLocal()&&!mcpBusy)mcpAction('mcp-status').catch(showError);
  if((page==='workspace'||page==='agent')&&globalThis.indexedDB)spaceRefresh();
  window.scrollTo(0,0);
}
function openDialog(title,body,foot='',wide=false){
  const el=$('#dialog');el.classList.toggle('wide',wide);
  el.innerHTML=`<div class="dialog-head"><h2 id="dlg-title">${h(title)}</h2><button class="iconbtn" data-act="close" aria-label="关闭">${ico('x')}</button></div><div class="dialog-body">${body}<p class="error-msg" id="dlg-error" role="alert"></p></div>${foot?`<div class="dialog-foot">${foot}</div>`:''}`;
  el.setAttribute('aria-labelledby','dlg-title');if(!el.open)el.showModal();
}
function closeDialog(){if($('#dialog').open)$('#dialog').close();modalCtx=null;}
function showError(e){diagError(e,'工作台操作');const message=e?.message||String(e);if($('#dialog').open&&$('#dlg-error'))$('#dlg-error').textContent=message;else if(page==='settings'&&$('#settings-error'))$('#settings-error').textContent=message;else toast(message);}
function download(name,body,type='text/plain;charset=utf-8'){
  const safeName=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
  if(globalThis.meridianDesktop)return globalThis.meridianDesktop.saveText(safeName,body);
  const url=URL.createObjectURL(new Blob([body],{type})),a=document.createElement('a');a.href=url;a.download=safeName;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function statBlock(r,currency){
  const a=r.all;return `<div class="statgrid">${[['投放花费',money(a.spend,currency),'coins',number(a.impressions)+' 次展示'],['点击率 CTR',pct(a.ctr),'cursor',number(a.clicks)+' 次点击'],['转化率 CVR',pct(a.cvr),'funnel',number(a.conversions)+' 次转化'],['转化成本 CPA',money(a.cpa,currency),'flag','每次点击 '+money(a.cpc,currency)]].map(([k,v,ic,foot])=>`<article class="stat"><div class="stat-top">${k}${ico(ic)}</div><div class="metric-value">${v}</div><div class="stat-foot">${foot}</div></article>`).join('')}</div>`;
}
function strategyChart(r){const max=Math.max(.01,...r.byDir.flatMap(x=>[x.ctr||0,x.cvr||0]));return `<div class="horizontal"><span class="key"><i class="dot" style="background:#32796c"></i>点击率 CTR</span><span class="key"><i class="dot" style="background:#ed9166"></i>转化率 CVR</span></div><div class="chart">${r.byDir.map(x=>`<div class="chart-row"><strong>${DIRECTIONS[x.d].short}</strong><div class="chart-pair"><i class="bar" style="background:#32796c;width:${(x.ctr||0)*100/max}%"></i><i class="bar" style="background:#ed9166;width:${(x.cvr||0)*100/max}%"></i></div><div class="chart-value"><span>${pct(x.ctr)}</span><span>${pct(x.cvr)}</span></div></div>`).join('')}</div>`;}
function projectMethod(){
  const steps=[
    ['从产品事实生成三个方向','每份 Brief 明确市场、渠道、受众和可引用证据。痛点、场景和社会证明三个方向各自生成脚本、分镜与本地语言文案。'],
    ['让审核人看到具体问题','程序核对长度、术语和参数，模型再逐项检查语义与文化表达。问题定位到原文，修改后须重新审核，人工确认后才能导出。'],
    ['把投放差异写成下一轮实验','从展示、点击、转化和花费计算指标。在同一国家、平台和受众内比较素材，固定其余条件，把待测试变量和衡量指标带入下一轮 Brief。']
  ];
  openDialog('项目说明',`<div class="method-intro"><h3>出海创意本地化与投放复盘</h3><p>面向同时管理多个市场与广告平台的营销团队，将创意制作、审稿记录和下一轮实验保存在同一份任务中。</p></div><div class="method-list">${steps.map(([title,body])=>`<section><h4>${h(title)}</h4><p>${h(body)}</p></section>`).join('')}</div><p class="source-note">内置 Folda Go 产品 Brief、访谈摘录与投放 CSV 均为演示数据。自建项目可接入真实模型并导入自己的投放记录。</p>`,btn('查看当前 Brief','nav','file','','brief')+btn('查看投放复盘','nav','chart','primary','report'));
}
function evidencePanel(p,exp){
  if(!exp)return '';
  return `<section class="case-evidence" aria-labelledby="evidence-heading"><div class="evidence-observation"><div class="evidence-kicker"><span>${h(p.sourceType||'投放数据')}</span>投放观察</div><h2 id="evidence-heading">${h(exp.name)}<span>${h(exp.type)}</span></h2><p>${h(exp.signal)}</p><small>对照范围 · ${h([exp.country,exp.platform,exp.audience].join(' / '))}</small></div><div class="evidence-action"><h3>下一轮验证什么</h3><p>${h(exp.keep+' '+exp.b)}</p><button class="evidence-link" data-act="nav" data-id="report">查看完整实验方案 <span aria-hidden="true">→</span></button></div></section>`;
}
function overviewView(p){
  const b=p.brief,r=report(p.data,p.currency,b.goal),exp=r.experiments[0];
  const hero=`<section class="hero"><canvas id="route-map" aria-hidden="true"></canvas><div class="hero-info"><div class="hero-flag"><i></i>${p.demo?'示例项目':'当前项目'}<span>· 第 ${p.round} 轮</span></div><h2>${h(b.name||'未命名营销任务')}</h2><div class="hero-meta"><span>${ico('globe')}${h(selectionSummary('markets',b.markets,3))}</span><span>${ico('layers')}${h(selectionSummary('platforms',b.platforms,3))}</span><span>${ico('flag')}${h(b.goal)}</span></div><div class="hero-actions">${p.cards.length?btn('浏览创意方案','nav','frame','warm','creative'):btn('填写营销 Brief','nav','file','warm','brief')}${p.cards.length?btn('查看 Brief','nav','','hero-secondary','brief'):''}</div></div></section>`;
  const dirs=Object.entries(DIRECTIONS).map(([key,d])=>{const group=p.cards.filter(c=>c.direction===key),n=group.filter(c=>reviewState(c,b)==='已审核').length;return `<button class="dir-row" data-act="direction" data-id="${key}">${directionIcon(key)}<span><strong>${d.name}</strong><small>${h(d.en)}</small></span><span class="round">${n} / ${group.length} 已审</span></button>`;}).join('');
  return head('项目总览','最后更新 '+diagMoment(projectModified(p)),btn('新建营销任务','new','plus','primary'))+hero+evidencePanel(p,exp)+`<div class="sectionline"><h2>投放表现</h2><span class="hint">${badge(p.sourceType||'尚无数据',p.sourceType==='模拟数据'?'orange':'')} ${h(p.currency)} · ${r.creative.length} 条素材</span></div>`+(p.data.length?statBlock(r,p.currency):empty('等待投放数据','导入带展示、点击、转化和花费的 CSV 后可查看表现。',btn('导入投放数据','import-csv','upload','small')))+`<div class="dashboard-lower">${panel('策略效果对比',p.data.length?strategyChart(r):empty('暂无策略数据','上传 CSV 后可比较三个方向。'),btn('查看复盘','nav','','small','report'))}${panel('创意审核进度',dirs,btn('查看质检','nav','','small','audit'))}</div>`;
}
const landShapes=[
  [[-167,68],[-145,72],[-132,65],[-107,72],[-83,70],[-63,60],[-80,49],[-67,46],[-83,27],[-98,18],[-106,21],[-118,32],[-126,48],[-145,59],[-159,57]],
  [[-91,19],[-83,20],[-77,8],[-81,7]], [[-81,10],[-68,12],[-51,3],[-34,-6],[-45,-25],[-57,-39],[-69,-55],[-75,-38],[-77,-16]],
  [[-73,60],[-50,59],[-22,73],[-28,82],[-55,84]], [[-10,36],[-10,44],[-3,49],[-5,55],[7,57],[7,62],[20,72],[31,69],[30,60],[48,68],[88,74],[110,77],[142,70],[172,65],[179,53],[153,52],[141,46],[132,42],[124,33],[122,23],[108,19],[108,10],[98,6],[91,19],[79,8],[72,19],[59,23],[53,17],[42,13],[34,30],[25,36],[14,36],[6,44]],
  [[-17,16],[-9,31],[4,37],[24,32],[35,29],[43,12],[52,11],[46,1],[40,-12],[34,-26],[24,-35],[16,-27],[11,-12],[9,3],[-4,5]],
  [[112,-22],[117,-14],[130,-12],[138,-16],[144,-10],[153,-25],[148,-39],[132,-34],[116,-35]], [[94,6],[105,-5],[106,-8],[100,-4]],[[107,-6],[116,-8],[114,-9],[106,-8]],[[110,1],[116,6],[119,1],[116,-4],[111,-3]],[[127,1],[138,-3],[152,-5],[149,-10],[137,-9]],[[47,-13],[51,-16],[47,-25],[44,-24]],[[129,31],[136,35],[143,43],[146,44],[142,35],[134,31]]
];
function inside(x,y,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [a,b]=poly[i],[c,d]=poly[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)yes=!yes;}return yes;}
function drawMap(markets){const el=$('#route-map');if(!el)return;const W=el.clientWidth,H=el.clientHeight;if(!W||!H)return;
  const ratio=Math.min(devicePixelRatio||1,2);el.width=W*ratio;el.height=H*ratio;const ctx=el.getContext('2d');if(!ctx)return;ctx.scale(ratio,ratio);
  const px=lng=>(lng+182)*W/369,py=lat=>(82-lat)*H/148;
  ctx.strokeStyle='rgba(174,209,184,.09)';ctx.lineWidth=.7;
  for(let lng=-180;lng<=180;lng+=30){ctx.beginPath();ctx.moveTo(px(lng),0);ctx.lineTo(px(lng),H);ctx.stroke();}
  for(let lat=-60;lat<=80;lat+=20){ctx.beginPath();ctx.moveTo(0,py(lat));ctx.lineTo(W,py(lat));ctx.stroke();}
  const pitch=Math.max(3.4,W/142);ctx.fillStyle='#6d9690';for(let y=2;y<H;y+=pitch)for(let x=2;x<W;x+=pitch){if(landShapes.some(a=>inside(x*369/W-182,82-y*148/H,a))){ctx.beginPath();ctx.arc(x,y,Math.max(.8,pitch*.28),0,7);ctx.fill();}}
  const origin=[px(120),py(30)],few=markets.length<=5;
  for(const id of markets){
    const point=MARKETS[id]?.point;if(!point)continue;
    const x=px(point[1]),y=py(point[0]);if(y<0||y>H)continue;
    if(few){
      ctx.strokeStyle='#ed976d';ctx.lineWidth=1.55;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(...origin);
      ctx.quadraticCurveTo((x+origin[0])/2,Math.min(y,origin[1])-H*(id==='ID'?.04:.28),x,y);ctx.stroke();ctx.setLineDash([]);
    }
    ctx.fillStyle='#ef966d';ctx.beginPath();ctx.arc(x,y,few?4:2.6,0,7);ctx.fill();
    if(!few)continue;
    ctx.strokeStyle='#e7a18188';ctx.beginPath();ctx.arc(x,y,8,0,7);ctx.stroke();
    const label=id==='US'?'NEW YORK':id==='ID'?'JAKARTA':id;
    ctx.font='bold '+Math.max(9,Math.min(11,W/42))+'px Consolas,monospace';
    const tw=ctx.measureText(label).width,xx=Math.max(4,Math.min(x-tw/2,W-tw-8)),yy=Math.min(y+23,H-10);
    ctx.fillStyle='#163a3b';ctx.fillRect(xx-4,yy-11,tw+8,15);ctx.fillStyle='#ffe1c6';ctx.fillText(label,xx,yy);
  }
  ctx.fillStyle='#d6e6cf';ctx.beginPath();ctx.arc(...origin,3.5,0,7);ctx.fill();
}

