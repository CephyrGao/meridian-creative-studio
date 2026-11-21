const mcpEmptySchema={type:'object',properties:{},additionalProperties:false};
const mcpPublishedTools=[
  {name:'get_brief',title:'读取营销 Brief',description:'读取已共享项目快照中的已保存 Brief、轮次与数据来源。',inputSchema:mcpEmptySchema},
  {name:'list_approved_creatives',title:'列出已审核创意',description:'分页读取已完成人工审核的创意文案、脚本及分镜。offset 从 0 开始。',inputSchema:{type:'object',properties:{
    offset:{type:'integer',minimum:0,default:0},limit:{type:'integer',minimum:1,maximum:30,default:10}},additionalProperties:false}},
  {name:'get_campaign_report',title:'读取投放复盘',description:'读取投放汇总、各创意方向的表现和下一轮实验建议。CTR 和 CVR 以小数表示。',inputSchema:mcpEmptySchema}
].map(tool=>({...tool,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}}));
let mcpPublication=null;
function mcpJson(value,status=200,headers={}) {
  return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
}
function mcpRandom() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
}
async function mcpBody(request,max) {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw Error('请求须使用 JSON。');
  const text=await request.text();
  if (text.length>max) throw Error('内容过大，请缩小发送的数据范围。');
  const data=JSON.parse(text);
  if (!mcpObject(data)) throw Error('请求须为 JSON 对象。');
  return data;
}
async function mcpLocalUi(request,env) {
  const origin=new URL(request.url).origin;
  if (request.method!=='POST' || request.headers.get('x-meridian-ui')!=='mcp' ||
      !(env.MCP_NATIVE_UI || request.headers.get('origin')===origin)) return mcpJson({error:'请从本机工作台访问。'},403);
  try {
    const path=new URL(request.url).pathname,relay=path==='/api/mcp/exchange';
    const data=await mcpBody(request,relay||path==='/api/mcp/channel'?160000:1800000);
    if(path==='/api/mcp/channel')return await mcpChannelUi(data,request,env);
    if (relay) {
      const token=request.headers.get('x-meridian-mcp-token')||'';
      const timed=AbortSignal.any([request.signal,AbortSignal.timeout(120000)]);
      return mcpJson(await mcpUpstream(data,token,timed,env.MCP_FETCH||fetch));
    }
    if (typeof data.owner!=='string'||!/^[a-f0-9]{48}$/.test(data.owner)) return mcpJson({error:'窗口标识无效。'},400);
    const current=mcpPublication;
    if (current && current.owner!==data.owner) {
      if (data.action==='status') return mcpJson({active:true,other:true});
      if(['journal','ack','recording'].includes(data.action))return mcpJson({events:[]});
      return mcpJson({error:'接口已在另一个工作台窗口开启。请在那里管理共享。'},409);
    }
    if(['journal','ack','recording'].includes(data.action)){
      if(!current||current.snapshot.projectId!==data.projectId)return mcpJson({events:[]});
      if(data.action==='recording')current.capture=data.enabled===true;
      if(data.action==='ack'&&Array.isArray(data.ids)){
        const ack=new Set(data.ids.slice(0,120));
        for(let i=current.journal.length-1;i>=0;i--)if(ack.has(current.journal[i].id))current.journal.splice(i,1);
      }
      return mcpJson({events:data.action==='journal'?current.journal.slice(0,12):[]});
    }
    if (data.action==='stop') {mcpEndSubscribers();mcpPublication=null;return mcpJson({active:false});}
    if (data.action==='publish') {
      const s=data.snapshot;
      if (!mcpObject(s)||typeof s.projectId!=='string'||!mcpObject(s.brief)||!Array.isArray(s.creatives)||!mcpObject(s.report))
        throw Error('共享快照格式无效。');
      if (current && current.snapshot.projectId!==s.projectId) return mcpJson({error:'请先停止现有共享，再选择另一个项目。'},409);
      mcpPublication={owner:data.owner,token:current?.token||mcpRandom(),snapshot:s,at:new Date().toISOString(),
        capture:data.capture===true,journal:current?.journal||[]};
    } else if (data.action!=='status') return mcpJson({error:'未知共享操作。'},400);
    const p=mcpPublication;
    return mcpJson(p?{active:true,launch:env.MCP_LAUNCH,token:p.token,at:p.at,projectId:p.snapshot.projectId,name:p.snapshot.brief.name,count:p.snapshot.creatives.length}:{active:false});
  } catch (e) {
    const reason=e.name==='TimeoutError'?'连接 MCP 服务超时。':e instanceof TypeError?'无法访问该 MCP 地址，请检查网络和服务状态。':e.message;
    return mcpJson({error:reason},400);
  }
}
function mcpReadShared(name,args,p) {
  if (!mcpObject(args)) throw Error('工具参数须为 JSON 对象。');
  const snapshot=p.snapshot,context={project:snapshot.brief.name,round:snapshot.round,source:snapshot.source,snapshotAt:p.at};
  if (name==='list_approved_creatives') {
    const {offset=0,limit=10}=args;
    if (Object.keys(args).some(k=>k!=='offset'&&k!=='limit') || !Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>30)
      throw Error('offset 应为非负整数，limit 应为 1 到 30 的整数。');
    const total=snapshot.creatives.length;
    return {...context,total,nextOffset:offset+limit<total?offset+limit:null,creatives:snapshot.creatives.slice(offset,offset+limit)};
  }
  if (Object.keys(args).length) throw Error('此工具无需参数。');
  if (name==='get_brief') return {...context,brief:snapshot.brief};
  return {...context,...snapshot.report};
}
async function mcpServe(request) {
  const p=mcpPublication,origin=request.headers.get('origin');
  if(!p||request.method!=='POST'||request.headers.get('authorization')!=='Bearer '+p.token||
    origin&&origin!==new URL(request.url).origin)return mcpServeResponse(request);
  const at=Date.now(),capture=p.capture,secrets=[p.token,p.owner],copy=request.clone();
  const response=await mcpServeResponse(request);
  try{
    let message;try{message=await mcpBody(copy,160000);}catch{message=null;}
    const raw=await response.clone().text();let rpc=null;
    if(raw)try{rpc=JSON.parse(raw);}catch{rpc=raw;}
    const failure=rpc?.error?.message||(rpc?.result?.isError?'工具返回错误。':'');
    const ref=mcpRandom();
    p.journal.push({id:ref,group:ref,pid:p.snapshot.projectId,at,ms:Date.now()-at,kind:'incoming',endpoint:new URL(request.url).pathname,
      label:traceText(String(message?.params?.name||message?.method||'MCP 请求'),secrets).slice(0,140),
      status:response.ok&&!failure?'ok':'error',error:traceText(failure,secrets).slice(0,1300),http:response.status,capture,
      request:capture?traceBody(message,secrets):null,response:capture?traceBody(rpc,secrets):null});
    if(p.journal.length>120)p.journal.shift();
  }catch{}
  return response;
}
async function mcpServeResponse(request) {
  const fail=(id,code,message,status=200,data)=>mcpJson({jsonrpc:'2.0',id,error:{code,message,...(data?{data}:{})}},status);
  const origin=request.headers.get('origin');
  if (origin && origin!==new URL(request.url).origin) return fail(null,-32000,'Invalid origin',403);
  const p=mcpPublication;
  if (!p) return fail(null,-32000,'请先在工作台开启项目共享。',404);
  if (request.headers.get('authorization')!=='Bearer '+p.token)
    return mcpJson({jsonrpc:'2.0',id:null,error:{code:-32000,message:'需要该工作台提供的 Bearer Token。'}},401,{'WWW-Authenticate':'Bearer realm="Meridian Studio"'});
  if (request.method!=='POST') return mcpJson({error:'Use POST'},405,{Allow:'POST'});
  let msg;
  try {msg=await mcpBody(request,160000);} catch {return fail(null,-32700,'Invalid JSON request',400);}
  const {id,method,params={}}=msg;
  if (msg.jsonrpc!=='2.0'||typeof method!=='string'||!mcpObject(params) ||
      id!==undefined && typeof id!=='string' && !Number.isSafeInteger(id)) return fail(null,-32600,'Invalid request',400);
  const version=params._meta?.[MCP_META+'protocolVersion'], header=request.headers.get('mcp-protocol-version');
  const modern=version!==undefined || header===MCP_VERSION;
  const supported=[MCP_VERSION,...MCP_LEGACY];
  if (modern) {
    if (version!==MCP_VERSION || header!==version) {
      if (version && !supported.includes(version))
        return fail(id??null,-32022,'Unsupported protocol version',400,{supported,requested:version});
      return fail(id??null,-32000,'Protocol version header mismatch',400);
    }
    if (!mcpObject(params._meta?.[MCP_META+'clientCapabilities']) || request.headers.get('mcp-method')!==method ||
        method==='tools/call' && (typeof params.name!=='string'||request.headers.get('mcp-name')!==mcpHeaderName(params.name)))
      return fail(id??null,-32602,'MCP request metadata mismatch',400);
  } else if (header && !MCP_LEGACY.includes(header)) return fail(id??null,-32022,'Unsupported protocol version',400,{supported,requested:header});
  if (id===undefined) {
    if (method.startsWith('notifications/')) return new Response(null,{status:202,headers:{'cache-control':'no-store'}});
    return fail(null,-32600,'Missing request id',400);
  }
  const ok=result=>mcpJson({jsonrpc:'2.0',id,result:modern?{resultType:'complete',...result}:result});
  if (method==='server/discover' && modern) return ok({supportedVersions:supported,capabilities:{tools:{}},_meta:{[MCP_META+'serverInfo']:MCP_IDENT}});
  if (method==='initialize' && !modern)
    return ok({protocolVersion:MCP_LEGACY.includes(params.protocolVersion)?params.protocolVersion:MCP_LEGACY[0],serverInfo:MCP_IDENT,capabilities:{tools:{}}});
  if (method==='ping') return ok({});
  if (method==='tools/list') return ok({tools:mcpPublishedTools});
  if (method!=='tools/call') return fail(id,-32601,'Method not found',modern?404:200);
  if (!mcpPublishedTools.some(t=>t.name===params.name)) return fail(id,-32602,'Unknown tool');
  try {
    const value=mcpReadShared(params.name,params.arguments===undefined?{}:params.arguments,p);
    return ok({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
  } catch(e) {return ok({isError:true,content:[{type:'text',text:e.message}]});}
}
