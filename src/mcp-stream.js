function mcpSseFrame(frame){
  let type='message';const data=[];
  for(const line of frame.split(/\r\n|\n|\r/)){
    if(line.startsWith(':'))continue;
    const colon=line.indexOf(':'),key=colon<0?line:line.slice(0,colon),value=colon<0?'':line.slice(colon+1).replace(/^ /,'');
    if(key==='event')type=value;
    if(key==='data')data.push(value);
  }
  return {type,data:data.join('\n')};
}
class McpLegacySse {
  constructor(endpoint,token,transport){
    this.url=mcpUrl(endpoint);this.transport=transport;this.controller=new AbortController();this.waiting=new Map();
    this.headers=new Headers({Accept:'text/event-stream'});
    if(token){
      if(token.length>4096||/[\s\x00-\x1f\x7f]/.test(token))throw Error('Bearer Token 格式不正确。');
      this.headers.set('Authorization','Bearer '+token);
    }
  }
  async open(signal){
    signal?.throwIfAborted();
    const stop=()=>this.close(signal.reason);
    signal?.addEventListener('abort',stop,{once:true});
    try{
      const response=await this.transport(this.url,{method:'GET',headers:this.headers,signal:this.controller.signal,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok||!response.body||!response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream')){
        await response.body?.cancel();throw Error(`SSE 连接失败（HTTP ${response.status}）。请核对 SSE 地址和授权。`);
      }
      await new Promise((resolve,reject)=>{
        this.ready={resolve,reject};
        this.read(response.body).catch(e=>this.close(e));
      });
    }catch(e){this.close(e);throw e;}
    finally{signal?.removeEventListener('abort',stop);}
  }
  async read(stream){
    const reader=stream.getReader(),decoder=new TextDecoder();let text='';
    try{
      for(;;){
        const {value,done}=await reader.read();
        if(done)throw Error('SSE 连接已结束，请重新连接。');
        text+=decoder.decode(value,{stream:true});
        let gap;
        while((gap=/\r\n\r\n|\n\n|\r\r/.exec(text))){
          if(gap.index>MCP_MAX_REPLY)throw Error('SSE 消息超过 4 MB。');
          const event=mcpSseFrame(text.slice(0,gap.index));text=text.slice(gap.index+gap[0].length);
          if(event.type==='endpoint'&&event.data){
            const post=mcpUrl(new URL(event.data,this.url).href);
            if(new URL(post).origin!==new URL(this.url).origin||this.post&&this.post!==post)throw Error('SSE 服务返回的消息地址与连接地址不同源或已更换。');
            this.post=post;this.ready?.resolve();this.ready=null;
          }else if(event.type==='message'&&event.data){
            const rpc=JSON.parse(event.data);
            if(rpc?.jsonrpc==='2.0'&&('result' in rpc||'error' in rpc))this.waiting.get(rpc.id)?.resolve(rpc);
          }
        }
        if(text.length>MCP_MAX_REPLY)throw Error('SSE 消息超过 4 MB。');
      }
    }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  async send(message,signal){
    if(this.controller.signal.aborted)throw Error('SSE 连接已断开，请重新连接。');
    signal?.throwIfAborted();
    const headers=new Headers(this.headers);headers.set('Content-Type','application/json');headers.set('Accept','application/json, text/plain, */*');
    const withId=message.id!==undefined;
    let result,stop;
    if(withId){
      result=new Promise((resolve,reject)=>{this.waiting.set(message.id,{resolve,reject});stop=()=>reject(signal.reason);});
      result.catch(()=>{});signal?.addEventListener('abort',stop,{once:true});
    }
    try{
      const cancel=signal?AbortSignal.any([this.controller.signal,signal]):this.controller.signal;
      const res=await this.transport(this.post,{method:'POST',headers,body:JSON.stringify(message),signal:cancel,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});
      await res.body?.cancel();
      if(!res.ok)return {status:res.status,rpc:null};
      return {status:withId?200:202,rpc:withId?await result:null};
    }finally{this.waiting.delete(message.id);if(stop)signal?.removeEventListener('abort',stop);}
  }
  close(reason=Error('SSE 连接已断开。')){
    if(!this.controller.signal.aborted)this.controller.abort(reason);
    this.ready?.reject(reason);this.ready=null;
    for(const item of this.waiting.values())item.reject(reason);this.waiting.clear();
  }
}
