(() => {
  const host = globalThis.chrome?.webview;
  if (!host || location.origin !== 'https://meridian-workbench.invalid') return;
  const browserFetch = window.fetch.bind(window);
  const pending = new Map();
  const mcpReaders = new Map();
  const incoming = new Map();
  let serial = 0;
  const desktop = globalThis.meridianDesktop = {apiOrigin: ''};

  function rpc(op, data = {}, signal) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const id = 'ui-' + ++serial;
    return new Promise((resolve, reject) => {
      const stop = () => {
        host.postMessage({op: 'cancel', id});
        pending.delete(id);
        reject(signal.reason);
      };
      pending.set(id, {resolve, reject, done: () => signal?.removeEventListener('abort', stop)});
      signal?.addEventListener('abort', stop, {once:true});
      try { host.postMessage({op, id, ...data}); }
      catch (error) {
        pending.get(id).done();
        pending.delete(id);
        reject(error);
      }
    });
  }

  desktop.scheduleWake = at=>rpc('scheduleWake',{at});
  desktop.research = (spec,signal)=>rpc('research',{spec},signal);
  desktop.saveText = async (name, text) => {
    const result = await rpc('saveText', {name, text});
    return result.saved;
  };

  async function modelFetch(url, init) {
    const result = await rpc('post', {
      url: String(url), body: init.body, authorization: new Headers(init.headers).get('authorization') || ''
    }, init.signal);
    const response=new Response(result.body,{status:result.status,headers:{'content-type':'application/json'}});
    if(typeof result.traceBody==='string')response.meridianTraceBody=result.traceBody;
    return response;
  }

  // Forward native response bytes incrementally so an SSE reply can finish before its stream closes.
  function mcpFetch(url, init) {
    const key='mcp-'+ ++serial, lifetime=new AbortController();
    const signal=AbortSignal.any([init.signal,lifetime.signal]);
    let controller;
    const stream=new ReadableStream({
      start(sink){controller=sink;},
      cancel(){lifetime.abort();}
    });
    return new Promise((resolve,reject)=>{
      mcpReaders.set(key,{head(data){
        const headers={'content-type':data.type};
        if(data.session)headers['mcp-session-id']=data.session;
        resolve(new Response([204,205,304].includes(data.status)?null:stream,{status:data.status,headers}));
      },chunk(bytes){controller.enqueue(Uint8Array.from(atob(bytes),ch=>ch.charCodeAt(0)));}});
      rpc('mcpHttp',{stream:key,url,method:init.method||'POST',body:init.body,headers:Object.fromEntries(init.headers)},signal)
        .then(()=>{if(!lifetime.signal.aborted)controller.close();},
          e=>{reject(e);if(!lifetime.signal.aborted)controller.error(e);})
        .finally(()=>mcpReaders.delete(key));
    });
  }

  const route = (function(fetch) {
    /*@MODEL@*/
    return handleRequest;
  })(modelFetch);

  async function dispatch(request,fromPipe=false) {
    const path = new URL(request.url).pathname;
    let local = path === '/api/status';
    if (!local && path.startsWith('/api/') && !path.startsWith('/api/mcp/') && request.method === 'POST') {
      try { const data = await request.clone().json(); local = !data.provider || data.provider === 'local'; } catch {}
    }
    const config = await rpc('config', {local}, request.signal);
    desktop.apiOrigin = config.apiOrigin;
    config.env.MCP_FETCH=mcpFetch;
    config.env.MCP_PIPE=fromPipe;
    config.env.MCP_NATIVE_UI=new URL(request.url).origin===location.origin;
    if(config.env.MCP_NATIVE_UI)config.env.MCP_STDIO=(action,args,signal)=>rpc('mcpStdio',{action,args},signal);
    return route(request, config.env, '');
  }

  window.fetch = (input, init) => {
    const href = input instanceof Request ? input.url : new URL(input, location.href).href;
    const target = new URL(href);
    if (target.origin !== location.origin || !(target.pathname.startsWith('/api/') || target.pathname === '/v1/chat/completions')) return browserFetch(input,init);
    return dispatch(new Request(input instanceof Request ? input : href, init));
  };

  host.addEventListener('message', async ({data}) => {
    if(data.op==='scheduleTick'){window.dispatchEvent(new Event('meridian-schedule-tick'));return;}
    if(data.op==='mcpHead'||data.op==='mcpChunk'){
      const reader=mcpReaders.get(data.stream);
      if(reader){if(data.op==='mcpHead')reader.head(data);else reader.chunk(data.bytes);}
      return;
    }
    if (data.op === 'reply') {
      const item = pending.get(data.id);
      if (!item) return;
      pending.delete(data.id);
      item.done();
      if (data.error) item.reject(new Error(data.error));
      else item.resolve(data.value);
      return;
    }
    if (data.op === 'abortApi') { incoming.get(data.id)?.abort(); return; }
    if (data.op !== 'api') return;
    const controller = new AbortController();
    incoming.set(data.id, controller);
    try {
      const req = new Request(data.url, {method:data.method, headers:data.headers, body:['GET','HEAD'].includes(data.method)?undefined:data.body, signal:controller.signal});
      const response = await dispatch(req,data.pipe===true);
      if(response.ok&&response.headers.get('content-type')?.startsWith('text/event-stream')){
        host.postMessage({op:'apiResult',id:data.id,status:response.status,streaming:true});
        const reader=response.body.getReader();
        try{
          for(;;){
            const {done,value}=await reader.read();if(done)break;
            for(let i=0;i<value.length;i+=16384){
              const part=value.subarray(i,i+16384);
              host.postMessage({op:'apiStream',id:data.id,bytes:btoa(String.fromCharCode(...part))});
            }
          }
        }finally{await reader.cancel().catch(()=>{});host.postMessage({op:'apiStream',id:data.id,end:true});}
      }else host.postMessage({op:'apiResult',id:data.id,status:response.status,body:await response.text(),allow:response.headers.get('allow')||'',challenge:response.headers.get('www-authenticate')||''});
    } catch {
      host.postMessage({op:'apiResult',id:data.id,status:503,body:JSON.stringify({error:{message:'本机模型服务暂不可用。'}})});
    } finally { incoming.delete(data.id); }
  });
  window.addEventListener('DOMContentLoaded', () => host.postMessage({op:'ready'}), {once:true});
})();

