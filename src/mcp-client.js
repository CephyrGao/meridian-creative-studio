class MeridianMcpClient {
  constructor(endpoint,token,exchange,transport='http',label='') {
    this.transport=transport;
    this.endpoint=transport==='stdio'?endpoint:mcpUrl(endpoint);
    this.addressLabel=label||(transport==='stdio'?'本地进程':new URL(this.endpoint).host);
    this.token=token.trim();
    this.exchange=exchange;
    this.version=MCP_VERSION;
    this.session='';
    this.serial=0;
    this.tools=[];
  }
  async request(method,params,signal,notification=false) {
    const id=notification?undefined:++this.serial;
    if (this.version===MCP_VERSION) params={...params,_meta:{
      [MCP_META+'protocolVersion']:this.version,[MCP_META+'clientInfo']:MCP_IDENT,[MCP_META+'clientCapabilities']:{}
    }};
    const message={jsonrpc:'2.0',id,method,params};
    const {status,session,rpc}=await this.exchange({
      endpoint:this.endpoint,version:method==='initialize'?'':this.version,session:this.session,message
    },this.token,signal);
    if (method==='initialize' && session) this.session=session;
    if (notification && status>=200 && status<300) return;
    if (status<200 || status>=300 || rpc?.error) {
      const detail=typeof rpc?.error?.message==='string'?rpc.error.message.slice(0,350):'';
      const reason=status===401||status===403?'授权失败，请核对该服务的 Bearer Token。':
        status===404 && this.session?'会话已失效，请重新连接。':detail||'请核对服务地址及其 MCP 协议支持。';
      const failure=Error(`MCP 请求失败（HTTP ${status}）。${reason}`);
      Object.assign(failure,{status,rpcCode:rpc?.error?.code,supported:rpc?.error?.data?.supported});
      throw failure;
    }
    if (rpc?.jsonrpc!=='2.0' || rpc.id!==id || !mcpObject(rpc.result)) throw Error('未收到与本次请求匹配的 MCP 回应。');
    if (rpc.result.resultType==='input_required' || rpc.result.inputRequests)
      throw Error('该工具要求额外交互，请在支持该交互的 MCP 客户端中完成。');
    return rpc.result;
  }
  async connect(signal) {
    let info;
    const initialize=async(version)=>{
      this.version=version;
      const reply=await this.request('initialize',{protocolVersion:version,capabilities:{},clientInfo:MCP_IDENT},signal);
      if(!MCP_LEGACY.includes(reply.protocolVersion))throw Error('服务端返回了不支持的 MCP 协议版本。');
      this.version=reply.protocolVersion;this.name=reply.serverInfo?.title||reply.serverInfo?.name;
      await this.request('notifications/initialized',{},signal,true);
      return reply;
    };
    if(this.transport==='sse')info=await initialize('2024-11-05');
    if(this.transport==='stdio'){
      try{info=await initialize(MCP_LEGACY[0]);}
      catch(e){if(![-32601,-32600,-32022].includes(e.rpcCode))throw e;this.version=MCP_VERSION;}
    }
    if(!info)try {
      info=await this.request('server/discover',{},signal);
      if (!Array.isArray(info.supportedVersions) || !info.supportedVersions.includes(MCP_VERSION))
        throw Error('服务端没有声明兼容的 MCP 协议版本。');
      this.name=info._meta?.[MCP_META+'serverInfo']?.title||info._meta?.[MCP_META+'serverInfo']?.name;
    } catch (error) {
      const compatible=error.rpcCode===-32022 && MCP_LEGACY.find(v=>error.supported?.includes(v));
      const legacy=error.rpcCode!==-32022 && ([400,404,405,406].includes(error.status) ||
        (error.status===200 && [-32600,-32601,-32002].includes(error.rpcCode)));
      if (!compatible && !legacy) throw error;
      info=await initialize(compatible||MCP_LEGACY[0]);
    }
    this.name=typeof this.name==='string'&&this.name.trim()?this.name:this.addressLabel;
    if (!info.capabilities?.tools) throw Error('该 MCP 服务没有提供工具，请检查服务地址。');
    await this.refresh(signal);
  }
  async refresh(signal) {
    const tools=[],seen=new Set();
    let cursor;
    do {
      const page=await this.request('tools/list',cursor?{cursor}:{},signal);
      if (!Array.isArray(page.tools)) throw Error('MCP 工具清单格式无效。');
      for (const tool of page.tools) {
        if (!mcpObject(tool) || typeof tool.name!=='string' || !tool.name.length || !mcpObject(tool.inputSchema))
          throw Error('MCP 服务返回了无效的工具定义。');
        tools.push(tool);
      }
      cursor=page.nextCursor;
      if (cursor && (typeof cursor!=='string' || seen.has(cursor) || seen.size>=200)) throw Error('MCP 工具清单分页异常。');
      seen.add(cursor);
    } while (cursor);
    this.tools=tools;
  }
  async call(name,args,signal) {
    if (!this.tools.some(tool=>tool.name===name) || !mcpObject(args)) throw Error('请选择工具并填写 JSON 对象参数。');
    const output=await this.request('tools/call',{name,arguments:args},signal);
    if (!Array.isArray(output.content) && !mcpObject(output.structuredContent)) throw Error('工具没有返回有效的 MCP 结果。');
    return output;
  }
}
function mcpResultText(result) {
  const parts=[];
  if (mcpObject(result.structuredContent)) parts.push(JSON.stringify(result.structuredContent,null,2));
  for (const block of result.content||[]) {
    if (block.type==='text' && typeof block.text==='string') {
      if (parts.includes(block.text)) continue;
      if (result.structuredContent) {
        try {if(JSON.stringify(JSON.parse(block.text))===JSON.stringify(result.structuredContent))continue;} catch {}
      }
      parts.push(block.text);
    } else if (block.type==='resource' && typeof block.resource?.text==='string') parts.push(block.resource.text);
    else if (block.type==='resource_link') parts.push([block.name,block.uri].filter(Boolean).join(' · '));
    else parts.push(`[${block.type||'未知内容'}${block.mimeType?' · '+block.mimeType:''}]`);
  }
  return parts.join('\n\n');
}
