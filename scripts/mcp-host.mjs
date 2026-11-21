import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync,mkdtempSync,unlinkSync,rmdirSync} from 'node:fs';
import {join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer as netCreateServer,connect as netConnect} from 'node:net';
import {createInterface} from 'node:readline';
const children=new Map(),maxFrame=4*1024*1024;
function startProcess(config){
  const {command,args,env}=config||{};
  if(typeof command!=='string'||!command.trim()||command.length>1024||/[\0\r\n]/.test(command)||
     !Array.isArray(args)||args.length>128||args.some(x=>typeof x!=='string'||x.includes('\0')||x.length>8192)||
     !env||typeof env!=='object'||Array.isArray(env)||Object.keys(env).length>100||
     Object.entries(env).some(([k,v])=>!/^[A-Za-z_]\w*$/.test(k)||typeof v!=='string'||v.includes('\0')||v.length>8192))throw Error('本地 MCP 程序的启动配置无效。');
  const inherited={};
  for(const [k,v] of Object.entries(process.env))if(/^(path|systemroot|windir|comspec|pathext|home|userprofile|appdata|localappdata|temp|tmp|tmpdir|lang|lc_all|programfiles|programfiles\(x86\)|programdata|homedrive|homepath)$/i.test(k))inherited[k]=v;
  let file=command,argv=args;
  if(process.platform==='win32'&&/^(npm|npx)(\.cmd)?$/i.test(command)){
    const runtime=process.execPath,script=join(dirname(runtime),'node_modules','npm','bin',command.toLowerCase().startsWith('npx')?'npx-cli.js':'npm-cli.js');
    if(!existsSync(script))throw Error('未找到 npm，请安装 Node.js 或使用程序的完整路径。');
    file=runtime;argv=[script,...args];
  }
  const child=spawn(file,argv,{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...inherited,...env}});
  const id=randomBytes(24).toString('hex'),waiting=new Map();
  let buffer='',dead=false;
  const close=()=>{
    if(dead)return;dead=true;children.delete(id);
    for(const w of waiting.values())w.reject(Error('stdio 子进程已退出。'));waiting.clear();
    child.stdin.end();const timer=setTimeout(()=>{if(child.exitCode===null)child.kill();},450);timer.unref();
  };
  child.stdout.setEncoding('utf8');child.stderr.resume();
  child.on('exit',close);child.on('error',close);child.stdin.on('error',close);child.stdout.on('error',close);
  child.stdout.on('data',chunk=>{
    buffer+=chunk;
    try{
      let n;
      while((n=buffer.indexOf('\n'))>=0){
        if(n>maxFrame)throw Error();const line=buffer.slice(0,n).trim();buffer=buffer.slice(n+1);if(!line)continue;
        const packet=JSON.parse(line);if(packet?.jsonrpc!=='2.0')throw Error();
        if('result' in packet||'error' in packet)waiting.get(packet.id)?.resolve(packet);
      }
      if(buffer.length>maxFrame)throw Error();
    }catch{close();}
  });
  async function send(message,signal){
    signal?.throwIfAborted();if(dead)throw Error('stdio 连接已结束。');
    const hasId=message.id!==undefined;
    let stop,result;
    if(hasId){result=new Promise((resolve,reject)=>{waiting.set(message.id,{resolve,reject});stop=()=>{if(!dead)child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:message.id}})+'\n');reject(signal.reason);};});result.catch(()=>{});signal?.addEventListener('abort',stop,{once:true});}
    try{
      await new Promise((resolve,reject)=>child.stdin.write(JSON.stringify(message)+'\n','utf8',e=>e?reject(e):resolve()));
      return {status:hasId?200:202,rpc:hasId?await result:null};
    }finally{waiting.delete(message.id);if(stop)signal?.removeEventListener('abort',stop);}
  }
  children.set(id,{send,close});
  return new Promise((resolve,reject)=>{
    child.once('spawn',()=>resolve({id}));child.once('error',()=>{close();reject(Error('无法启动该 MCP 程序，请检查命令、安装位置和 PATH。'));});
  });
}
async function hostStdio(action,data,signal){
  if(action==='open')return startProcess(data);
  const p=children.get(data.id);
  if(action==='close'){p?.close();return {};}
  if(!p)throw Error('stdio 子进程已退出，请重新连接。');
  return p.send(data.message,signal);
}
function endProcesses(){for(const p of children.values())p.close();}
function startSharedPipe(worker){
  const suffix='meridian-mcp-'+randomBytes(15).toString('hex'),win=process.platform==='win32';
  const dir=win?'':mkdtempSync(join(tmpdir(),'meridian-ipc-'));
  const path=win?'\\\\.\\pipe\\'+suffix:join(dir,suffix);
  const server=netCreateServer(socket=>{
    socket.setTimeout(10000,()=>socket.destroy());socket.setEncoding('utf8');socket.on('error',()=>{});
    let buffer='',handled=false;
    socket.on('data',async part=>{
      if(handled)return;
      buffer+=part;if(buffer.length>190000){socket.destroy();return;}
      const n=buffer.indexOf('\n');if(n<0)return;handled=true;
      let message,response;
      try{
        const envelope=JSON.parse(buffer.slice(0,n));message=envelope.message;
        const req=new Request('http://127.0.0.1/_meridian/stdio',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+envelope.token},body:JSON.stringify(message)});
        const reply=await worker.fetch(req,{IS_LOCAL:true,MCP_PIPE:true});const raw=await reply.text();response=raw?JSON.parse(raw):null;
        if(response?.error)response.id=message?.id??null;
      }catch{response={jsonrpc:'2.0',id:message?.id??null,error:{code:-32000,message:'工作台无法处理该 stdio 请求。'}};}
      socket.end(JSON.stringify(response)+'\n');
    });
  });
  const ready=new Promise((resolve,reject)=>{server.once('error',reject);server.listen(path,()=>resolve());});
  const finish=()=>{try{if(!win){if(existsSync(path))unlinkSync(path);rmdirSync(dir);}}catch{}};
  server.on('close',finish);process.once('exit',finish);
  return {path,ready,close:()=>server.close()};
}
function pipeRequest(path,token,message){
  return new Promise((resolve,reject)=>{
    const socket=netConnect(path),packets=[];let size=0;
    socket.setTimeout(20000,()=>socket.destroy(Error('stdio 会话超时。')));
    socket.on('connect',()=>socket.write(JSON.stringify({token,message})+'\n'));
    socket.on('error',reject);
    socket.on('data',part=>{size+=part.length;if(size>4*1024*1024){socket.destroy(Error('stdio 响应过大。'));return;}packets.push(part);});
    socket.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(packets).toString('utf8')));}catch(e){reject(e);}});
  });
}
async function stdioRelay(){
  const token=process.env.MERIDIAN_MCP_TOKEN||'',path=process.env.MERIDIAN_MCP_PIPE||'';
  if(!token||!path||!(process.platform==='win32'?/^\\\\\.\\pipe\\meridian-mcp-[0-9a-f]+$/.test(path):/^meridian-mcp-[0-9a-f]+$/.test(basename(path))))throw Error('请从工作台复制 stdio 配置，并保持项目共享开启。');
  const lines=createInterface({input:process.stdin,crlfDelay:Infinity,terminal:false});
  for await(const line of lines){
    if(!line.trim())continue;
    let msg,reply;
    try{if(line.length>160000)throw Error();msg=JSON.parse(line);reply=await pipeRequest(path,token,msg);}
    catch{reply={jsonrpc:'2.0',id:msg?.id??null,error:{code:-32000,message:'请检查本机工作台、项目共享状态与令牌。'}};}
    if((!msg||msg.id!==undefined)&&reply)process.stdout.write(JSON.stringify(reply)+'\n');
  }
}
export {hostStdio,endProcesses,stdioRelay,startSharedPipe};
