function cardById(cardId){const c=project().cards.find(x=>x.id===cardId);if(!c)throw Error('请先生成这条创意。');return c;}
function creativeContent(c){
  return `<div class="tags">${directionIcon(c.direction)}${badge(DIRECTIONS[c.direction].name)}${badge(MARKETS[c.market].name+' · '+MARKETS[c.market].lang)}${badge(c.platform)}${badge(c.origin==='sample'?'预置示例':'模型生成','green')}</div><div class="cols2"><div class="slot"><h4>核心创意洞察</h4><p>${h(c.insight)}</p></div><div class="slot"><h4>目标人群与推荐理由</h4><p>${h(c.audience)}。${h(c.reason)}</p></div></div><section><h3>标题与广告正文</h3><p><strong>${h(c.title)}</strong></p><p>${h(c.copy)}</p><div class="tags">${badge('CTA · '+c.cta,'green')}${c.tags.map(t=>badge(t)).join('')}</div></section><section><h3>15 秒脚本与分镜</h3><div class="stack" style="margin-top:10px">${c.shots.map(s=>`<div class="shot"><strong class="num">${s.time}</strong><p><label>画面</label>${h(s.visual)}</p><p><label>旁白</label>${h(s.voice)}</p><p><label>字幕</label>${h(s.subtitle)}</p></div>`).join('')}</div></section>${c.proof?`<div class="helper-info">证据来源 · ${h(c.proof)}</div>`:''}`;
}
function detailDialog(cardId){
  const c=cardById(cardId);modalCtx={cardId};openDialog(c.title,creativeContent(c),btn('编辑创意','edit','edit','',c.id)+btn('进入审阅','review','shield','primary',c.id),true);
}
function editDialog(cardId){
  const c=cardById(cardId);modalCtx={cardId,revision:c.revision};
  const form=`<form id="card-edit" class="stack"><div class="formgrid">${['insight','audience','reason','title','copy','cta','tags','proof'].map(k=>field(FIELDS[k],k,k==='tags'?c.tags.join(' '):c[k],{rows:['copy','insight','reason','proof'].includes(k)?2:0,req:!['proof'].includes(k),wide:k==='copy'})).join('')}</div><h3>15 秒脚本与分镜</h3>${c.shots.map((s,i)=>`<div class="slot"><h4>${s.time}</h4><div class="formgrid">${field('画面','visual'+i,s.visual,{wide:true,req:true})}${field('旁白','voice'+i,s.voice,{rows:2,req:true})}${field('字幕','subtitle'+i,s.subtitle,{rows:2,req:true})}</div></div>`).join('')}</form>`;
  openDialog('编辑创意',form,btn('取消','close')+btn('保存并重新质检','save-card','check','primary',c.id),true);
}
function saveCard(cardId){const c=cardById(cardId),form=$('#card-edit');if(!form.reportValidity())return;
  if(modalCtx.revision!==c.revision)throw Error('创意已更新，请重新打开编辑。');
  const f=new FormData(form),draft={direction:c.direction};
  for(const k of Object.keys(FIELDS))draft[k]=String(f.get(k)||'').trim();draft.tags=draft.tags.split(/[\s,，;；]+/).filter(Boolean);
  draft.shots=TIMES.map((_,i)=>Object.fromEntries(['visual','voice','subtitle'].map(k=>[k,String(f.get(k+i)||'')])));
  const newCard=checkedCard(draft,project().brief,c.market,c.platform,c.direction);
  const comparable=v=>JSON.stringify([Object.keys(FIELDS).map(k=>v[k]),v.shots]);if(comparable(c)===comparable(newCard)){reviewDialog(c.id);return;}
  newCard.origin=c.origin;newCard.revision=c.revision+1;const p=project();p.cards=p.cards.map(v=>v.id===c.id?newCard:v);p.updated=Date.now();save();render();reviewDialog(c.id);toast('已保存新版本，旧审核已失效。');
}
function issueHtml(x){
  return `<article class="risk"><div class="state-line">${badge(x.level+'风险',{'高':'high','中':'medium','低':'blue'}[x.level])}<strong>${h(fieldName(x.path))}</strong><span class="small-label">${h(x.source)}</span></div><div class="quote-line">${h(x.quote)}</div><p>${h(x.reason)}</p><p class="muted">修改建议 · ${h(x.fix)}</p></article>`;
}
function reviewDialog(cardId){
  const p=project(),c=cardById(cardId),issues=allIssues(c,p.brief),ready=semanticReady(c),high=issues.some(x=>x.level==='高');
  const status=reviewState(c,p.brief),done=status==='已审核',can=ready&&!high;
  modalCtx={cardId,revision:c.revision,pid:p.id};
  let body=`<div class="tags">${riskBadge(c,p.brief)}${badge(DIRECTIONS[c.direction].name)}${badge(MARKETS[c.market].name+' / '+c.platform)}${badge('版本 '+c.revision)}</div>
  <div class="slot"><h4>规则检查与语义复核</h4><p>程序规则已运行 · ${ready?h(c.semantic.engine)+' 已复核':'等待独立模型复核'}</p><p class="hint">${h(PROFILE[c.platform].placement)} · 正文 ${PROFILE[c.platform].weighted?weighted(c.copy):countText(c.copy)} 字符位。</p></div>
  <details open><summary>问题位置与修改建议（${issues.length}）</summary>${issues.length?issues.map(issueHtml).join(''):`<p class="hint">${ready?'当前版本的两项检查均未发现问题。':'程序检查未发现问题；语义复核尚未完成。'}</p>`}</details>
  <details><summary>查看完整创意与分镜</summary><div class="stack" style="margin-top:12px">${creativeContent(c)}</div></details>`;
  if(done)body+=`<div class="helper-info">人工确认已记录 · ${h(c.approval.by)} · ${h(new Date(c.approval.at).toLocaleString('zh-CN'))}</div>`;
  if(can&&!done)body+=`<label class="field"><span>审阅人</span><input id="review-by" maxlength="60" placeholder="姓名或团队代号" autocomplete="off"></label><label class="review-check"><input type="checkbox" id="human-ack"><span>我已核对这条创意的完整脚本、品牌事实、证据授权与目标市场表达，并接受当前版本的剩余提示。</span></label>`;
  if(high)body+=`<div class="warnbox">本版本存在高风险。请按对应字段的建议修改，再运行复核。</div>`;
  const confirmButtons=can?(done?btn('人工确认后导出','export-one','download','primary',cardId):btn('确认审核','approve','','',cardId)+btn('人工确认后导出','approve-export','download','primary',cardId)):'';
  openDialog('审阅 · '+c.title,body,btn('编辑创意','edit','edit','small',c.id)+(ready?'':btn('运行模型复核','audit-one','spark','small',c.id))+confirmButtons,true);
}
function confirmCard(cardId,wantExport){
  const p=project(),c=cardById(cardId);
  if(modalCtx?.pid!==p.id||modalCtx.revision!==c.revision)throw Error('版本已变化，请重新审阅。');
  if(!semanticReady(c)||allIssues(c,p.brief).some(i=>i.level==='高'))throw Error('当前版本尚未通过必要的检查。');
  const by=$('#review-by')?.value.trim();
  if(!by||!$('#human-ack')?.checked)throw Error('请填写审阅人并勾选人工确认。');
  c.approval={by,at:new Date().toISOString(),revision:c.revision};p.updated=Date.now();save();render();
  if(wantExport)return exportCards([c]);
  closeDialog();toast('已记录人工审核。');
}
function exportCards(cards){
  const p=project();if(!cards.length||cards.some(c=>reviewState(c,p.brief)!=='已审核'))throw Error('请先完成人工审核，再导出当前版本。');
  const lines=['# '+p.brief.name,'','第 '+p.round+' 轮 · '+(p.demo?'模拟案例':'营销创意')+' · '+new Date().toLocaleString('zh-CN'),''];
  for(const c of cards){lines.push('## '+c.title,'',MARKETS[c.market].name+' / '+MARKETS[c.market].lang+' / '+c.platform+' / '+DIRECTIONS[c.direction].name,'','创意洞察：'+c.insight,'目标人群：'+c.audience,'推荐理由：'+c.reason,'','正文：'+c.copy,'CTA：'+c.cta,'标签候选：'+c.tags.join(' '),'','### 15 秒脚本与分镜','');
    for(const s of c.shots)lines.push('**'+s.time+'**','画面：'+s.visual,'旁白：'+s.voice,'字幕：'+s.subtitle,'');
    if(c.proof)lines.push('证据来源：'+c.proof,'证据原文：'+p.brief.evidence,'');
    lines.push('规则与语义复核：'+c.semantic.engine+'；版位：'+PROFILE[c.platform].placement,'审阅人：'+c.approval.by+' / '+c.approval.at+' / 版本 '+c.revision,'');
    for(const i of allIssues(c,p.brief))lines.push('已人工核对 · '+i.level+'风险 · '+fieldName(i.path)+' · '+i.reason+' '+i.fix);
    lines.push('','---','');}
  const file=download(p.brief.name+'-已审核创意.md','\uFEFF'+lines.join('\n'),'text/markdown;charset=utf-8');
  function finished(saved){
    if(saved===false){toast('已取消导出，审核记录已保留。');return false;}
    if(globalThis.meridianDesktop){
      (p.exports??=[]).push({at:new Date().toISOString(),count:cards.length,cards:cards.map(c=>({id:c.id,revision:c.revision}))});
      p.updated=Date.now();save();
    }
    closeDialog();toast('已导出 '+cards.length+' 条经人工确认的创意。');return true;
  }
  return file&&typeof file.then==='function'?file.then(finished):finished(file);
}
function exportDialog(){
  const p=project(),approved=p.cards.filter(c=>reviewState(c,p.brief)==='已审核');
  const last=p.exports?.at(-1);
  const recent=last?.at&&last.count?`<p class="hint">上次保存文件 · ${h(new Date(last.at).toLocaleString('zh-CN'))} · ${h(last.count)} 条创意</p>`:'';
  openDialog('导出已审核创意',recent+(approved.length?`<p>本次可导出 ${approved.length} 条已审核创意，含完整分镜、文案、引用来源与审核记录。</p><div class="stack">${approved.map(c=>`<div class="listrow"><strong>${h(c.title)}</strong><p class="hint">${MARKETS[c.market].name} · ${c.platform} · ${h(c.approval.by)}</p></div>`).join('')}</div>`:empty('尚无已审核创意','打开审核队列中的「审阅」，核对内容后勾选人工确认。')),approved.length?btn('人工确认后导出','export-approved','download','primary'):btn('返回审核队列','nav','shield','primary','audit'));
}
let probeController=null;
function resetProbe(){
  probeController?.abort();probeController=null;
  const el=$('#model-test-result');if(el){el.textContent='';el.className='hint';}
  const button=$('#settings-model-form [data-act="test-connect"]');if(button)button.disabled=false;
}
function modelProviderOptions(){
  const selected=provider||(providerChosen?'':'deepseek'),items=[['deepseek','DeepSeek'],['openai','OpenAI']];
  if(modelStatus.localApp||modelStatus.configured?.compatible)items.push(['compatible',CHAT_PROVIDERS.compatible.label]);
  if(modelStatus.localApp||modelStatus.local)items.push(['local','本机 Ollama']);
  items.push(['','仅使用预置示例']);
  return items.map(([value,label])=>option(value,label,selected)).join('');
}
function modelSettingsView(){
  if(location.protocol==='file:')return panel('模型 API','<p>请打开 Windows 桌面版，或双击便携包内的 <strong>Start-Workbench.cmd</strong>，在同一设置页连接模型。</p>');
  return panel('模型 API',`<div id="settings-model-form" class="stack"><label class="field"><span>模型服务</span><select id="model-provider">${modelProviderOptions()}</select></label>
    <div id="model-fields" class="stack"></div><p id="model-test-result" class="hint" role="status" aria-live="polite"></p>
    <div class="buttons">${btn('测试连接','test-connect','plug')}${btn('保存模型连接','save-connect','check','primary')}</div></div>`,
    `<small class="hint">当前 · <span id="settings-model-status">${h(modelName()||'示例模式')}</span></small>`);
}
function renderModelFields(){
  resetProbe();const selected=$('#model-provider').value,wrap=$('#model-fields');
  $('#settings-error').textContent='';
  const test=$('#settings-model-form [data-act="test-connect"]');if(test)test.disabled=!selected;
  if(!selected){wrap.innerHTML='<p class="helper-info">当前使用预置示例。选择模型服务可生成自己的创意并运行语义复核。</p>';return;}
  if(selected==='local'){
    wrap.innerHTML=`<p class="helper-info">本机模型 · ${h(modelStatus.local||'未检测到模型')}</p>${btn('重新检测 Ollama','detect-model','plug','small')}`;return;
  }
  const preset=CHAT_PROVIDERS[selected],saved=modelStatus.configured?.[selected],current=activeConnection();
  const base=current.provider===selected?current.baseUrl:saved?.baseUrl||preset.baseUrl;
  const model=current.provider===selected?current.model:saved?.model||preset.model;
  const locked=selected!=='compatible'||!modelStatus.localApp;
  wrap.innerHTML=`<label class="field"><span>API Base URL</span><input id="model-base" type="text" inputmode="url" maxlength="1500" autocomplete="off" spellcheck="false" value="${h(base)}" ${locked?'readonly':''} placeholder="https://gateway.example/v1"></label>
    <label class="field"><span>模型 ID</span><input id="model-id" type="text" maxlength="240" autocomplete="off" spellcheck="false" value="${h(model)}" placeholder="填写服务商提供的模型名"></label>
    <label class="field"><span>API Key</span><input type="password" id="session-key" autocomplete="off" spellcheck="false" maxlength="4096"></label>
    <p class="hint">${selected==='compatible'?'支持带路径的 Base URL 和完整的 /chat/completions 地址。本机免鉴权服务可留空密钥。':'使用该服务商的 API Key。'} 密钥仅在当前页面会话中使用。</p>
    <div class="helper-info">测试会向所选模型发送一次简短的 JSON 请求。保存后，创意生成与语义复核共用此配置。</div>
    ${modelStatus.localApp&&(!globalThis.meridianDesktop||globalThis.meridianDesktop.apiOrigin)?`<details><summary>使用 Postman 或 OpenAI SDK 测试</summary><p class="hint">本机非流式端点</p><code class="break">${h(globalThis.meridianDesktop?.apiOrigin||location.origin)}/v1/chat/completions</code><p class="hint">API Key 通过 Bearer 请求头传入，也可在启动前设置环境变量。窗口中填写的密钥仅供当前会话使用。</p></details>`:''}`;
  updateKeyHint();
}
function keyScope(selected,base){
  let normalized;
  try{normalized=chatBaseUrl(base);}catch{return {reuse:false,server:false};}
  const cur=activeConnection(),saved=modelStatus.configured?.[selected];
  return {reuse:cur.provider===selected&&cur.baseUrl===normalized&&!!cur.key,server:!!saved?.hasKey&&(selected!=='compatible'||saved.baseUrl===normalized)};
}
function updateKeyHint(){
  const el=$('#session-key');if(!el||!$('#model-base'))return;
  const vendor=$('#model-provider').value,scope=keyScope(vendor,$('#model-base').value);
  el.placeholder=scope.reuse?'留空沿用当前服务的会话密钥':scope.server?'服务端已配置，可留空':vendor==='compatible'?'按服务商要求填写':'输入 '+CHAT_PROVIDERS[vendor].label+' API Key';
}
function connectionFromForm(){
  const vendor=$('#model-provider')?.value||'';
  if(vendor==='local'&&!modelStatus.local)throw Error('请先启动 Ollama，然后点击「重新检测 Ollama」。');
  if(!vendor||vendor==='local')return {provider:vendor,baseUrl:'',model:'',key:''};
  const baseUrl=chatBaseUrl($('#model-base').value),model=chatModelId($('#model-id').value);
  const scope=keyScope(vendor,baseUrl),typed=$('#session-key').value.trim();
  const key=typed||(scope.reuse?sessionOptions.key:'');
  if(vendor!=='compatible'&&!key&&!scope.server)throw Error('请填写 '+CHAT_PROVIDERS[vendor].label+' API Key。');
  if(key&&/[\u0000-\u0020\u007f]/.test(key))throw Error('密钥中含空白字符，请重新复制。');
  return {provider:vendor,baseUrl,model,key};
}
function saveConnection(){
  const c=connectionFromForm();provider=c.provider;providerChosen=true;sessionOptions={baseUrl:c.baseUrl,model:c.model,key:c.key};
  modelFormEdited=false;updateModelLabel();resetProbe();if($('#session-key'))$('#session-key').value='';updateKeyHint();$('#settings-error').textContent='';toast('已保存本次会话的模型连接。');
}
async function modelRequest(route,config,payload,signal){
  const {key,...settings}=config;
  const ctx=diagBinding(signal),base={...diagNew(ctx,'model',diagRoute[route]||route),route},capture=diagBodies(ctx.pid);
  const body={...payload,...settings},headers={'content-type':'application/json','x-meridian-trace':capture?'body':'summary'};
  if(key)headers['x-session-model-key']=key;
  const ticket=budgetBegin(ctx);if(ticket)headers['x-meridian-token-budget']=String(ticket.amount);
  let response,data,error;
  try{
    try{response=await fetch('/api/'+route,{method:'POST',headers,body:JSON.stringify(body),signal});}
    catch{throw Error(signal?.aborted?'请求已停止。':globalThis.meridianDesktop?'模型连接中断，请在「设置 → API 接入」中重新测试。':'无法连接工作台服务，请通过本地启动器打开页面。');}
    try{data=await response.json();}catch{throw Error('工作台收到无效回复，请检查服务地址后重试。');}
    if(data.code==='task_token_budget')throw new AgentNeeds(data.error,'budget');
    if(!response.ok||data.error)throw Error(data.error?.message||data.error||'模型服务返回 HTTP '+response.status+'。');
    return data;
  }catch(e){error=e;error.diagCancelled=!!signal?.aborted||response?.status===499;diagSeenErrors.add(e);throw e;}
  finally{
    budgetSettle(ticket,data);
    await diagSave(ctx.pid,diagModelRows(base,data,response,error,body,settings,key,capture));
    if(data&&typeof data==='object')delete data.attempts;
  }
}
async function testConnection(){
  const c=connectionFromForm();if(!c.provider)throw Error('请选择要测试的模型服务。');
  resetProbe();const ctrl=new AbortController();probeController=ctrl;
  const el=$('#model-test-result'),button=$('#settings-model-form [data-act="test-connect"]');
  $('#settings-error').textContent='';button.disabled=true;el.className='helper-info';el.textContent='正在发送测试请求…';
  try{
    const data=await modelRequest('model/test',c,{},ctrl.signal);
    if(probeController!==ctrl||!el.isConnected)return;
    if(data.ok!==true||data.reply?.ok!==true)throw Error('服务没有返回约定的测试结果。');
    el.textContent='连接成功 · '+data.model+' · '+(data.elapsed_ms/1000).toFixed(2)+' 秒'+(Number.isFinite(data.total_tokens)?' · '+data.total_tokens+' tokens':'')+'。模型已返回有效 JSON。';
  }catch(e){
    if(probeController!==ctrl||ctrl.signal.aborted)return;
    el.className='warnbox';el.textContent='测试失败。'+e.message;
  }finally{if(probeController===ctrl){probeController=null;button.disabled=false;}}
}

