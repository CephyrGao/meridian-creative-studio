import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {lookupWeb} from './research-host.mjs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {hostStdio,endProcesses,stdioRelay,startSharedPipe} from './mcp-host.mjs';
if(process.argv.includes('--mcp-stdio')){try{await stdioRelay();}catch(e){console.error(e.message);process.exitCode=1;}process.exit(process.exitCode||0);}
const launchKey=randomBytes(24).toString('hex');
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const file=[join(here,'workbench.mjs'),join(here,'../worker/index.js')].find(existsSync);
if(!file)throw Error('Build the workbench first.');
const worker=(await import(pathToFileURL(file))).default;
const sharedPipe=startSharedPipe(worker);
const sharedPath=await sharedPipe.ready.then(()=>sharedPipe.path,()=>null);
let cached=null,until=0,loading=null;
async function detect(){
  if(Date.now()<until)return cached;
  if(loading)return loading;
  loading=(async()=>{try{const res=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(2000)});if(!res.ok)throw Error();
    const models=(await res.json()).models.map(m=>m.name).filter(n=>!/(embed|rerank|bert)/i.test(n));
    cached=(process.env.OLLAMA_MODEL&&models.includes(process.env.OLLAMA_MODEL)?process.env.OLLAMA_MODEL:null)||models.find(n=>/^gemma3:4b/.test(n))||models.find(n=>/^qwen(2.5|3):[478]b/.test(n))||models[0]||null;
  }catch{cached=null;}finally{until=Date.now()+(cached?15000:1800);loading=null;}return cached;})();return loading;
}
const server=createServer(async(req,res)=>{
  try{
    if(!['127.0.0.1','localhost','[::1]'].includes(String(req.headers.host||'').replace(/:\d+$/,''))){res.writeHead(403).end();return;}
    const origin='http://'+req.headers.host;
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2100000){res.writeHead(413).end();return;}chunks.push(chunk);}
    const ctrl=new AbortController();res.on('close',()=>{if(!res.writableEnded)ctrl.abort();});
    const bytes=Buffer.concat(chunks);
    const request=new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:bytes,signal:ctrl.signal});
    if(new URL(request.url).pathname==='/api/research'){
      if(req.method!=='POST'||req.headers.origin!==origin||req.headers['x-meridian-ui']!=='research'){res.writeHead(403).end();return;}
      try{if(bytes.length>16000)throw Error('联网参数过长。');const result=await lookupWeb(JSON.parse(bytes.toString('utf8')),ctrl.signal);
        res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}).end(JSON.stringify(result));}
      catch(e){if(!res.destroyed)res.writeHead(400,{'content-type':'application/json; charset=utf-8'}).end(JSON.stringify({error:e.message||'联网读取失败。'}));}
      return;
    }
    const {OPENAI_API_KEY,OPENAI_MODEL,DEEPSEEK_API_KEY,DEEPSEEK_MODEL,COMPAT_BASE_URL,COMPAT_MODEL,COMPAT_API_KEY}=process.env;
    let wantsLocal=req.url==='/api/status';
    if(req.method==='POST'&&req.url.startsWith('/api/')&&!req.url.startsWith('/api/mcp/')){
      try{const selected=JSON.parse(bytes.toString('utf8')).provider;wantsLocal=selected==='local'||!selected;}catch{}
    }
    const env={OPENAI_API_KEY,OPENAI_MODEL,DEEPSEEK_API_KEY,DEEPSEEK_MODEL,COMPAT_BASE_URL,COMPAT_MODEL,COMPAT_API_KEY,LOCAL_MODEL:wantsLocal?await detect():null,IS_LOCAL:true};
    env.MCP_LAUNCH={command:process.execPath,args:[fileURLToPath(import.meta.url),'--mcp-stdio'],pipe:sharedPath};
    if(req.headers['x-meridian-launch']===launchKey)env.MCP_STDIO=hostStdio;
    const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));
    if(response.body){res.flushHeaders();await pipeline(Readable.fromWeb(response.body),res);}else res.end();
  }catch(e){if(!res.headersSent)res.writeHead(500,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'本地服务请求失败。'}));}
});
server.on('close',()=>{endProcesses();sharedPipe.close();});
process.on('exit',endProcesses);
let port=Number(process.env.MERIDIAN_PORT||8764);
server.on('error',err=>{if(err.code==='EADDRINUSE'&&port!==0){port=0;server.listen(port,'127.0.0.1');}else{console.error(err.message);process.exitCode=1;}});
server.listen(port,'127.0.0.1',()=>{
  const url='http://127.0.0.1:'+server.address().port+'/#mcpLaunch='+launchKey;console.log('Meridian Studio: '+url);
  if(process.argv.includes('--open')&&process.platform==='win32')spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,detached:true,stdio:'ignore'}).unref();
});

