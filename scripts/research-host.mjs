import http from 'node:http';
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP,BlockList} from 'node:net';
const blocked=new BlockList();
for(const [a,m] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]])blocked.addSubnet(a,m,'ipv4');
function publicIP(a){return isIP(a)===4?!blocked.check(a,'ipv4'):isIP(a)===6&&/^[23]/i.test(a)&&!/^2001:(?:0|db8|2|10|20):|^2002:/i.test(a);}
function researchRequest(s){
  const u=new URL(s.url),allowed={wiki:['zh.wikipedia.org','en.wikipedia.org'],tavily:['api.tavily.com'],brave:['api.search.brave.com']},paths={wiki:'/w/api.php',brave:'/res/v1/web/search',tavily:'/search'};
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash||u.href.length>4096||u.port&&!['80','443'].includes(u.port))throw Error('仅支持公开 HTTP 或 HTTPS 网页。');
  const headers={Accept:'text/html, text/plain, application/json, application/xhtml+xml','User-Agent':'MeridianStudio/0.8.0-beta.1 (marketing research)'};
  let body;
  if(s.service!=='page'){
    if(!Object.hasOwn(allowed,s.service)||u.protocol!=='https:'||u.port||!allowed[s.service].includes(u.hostname)||u.pathname!==paths[s.service])throw Error('搜索服务地址无效。');
    if(s.service!=='wiki'&&(typeof s.key!=='string'||!s.key||s.key.length>4096||/[\x00-\x20\x7f]/.test(s.key)))throw Error('搜索服务密钥无效。');
    if(s.service==='tavily'){body=JSON.stringify({query:String(s.query||'').slice(0,500),search_depth:'basic',max_results:5});headers.Authorization='Bearer '+s.key;headers['Content-Type']='application/json';}
    if(s.service==='brave')headers['X-Subscription-Token']=s.key;
  }
  return {u,body,headers};
}
async function publicRequest(u,headers,body,signal){
  const host=u.hostname.replace(/^\[|\]$/g,''),addresses=isIP(host)?[{address:host,family:isIP(host)}]:await lookup(host,{all:true});
  signal?.throwIfAborted();
  if(!addresses.length||addresses.some(x=>!publicIP(x.address)))throw Error('仅支持公网网页地址。');
  return new Promise((resolve,reject)=>{
    const choice=addresses.find(x=>x.family===4)||addresses[0];
    const opts={method:body?'POST':'GET',headers,signal,agent:false,autoSelectFamily:false,family:choice.family,
      lookup:(name,options,cb)=>options?.all?cb(null,[choice]):cb(null,choice.address,choice.family)};
    const req=(u.protocol==='https:'?https:http).request(u,opts,resolve);req.on('error',reject);req.end(body);
  });
}
async function lookupWeb(spec,signal){
  let {u,body,headers}=researchRequest(spec);
  const limit=signal?AbortSignal.any([signal,AbortSignal.timeout(26000)]):AbortSignal.timeout(26000);
  for(let i=0;i<6;i++){
    const res=await publicRequest(u,headers,body,limit),status=res.statusCode,type=String(res.headers['content-type']||'');
    if([301,302,303,307,308].includes(status)&&spec.service==='page'&&res.headers.location){res.destroy();u=researchRequest({service:'page',url:new URL(res.headers.location,u).href.split('#')[0]}).u;continue;}
    if(!/^(text\/|application\/(?:json|xhtml\+xml|xml))/i.test(type)){
      res.destroy();if(status<200||status>=300)return {status,url:u.href,type,body:''};
      throw Error('此地址返回的是二进制文件，请下载后在资料库中导入。');
    }
    let size=0;const chunks=[];for await(const part of res){size+=part.length;if(size>2*1024*1024){res.destroy();throw Error('网页超过 2 MB 读取上限。');}chunks.push(part);}
    const bytes=Buffer.concat(chunks),enc=(type+' '+bytes.subarray(0,1800).toString('latin1')).match(/charset\s*=\s*["']?([a-z0-9_-]+)/i)?.[1]||'utf-8';
    let decoder;try{decoder=new TextDecoder(enc);}catch{decoder=new TextDecoder();}
    return {status,url:u.href,type,body:decoder.decode(bytes)};
  }
  throw Error('网页跳转次数过多。');
}
export {lookupWeb,publicIP,researchRequest};
