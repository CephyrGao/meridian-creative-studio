const MCP_VERSION = '2026-07-28';
const MCP_LEGACY = ['2025-11-25','2025-06-18','2025-03-26','2024-11-05'];
const MCP_IDENT = {name:'meridian-studio',title:'经纬创意',version:'0.8.0-beta.1'};
const MCP_META = 'io.modelcontextprotocol/';
const MCP_MAX_REPLY = 4 * 1024 * 1024;
const mcpObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function mcpUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw Error('请填写完整的 MCP 服务地址。'); }
  const local = ['127.0.0.1','[::1]','localhost'].includes(url.hostname);
  if (!(url.protocol==='https:' || local && url.protocol==='http:') || url.username || url.password || url.hash)
    throw Error('请使用 HTTPS 地址或本机 HTTP 地址，凭据请填在令牌栏。');
  return url.href;
}
function mcpHeaderName(name) {
  if (/^[\x21-\x7e]+$/.test(name) && !name.startsWith('=?')) return name;
  const bytes = new TextEncoder().encode(name);
  return '=?base64?'+btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''))+'?=';
}
function mcpHttpOptions(exchange, token, signal) {
  const {message,version,session} = exchange;
  if (!mcpObject(message) || message.jsonrpc!=='2.0' ||
      !['initialize','notifications/initialized','server/discover','tools/list','tools/call'].includes(message.method))
    throw Error('MCP 请求方法无效。');
  const headers = new Headers({'Content-Type':'application/json','Accept':'application/json, text/event-stream'});
  if (token) {
    if (token.length>4096 || /[\s\x00-\x1f\x7f]/.test(token)) throw Error('Bearer Token 格式不正确。');
    headers.set('Authorization','Bearer '+token);
  }
  if (version) {
    if (![MCP_VERSION,...MCP_LEGACY].includes(version)) throw Error('MCP 协议版本不受支持。');
    headers.set('MCP-Protocol-Version',version);
  }
  if (session) {
    if (!/^[\x21-\x7e]{1,1024}$/.test(session)) throw Error('MCP 会话标识无效。');
    headers.set('Mcp-Session-Id',session);
  }
  if (version===MCP_VERSION) {
    headers.set('Mcp-Method',message.method);
    if (message.method==='tools/call') headers.set('Mcp-Name',mcpHeaderName(message.params.name));
  }
  return {method:'POST',headers,body:JSON.stringify(message),signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'};
}
async function mcpRead(response, expectedId) {
  const status=response.status,session=response.headers.get('mcp-session-id')||'';
  const result=rpc=>({status,session,rpc});
  if (status===202 || status===204 || !response.body) {await response.body?.cancel();return result(null);}
  const type=(response.headers.get('content-type')||'').toLowerCase();
  const streaming=type.startsWith('text/event-stream');
  if (!streaming && !type.includes('json')) {
    await response.body.cancel();
    return result(null);
  }
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='',size=0;
  function event(frame) {
    const lines=frame.split(/\r\n|\r|\n/).filter(line=>line==='data'||line.startsWith('data:'));
    const raw=lines.map(line=>line.slice(5).replace(/^ /,'')).join('\n');
    if (!raw.trim()) return null;
    const packet=JSON.parse(raw);
    return packet?.id===expectedId && ('result' in packet || 'error' in packet) ? packet : null;
  }
  try {
    for (;;) {
      const {done,value}=await reader.read();
      if (value) {
        size+=value.length;
        if (size>MCP_MAX_REPLY) throw Error('MCP 响应超过 4 MB，请缩小查询范围。');
      }
      buffer+=done ? decoder.decode() : decoder.decode(value,{stream:true});
      if (streaming) {
        let separator;
        while ((separator=/\r\n\r\n|\n\n|\r\r/.exec(buffer))) {
          const packet=event(buffer.slice(0,separator.index));
          if (packet) return result(packet);
          buffer=buffer.slice(separator.index+separator[0].length);
        }
      }
      if (done) break;
    }
    if (streaming) return result(buffer.trim()?event(buffer):null);
    try {return result(JSON.parse(buffer));} catch {if(!response.ok)return result(null);throw Error('MCP 服务返回了无效的 JSON。');}
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function mcpUpstream(exchange,token,signal,transport) {
  const url=mcpUrl(exchange.endpoint);
  const options=mcpHttpOptions(exchange,token,signal);
  const response=await transport(url,options);
  return mcpRead(response,exchange.message.id);
}
