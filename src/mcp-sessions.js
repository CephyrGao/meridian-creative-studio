const mcpChannels=new Map(),mcpSubscribers=new Map();
async function mcpChannelUi(data,request,env){
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(125000)]);
  if(data.action==='open'){
    if(mcpChannels.size>=16)throw Error('已有多个已打开的连接，请先断开闲置连接。');
    let send,close;
    if(data.transport==='sse'){
      const sse=new McpLegacySse(data.endpoint,request.headers.get('x-meridian-mcp-token')||'',env.MCP_FETCH||fetch);
      await sse.open(signal);send=(msg,limit)=>sse.send(msg,limit);close=async()=>sse.close();
    }else if(data.transport==='stdio'){
      if(!env.MCP_STDIO)return mcpJson({error:'请从桌面工作台或本地启动器打开的页面启动 stdio 程序。'},403);
      const host=env.MCP_STDIO,proc=await host('open',data.config,signal);
      send=(message,limit)=>host('send',{id:proc.id,message},limit);close=()=>host('close',{id:proc.id});
    }else throw Error('连接方式无效。');
    const id=mcpRandom(),entry={send,close,busy:0,timer:null};
    entry.idle=()=>{
      clearTimeout(entry.timer);
      entry.timer=setTimeout(()=>{if(entry.busy)return; mcpChannels.delete(id);entry.close().catch(()=>{});},60*60*1000);
      entry.timer.unref?.();
    };
    mcpChannels.set(id,entry);entry.idle();
    return mcpJson({id});
  }
  const entry=mcpChannels.get(data.id);
  if(!entry)return mcpJson({error:'连接已失效，请重新连接。'},404);
  if(data.action==='close'){mcpChannels.delete(data.id);clearTimeout(entry.timer);await entry.close();return mcpJson({closed:true});}
  if(data.action!=='send'||!mcpObject(data.message)||data.message.jsonrpc!=='2.0'||
    !['server/discover','initialize','notifications/initialized','tools/list','tools/call'].includes(data.message.method))throw Error('无效的 MCP 消息。');
  clearTimeout(entry.timer);entry.busy++;
  try{return mcpJson(await entry.send(data.message,signal));}finally{entry.busy--;if(!entry.busy&&mcpChannels.has(data.id))entry.idle();}
}
async function mcpPipeServe(request){
  let packet;try{packet=await mcpBody(request.clone(),160000);}catch{return mcpJson({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}},400);}
  const headers=new Headers(request.headers),version=packet.params?._meta?.[MCP_META+'protocolVersion'];
  if(typeof version==='string'){
    headers.set('mcp-protocol-version',version);headers.set('mcp-method',packet.method);
    if(packet.method==='tools/call'&&typeof packet.params.name==='string')headers.set('mcp-name',mcpHeaderName(packet.params.name));
  }
  return mcpServe(new Request(request,{headers}));
}
function mcpEndSubscribers(){for(const session of [...mcpSubscribers.values()])session.close();}
async function mcpLegacyServer(request){
  const loc=new URL(request.url),p=mcpPublication;
  const origin=request.headers.get('origin');
  if(origin&&origin!==loc.origin)return mcpJson({error:'Invalid origin'},403);
  if(!p)return mcpJson({error:'项目尚未共享。'},404);
  if(request.headers.get('authorization')!=='Bearer '+p.token)return mcpJson({error:'需要该项目的 Bearer Token。'},401,{'WWW-Authenticate':'Bearer realm="Meridian Studio"'});
  if(loc.pathname==='/sse'){
    if(request.method!=='GET')return mcpJson({error:'Use GET'},405,{Allow:'GET'});
    if(mcpSubscribers.size>=8)return mcpJson({error:'SSE 连接已满。'},429);
    const id=mcpRandom(),encoder=new TextEncoder();let sink,timer,closed=false;
    const close=()=>{
      if(closed)return;closed=true;mcpSubscribers.delete(id);clearInterval(timer);request.signal.removeEventListener('abort',close);
      try{sink?.close();}catch{}
    };
    const stream=new ReadableStream({start(controller){sink=controller;},cancel:close});
    const emit=text=>{if(closed)return;if(sink.desiredSize < -30){close();return;}sink.enqueue(encoder.encode(text));};
    mcpSubscribers.set(id,{emit,close,token:p.token});
    emit('event: endpoint\ndata: /messages?sessionId='+id+'\n\n');
    timer=setInterval(()=>emit(': keep-alive\n\n'),12000);timer.unref?.();
    if(request.signal.aborted)close();else request.signal.addEventListener('abort',close,{once:true});
    return new Response(stream,{headers:{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store','x-accel-buffering':'no'}});
  }
  if(request.method!=='POST')return mcpJson({error:'Use POST'},405,{Allow:'POST'});
  const session=mcpSubscribers.get(loc.searchParams.get('sessionId'));
  if(!session||session.token!==p.token)return mcpJson({error:'SSE 会话已结束。'},404);
  const result=await mcpServe(request),raw=await result.text();
  if(raw)session.emit('event: message\ndata: '+raw+'\n\n');
  if(!result.ok)return new Response(raw,{status:result.status,headers:{'content-type':'application/json'}});
  return new Response(null,{status:202});
}
