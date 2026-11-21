let mcpTab='out',mcpConnection=null,mcpEndpointDraft='',mcpTokenDraft='',mcpSelected='',mcpArguments='{}',mcpOutput=null;
let mcpAccess={active:false},mcpOwner='',mcpBusy='',mcpError='';
const mcpModeNames={http:'Streamable HTTP',sse:'SSE（旧版）',stdio:'stdio（本地进程）'};
let mcpOutMode='http',mcpInMode='http',mcpCommandDraft='',mcpArgsDraft='[]',mcpEnvDraft='{}';
const mcpDraftUrls={http:'',sse:''};
function mcpModeSelect(id,selected){
  return `<fieldset class="mcp-modes" id="${id}"><legend>传输方式</legend><div>${Object.entries(mcpModeNames).map(([k,v])=>
    `<button type="button" data-act="mcp-mode" data-id="${k}" aria-pressed="${k===selected}">${v}</button>`).join('')}</div></fieldset>`;
}
function mcpForm(){
  const stdio=mcpOutMode==='stdio',local=mcpLocal();
  let fields;
  if(stdio)fields=`<label class="field"><span>启动命令</span><input id="mcp-command" value="${h(mcpCommandDraft)}" autocomplete="off" spellcheck="false" placeholder="npx、uvx、node 或可执行文件的完整路径"></label>
    <label class="field"><span>启动参数（JSON 数组）</span><textarea id="mcp-stdio-args" rows="2" spellcheck="false" placeholder='["C:\\\\MCP\\\\server.mjs"]'>${h(mcpArgsDraft)}</textarea><small class="hint">每个参数单独填写为一个字符串，路径中可以有空格。</small></label>
    <details><summary>环境变量（可选）</summary><label class="field"><span>键值 JSON 对象</span><textarea id="mcp-stdio-env" rows="2" autocomplete="off" spellcheck="false">${h(mcpEnvDraft)}</textarea><small class="hint">仅传给这次启动的进程。</small></label></details>
    <p class="hint">${local?'连接时将启动填写的本地程序，断开时终止子进程。':'启动本地进程需要 Windows 桌面版或本地运行包。'}</p>`;
  else fields=`<label class="field"><span>${mcpOutMode==='sse'?'SSE 事件流地址':'MCP 服务地址'}</span><input id="mcp-url" type="url" autocomplete="off" spellcheck="false" placeholder="${mcpOutMode==='sse'?'https://…/sse':'https://…/mcp'}" value="${h(mcpEndpointDraft)}"><small class="hint">${mcpOutMode==='sse'?'填写服务提供的 SSE 入口，工作台会从事件流取得消息发送地址。':'填写服务提供的 Streamable HTTP 地址，也可使用本机地址。'}</small></label>
    <label class="field"><span>Bearer Token（按需填写）</span><input id="mcp-token" type="password" autocomplete="off" value="${h(mcpTokenDraft)}"><small class="hint">仅用于本次连接。</small></label>`;
  return `<div class="stack">${mcpModeSelect('mcp-out-mode',mcpOutMode)}${fields}<details><summary>从客户端 JSON 填入</summary><label class="field"><span>单个 MCP 服务配置</span><textarea id="mcp-json" rows="3" autocomplete="off" spellcheck="false"></textarea></label>${btn('填入连接参数','mcp-fill-config','','small')}</details><div class="buttons"><button type="button" class="btn primary" data-act="mcp-connect" ${stdio&&!local?'disabled':''}>${stdio?'启动并获取工具':'连接并获取工具'}</button></div></div>`;
}
function mcpFillConfig(){
  let parsed;
  try{parsed=JSON.parse($('#mcp-json').value);}catch{throw Error('请粘贴有效的 JSON 配置。');}
  const group=parsed?.mcpServers||parsed?.servers;
  if(group&&(!mcpObject(group)||Object.keys(group).length!==1))throw Error('请粘贴一个服务的配置，或只保留要连接的那一项。');
  const entry=group?Object.values(group)[0]:parsed;
  if(!mcpObject(entry))throw Error('没有找到 MCP 服务配置。');
  const kind=String(entry.type||entry.transport||(entry.command?'stdio':mcpOutMode==='sse'?'sse':'http')).toLowerCase();
  const mode=['http','streamable-http','streamable_http','streamablehttp'].includes(kind)?'http':kind;
  if(!Object.hasOwn(mcpModeNames,mode))throw Error('请选择 Streamable HTTP、SSE 或 stdio 配置。');
  if(mode==='stdio'){
    if(typeof entry.command!=='string'||!entry.command.trim()||!Array.isArray(entry.args??[])||!mcpObject(entry.env??{}))throw Error('stdio 配置需要 command，可选 args 数组和 env 对象。');
    mcpCommandDraft=entry.command;mcpArgsDraft=JSON.stringify(entry.args||[],null,2);mcpEnvDraft=JSON.stringify(entry.env||{},null,2);mcpTokenDraft='';
  }else{
    const endpoint=mcpUrl(entry.url),headers=entry.headers||{};
    if(!mcpObject(headers)||Object.keys(headers).some(k=>k.toLowerCase()!=='authorization'))throw Error('此入口支持 Bearer Token。请核对服务所需的请求头。');
    const auth=Object.values(headers)[0]||'';
    if(auth&&!/^Bearer \S+$/i.test(auth))throw Error('Authorization 须使用 Bearer Token。');
    mcpEndpointDraft=endpoint;mcpDraftUrls[mode]=endpoint;mcpTokenDraft=auth?auth.slice(7):'';
  }
  mcpOutMode=mode;mcpError='';mcpRedraw();
}
function mcpProcessConfig(){
  const command=$('#mcp-command').value.trim();
  let args,env;
  try{args=JSON.parse($('#mcp-stdio-args').value.trim()||'[]');env=JSON.parse($('#mcp-stdio-env').value.trim()||'{}');}
  catch{throw Error('请检查启动参数和环境变量的 JSON 格式。');}
  if(!command||command.length>1024||/[\r\n\0]/.test(command))throw Error('请填写本机程序名称或完整路径。');
  if(!Array.isArray(args)||args.length>128||args.some(v=>typeof v!=='string'||v.includes('\0')||v.length>8192))throw Error('启动参数须为字符串数组。');
  if(!mcpObject(env)||Object.keys(env).length>100||Object.entries(env).some(([k,v])=>!/^[A-Za-z_]\w*$/.test(k)||typeof v!=='string'||v.includes('\0')||v.length>8192))throw Error('环境变量须为名称和字符串值组成的 JSON 对象。');
  return {command,args,env};
}
function mcpLocalKey(){
  try{
    const hash=new URLSearchParams(location.hash.slice(1)),key=hash.get('mcpLaunch');
    if(key&&/^[a-f0-9]{48}$/.test(key)){sessionStorage.setItem('meridian-mcp-launch',key);hash.delete('mcpLaunch');history.replaceState(null,'',location.pathname+location.search+(hash.size?'#'+hash:''));}
    return sessionStorage.getItem('meridian-mcp-launch')||'';
  }catch{return '';}
}
mcpLocalKey();
globalThis.addEventListener?.('pagehide',()=>mcpConnection?.unload?.());
async function mcpConnectSelected(signal){
  const mode=mcpOutMode,isProcess=mode==='stdio',config=isProcess?mcpProcessConfig():null;
  const endpoint=isProcess?'stdio://local/'+agentFingerprint([config.command,config.args,config.env]):mcpUrl($('#mcp-url').value.trim());
  const token=isProcess?'':$('#mcp-token').value.trim();
  if(!isProcess){mcpEndpointDraft=endpoint;mcpTokenDraft=token;}
  mcpBusy=isProcess?'正在启动本地 MCP 程序…':'正在连接并读取工具…';mcpRedraw();
  let exchange=mcpExchange,close=async()=>{},unload=()=>{};
  try{
    if(mode!=='http'){
      let send;
      if(mcpLocal()){
        const headers={};
        if(token)headers['X-Meridian-Mcp-Token']=token;
        if(isProcess&&!globalThis.meridianDesktop)headers['X-Meridian-Launch']=mcpLocalKey();
        const ch=await mcpLocalPost('channel',{action:'open',transport:mode,...(isProcess?{config}:{endpoint})},headers,signal);
        send=(msg,limit)=>mcpLocalPost('channel',{action:'send',id:ch.id,message:msg},{},limit);
        close=()=>mcpLocalPost('channel',{action:'close',id:ch.id},{},AbortSignal.timeout(4000));
        unload=()=>{fetch('/api/mcp/channel',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json','X-Meridian-UI':'mcp'},body:JSON.stringify({action:'close',id:ch.id})}).catch(()=>{});};
      }else{
        if(isProcess)throw Error('请使用桌面版或本地运行包启动 stdio 服务。');
        const sse=new McpLegacySse(endpoint,token,fetch);await sse.open(signal);send=(msg,limit)=>sse.send(msg,limit);close=async()=>sse.close();
      }
      const secrets=isProcess?[...Object.values(config.env),...config.args.filter(s=>s.length>=8)]:[token];
      exchange=(packet,t,limit)=>mcpExchange(packet,t,limit,()=>send(packet.message,limit),secrets);
    }
    const client=new MeridianMcpClient(endpoint,token,exchange,mode,config?.command);
    await client.connect(signal);client.close=close;client.unload=unload;mcpConnection=client;mcpTokenDraft='';mcpEnvDraft='{}';mcpChoose(client.tools[0]?.name);
  }catch(e){await close().catch(()=>{});throw e;}
}
function mcpShareConfig(){
  const origin=mcpLocalAddress(),token=mcpAccess.token;
  const entry=mcpInMode==='stdio'?{type:'stdio',command:mcpAccess.launch.command,args:mcpAccess.launch.args,env:{MERIDIAN_MCP_PIPE:mcpAccess.launch.pipe,MERIDIAN_MCP_TOKEN:token}}:
    {type:mcpInMode,url:origin+(mcpInMode==='sse'?'/sse':'/mcp'),headers:{Authorization:'Bearer '+token}};
  return JSON.stringify({mcpServers:{meridian:entry}},null,2);
}
function mcpShareFields(){
  const mode=mcpInMode,local=mcpLocalAddress(),select=mcpModeSelect('mcp-in-mode',mode);
  if(mode==='stdio'&&!mcpAccess.launch?.pipe)return select+'<p>本机进程通道尚未开启，请重新打开桌面版或本地运行包。</p>';
  if(mode!=='stdio'&&!local)return select+'<p>本机监听地址不可用，可以选择 stdio 通过进程连接。</p>';
  const detail=mode==='stdio'?`<label class="field"><span>启动命令</span><input readonly value="${h(mcpAccess.launch.command)}"></label><label class="field"><span>启动参数</span><input readonly value="${h(JSON.stringify(mcpAccess.launch.args))}"></label><p class="hint">将配置粘贴到本机 AI 客户端的 mcpServers 设置，保持工作台和项目共享开启。</p>`:
    `<label class="field"><span>${mode==='sse'?'SSE 事件流地址':'本机 MCP 地址（Streamable HTTP）'}</span><div class="mcp-copy"><input id="mcp-share-url" readonly value="${h(local+(mode==='sse'?'/sse':'/mcp'))}">${btn('复制地址','mcp-copy','','small','url')}</div></label>
    <label class="field"><span>Bearer Token</span><div class="mcp-copy"><input id="mcp-share-token" readonly type="password" value="${h(mcpAccess.token)}">${btn('复制令牌','mcp-copy','','small','token')}</div></label>`;
  return select+detail+`<div class="buttons">${btn('复制客户端 JSON 配置','mcp-copy','','small','config')}</div><small class="hint">复制的配置含当前项目的访问令牌。</small>`;
}
function mcpOwnerId() {
  if (mcpOwner) return mcpOwner;
  try {mcpOwner=localStorage.getItem('meridian-mcp-owner')||'';} catch {}
  if (!/^[a-f0-9]{48}$/.test(mcpOwner)) {
    mcpOwner=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
    try {localStorage.setItem('meridian-mcp-owner',mcpOwner);} catch {}
  }
  return mcpOwner;
}
function mcpLocal() {return !!(globalThis.meridianDesktop || modelStatus.localApp);}
function mcpLocalAddress() {return globalThis.meridianDesktop?globalThis.meridianDesktop.apiOrigin:location.origin;}
async function mcpLocalPost(path,data,extra={},signal) {
  const response=await fetch('/api/mcp/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Meridian-UI':'mcp',...extra},body:JSON.stringify(data),signal});
  const value=await response.json();
  if (!response.ok) throw Error(value.error||'本机 MCP 服务未能完成请求。');
  return value;
}
async function mcpExchange(exchange,token,signal,send,secrets=[token]) {
  const msg=exchange.message,ctx=diagBinding(signal),label=msg.params?.name||msg.method;
  const row={...diagNew(ctx,'mcp',traceText(label,secrets).slice(0,140)),endpoint:traceEndpoint(exchange.endpoint,secrets),capture:diagBodies(ctx.pid)};
  if(row.capture)row.request=traceBody(msg,secrets);
  try{
    const result=await (send?send():mcpLocal()?mcpLocalPost('exchange',exchange,token?{'X-Meridian-Mcp-Token':token}:{},signal):mcpUpstream(exchange,token,signal,fetch));
    row.http=result.status;row.error=traceText(result.rpc?.error?.message||(result.rpc?.result?.isError?'工具返回错误。':''),secrets).slice(0,1300);
    row.status=row.http>=200&&row.http<300&&!row.error?'ok':'error';
    if(row.capture)row.response=traceBody(result.rpc,secrets);
    return result;
  }catch(e){
    row.status=signal?.aborted&&signal.reason?.name!=='TimeoutError'?'cancelled':'error';row.error=traceText(e.message,secrets);diagSeenErrors.add(e);throw e;
  }finally{row.ms=Date.now()-row.at;await diagSave(ctx.pid,[row]);}
}
function mcpProjectSnapshot(p) {
  const r=report(p.data,p.currency,p.brief.goal);
  const creatives=p.cards.filter(c=>reviewState(c,p.brief)==='已审核').map(c=>
    Object.fromEntries(['id','market','platform','direction','title','copy','cta','tags','shots','proof','revision'].map(k=>[k,c[k]])));
  return {projectId:p.id,round:p.round,source:p.sourceType||(p.demo?'模拟数据':'项目数据'),brief:clone(p.brief),creatives,
    report:{currency:p.currency,rows:p.data.length,metrics:r.all,byDirection:r.byDir,experiments:r.experiments}};
}
function mcpSeed(schema) {
  const args=Object.create(null);
  for (const key of schema.required||[]) {
    const p=schema.properties?.[key]||{};
    args[key]=p.default??p.examples?.[0]??p.enum?.[0]??({string:'',integer:p.minimum??0,number:p.minimum??0,boolean:false,array:[],object:{}}[p.type]??null);
  }
  return JSON.stringify(args,null,2);
}
function mcpChoose(name) {
  const tool=mcpConnection?.tools.find(t=>t.name===name);
  mcpSelected=tool?.name||'';
  mcpArguments=tool?mcpSeed(tool.inputSchema):'{}';
  mcpOutput=null;mcpError='';
}
function mcpPane(){
  const tabs=`<div class="mcp-tabs" role="group" aria-label="连接方向">${[['out','调用外部工具'],['in','供其他 AI 调用']].map(([id,label])=>
    `<button type="button" data-act="mcp-tab" data-id="${id}" aria-pressed="${mcpTab===id}">${label}</button>`).join('')}</div>`;
  const body=mcpTab==='out'?mcpOutView():mcpInView();
  return `<fieldset id="mcp-pane" class="stack mcp-pane" ${mcpBusy?'disabled':''} aria-label="MCP 服务">${tabs}${body}</fieldset>
    ${mcpBusy?`<p role="status" class="hint">${h(mcpBusy)}</p>`:''}<p class="error-msg" role="alert">${h(mcpError)}</p>`;
}
function mcpRedraw(){
  const target=$('#settings-mcp');if(settingsAt('mcp')&&target)target.innerHTML=mcpPane();
}
function mcpOutView() {
  if (!mcpConnection) return mcpForm();
  const c=mcpConnection,t=c.tools.find(x=>x.name===mcpSelected);
  let body=`<div class="mcp-server-line"><div><strong>${h(c.name)}</strong><small class="hint">${h(mcpModeNames[c.transport])} · ${h(c.addressLabel)} · ${c.tools.length} 个工具</small></div>
    <div class="buttons">${btn('刷新工具','mcp-refresh','','small')}${btn('断开','mcp-disconnect','','small')}</div></div>`;
  if (!t) return body+'<p class="hint">服务已连接，当前没有可用工具。</p>';
  body+=`<label class="field"><span>可用工具</span><select id="mcp-tool">${c.tools.map(x=>option(x.name,x.title||x.annotations?.title||x.name,mcpSelected)).join('')}</select></label>
    <div class="mcp-details"><strong>${h(t.name)}</strong>${t.description?`<p>${h(t.description)}</p>`:''}<details><summary>查看参数格式</summary><pre>${h(JSON.stringify(t.inputSchema,null,2))}</pre></details></div>
    <label class="field"><span>调用参数（JSON）</span><textarea id="mcp-args" rows="4" spellcheck="false">${h(mcpArguments)}</textarea></label><div class="buttons">${btn('运行工具','mcp-call','play','primary')}</div>`;
  if (mcpOutput && mcpOutput.name===mcpSelected) {
    const o=mcpOutput;
    body+=`<div class="mcp-result"><h3>${o.error?'工具返回错误':'工具结果'}</h3><pre tabindex="0">${h(o.text||'工具执行完成，未返回文本。')}</pre>`;
    if (!o.error && o.text && o.pid===db.active) {
      if (o.text.length>6500) body+=`<label class="field"><span>作为参考素材的摘录（最多 6,500 字）</span><textarea id="mcp-excerpt" maxlength="6500" rows="3">${h(o.excerpt)}</textarea></label>`;
      body+=o.attached?'<p class="hint">已加入当前 Brief 的参考素材。</p>':`<div class="buttons">${btn('加入当前 Brief 的参考素材','mcp-attach','plus','small')}</div>`;
    }
    body+='</div>';
  }
  return body;
}
function mcpInView() {
  if (!mcpLocal()) return '<p>请打开 Meridian-Studio.exe 或启动本地运行包，即可取得供其他 AI 客户端连接的本机地址。</p>';
  if (mcpAccess.other) return '<p>另一个窗口正在共享项目。可在原窗口停止共享，或重启本地服务。</p>'+btn('刷新状态','mcp-status','','small');
  const p=project();
  if (!mcpAccess.active) return `<div class="mcp-details"><h3>${h(p.brief.name||'未命名项目')}</h3><p>为其他 AI 客户端共享一份只读快照，包含已保存的 Brief、已审核创意和投放复盘。你可以随时停止共享。</p></div>
    <div class="buttons">${btn('开启本机 MCP 服务','mcp-publish','plug','primary')}</div>`;
  return `<div class="mcp-server-line"><div><strong>${h(mcpAccess.name||'未命名项目')}</strong><small class="hint">快照更新于 ${h(new Date(mcpAccess.at).toLocaleString('zh-CN',{hour12:false}))} · ${mcpAccess.count} 条已审核创意</small></div>${badge('共享中','green')}</div>
    ${mcpShareFields()}
    <div class="mcp-details"><strong>可调用工具</strong><p><code>get_brief</code>　营销 Brief<br><code>list_approved_creatives</code>　已审核创意与分镜<br><code>get_campaign_report</code>　投放指标和实验建议</p></div>
    <div class="buttons">${p.id===mcpAccess.projectId?btn('更新项目快照','mcp-publish','history','small'):''}${btn('停止共享','mcp-stop','','small')}</div>`;
}
async function mcpAction(action,value) {
  if (mcpBusy) return;
  mcpError='';
  if(action==='mcp-open'){go('settings/mcp');return;}
  if(action==='mcp-tab'){
    if(!['in','out'].includes(value))return;
    mcpTab=value;mcpRedraw();
    if(!mcpLocal()&&location.protocol!=='file:'){await refreshModel();if(!settingsAt('mcp'))return;mcpRedraw();}
    if(mcpTab!=='in'||!mcpLocal())return;
    action='mcp-status';
  }
  try {
    if(action==='mcp-mode'){
      if(!Object.hasOwn(mcpModeNames,value))return;
      if(mcpTab==='in')mcpInMode=value;
      else if(!mcpConnection&&value!==mcpOutMode){mcpDraftUrls[mcpOutMode]=mcpEndpointDraft;mcpOutMode=value;mcpEndpointDraft=mcpDraftUrls[value]||'';mcpTokenDraft='';}
      mcpRedraw();return;
    }
    if(action==='mcp-fill-config'){mcpFillConfig();return;}
    if (action==='mcp-disconnect') {
      const c=mcpConnection;mcpConnection=null;mcpTokenDraft='';mcpArgsDraft='[]';mcpEnvDraft='{}';mcpChoose('');await c?.close?.();mcpRedraw();return;
    }
    if (action==='mcp-copy') {
      const config=value==='config',input=config?document.createElement('textarea'):$(value==='url'?'#mcp-share-url':'#mcp-share-token');
      if(config){input.value=mcpShareConfig();input.style.position='fixed';input.style.opacity='0';$('#mcp-pane').append(input);}
      try {await navigator.clipboard.writeText(input.value);} catch {
        const type=input.type;if(!config)input.type='text';input.select();const copied=document.execCommand('copy');if(!config)input.type=type;
        if (!copied) throw Error('请选择并复制该字段。');
      }
      finally{if(config)input.remove();}
      toast(config?'已复制 MCP 客户端配置。':value==='url'?'已复制 MCP 地址。':'已复制 Bearer Token。');return;
    }
    if (action==='mcp-attach') {
      const p=project(),o=mcpOutput;
      if (!o||o.error||o.attached||o.pid!==p.id) return;
      if (p.assets.length>=5) throw Error('当前项目已有 5 份参考素材，请先移除一份。');
      const content=(o.text.length>6500?$('#mcp-excerpt').value:o.text).trim();
      if (!content || content.length>6500) throw Error('请保留 1 至 6,500 字的摘录。');
      if ($('#brief-form')) saveDraft();
      p.assets.push({id:id(),name:`MCP · ${mcpConnection.name} / ${o.name}`,text:content});
      resetSemanticForAssets(p);p.updated=Date.now();save();o.attached=true;render();mcpRedraw();toast('已加入当前 Brief 的参考素材。');return;
    }
    const limit=AbortSignal.timeout(action==='mcp-call'?120000:45000);
    diagContexts.set(limit,{pid:db.active});
    if (['mcp-status','mcp-publish','mcp-stop'].includes(action)) {
      const op={'mcp-status':'status','mcp-publish':'publish','mcp-stop':'stop'}[action];
      mcpBusy='正在更新共享状态…';mcpRedraw();
      if(op==='stop'&&mcpAccess.projectId)await diagSyncInbound(mcpAccess.projectId);
      mcpAccess=await mcpLocalPost('manage',{action:op,owner:mcpOwnerId(),...(op==='publish'?{snapshot:mcpProjectSnapshot(project()),capture:diagBodies(db.active)}:{})},{},limit);
      diagScheduleInbound();
    } else if (action==='mcp-connect') {
      await mcpConnectSelected(limit);
    } else if (action==='mcp-refresh') {
      const c=mcpConnection;mcpBusy='正在刷新工具…';mcpRedraw();await c.refresh(limit);
      if (!c.tools.some(t=>t.name===mcpSelected)) mcpChoose(c.tools[0]?.name);
    } else if (action==='mcp-call') {
      let args;try {args=JSON.parse($('#mcp-args').value);} catch {throw Error('调用参数不是有效的 JSON 对象。');}
      if (!mcpObject(args)) throw Error('调用参数须为 JSON 对象。');
      const pid=db.active,name=mcpSelected;
      mcpBusy='正在调用工具…';mcpOutput=null;mcpRedraw();
      const response=await mcpConnection.call(name,args,limit);
      const text=mcpResultText(response);
      mcpOutput={name,pid,text,excerpt:text.slice(0,6500),error:!!response.isError,attached:false};
    }
  } catch(e) {
    if(!e.rpcCode&&!e.status)diagError(e,'MCP 操作');
    mcpError=e.name==='TimeoutError'?'MCP 请求超时，请检查服务状态。':e instanceof TypeError?'无法连接 MCP 服务。网页直连需要服务允许跨域，可用桌面版重试。':e.message;
  } finally {mcpBusy='';mcpRedraw();}
}
