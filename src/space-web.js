const spaceEngines={wiki:'维基百科（免密钥）',tavily:'Tavily',brave:'Brave Search'};
const spaceSearchKeys=new Map();let spaceWebPending=null;
function spaceUrl(raw){
  let u;try{u=new URL(raw);}catch{throw Error('请填写完整的公开 HTTP 或 HTTPS 网页地址。');}
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('请输入不含账户凭据的 HTTP 或 HTTPS 网页地址。');
  u.hash='';return u.href;
}
function spacePlain(raw,asHtml=false){
  if(!asHtml)return raw.trim();
  const template=document.createElement('template');template.innerHTML=raw;
  const fragment=template.content;const title=fragment.querySelector('title')?.textContent?.trim()||'';
  for(const node of fragment.querySelectorAll('script,style,noscript,svg,iframe,object,embed,canvas,head,form,nav,footer,header,template,[hidden]'))node.remove();
  const scope=fragment.querySelector('article,main,[role=main]')||fragment;
  for(const br of scope.querySelectorAll('br'))br.replaceWith('\n');
  for(const node of scope.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,div,section,tr,blockquote,pre'))node.append('\n');
  return {title,text:scope.textContent.replace(/\u00a0/g,' ').split('\n').map(l=>l.replace(/[ \t]+/g,' ').trim()).filter(Boolean).join('\n')};
}
function spaceEngine(wid){return Object.hasOwn(spaceEngines,spaceInfo(wid).engine)?spaceInfo(wid).engine:'wiki';}
function spaceWebSpec(mode,input,wid){
  const engine=spaceEngine(wid);
  if(mode==='fetch')return {service:'page',url:spaceUrl(input)};
  const query=String(input||'').trim();if(!query||query.length>500)throw Error('搜索关键词需为 1–500 字。');
  const key=spaceSearchKeys.get(wid+'/'+engine)||'';
  if(engine!=='wiki'&&!key)throw new AgentNeeds('请在「设置 → API 接入 → 搜索 API」填写 '+spaceEngines[engine]+' 的 API Key。','web');
  if(engine==='tavily')return {service:engine,url:'https://api.tavily.com/search',key,query};
  if(engine==='brave')return {service:engine,url:'https://api.search.brave.com/res/v1/web/search?'+new URLSearchParams({q:query,count:'5'}),key,query};
  const lang=/\p{Script=Han}/u.test(query)?'zh':'en';
  return {service:'wiki',url:'https://'+lang+'.wikipedia.org/w/api.php?'+new URLSearchParams({action:'query',list:'search',srsearch:query,srlimit:'5',format:'json',origin:'*'}),query};
}
async function spaceTransport(spec,signal){
  if(globalThis.meridianDesktop?.research)return meridianDesktop.research(spec,signal);
  if(modelStatus.localApp){
    const res=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json','X-Meridian-UI':'research'},body:JSON.stringify(spec),signal});
    const reply=await res.json();if(!res.ok)throw Error(reply.error||'联网服务无法响应。');return reply;
  }
  if(spec.service!=='wiki')throw new AgentNeeds('请打开桌面版或本地运行包使用该联网工具。','web');
  const res=await fetch(spec.url,{signal,credentials:'omit',redirect:'error'});if(!res.ok)throw Error('维基百科返回 HTTP '+res.status+'。');
  return {url:spec.url,type:'application/json',body:await res.text(),status:res.status};
}
async function spaceResearch(mode,input,p,signal){
  const wid=spaceOf(p),spec=spaceWebSpec(mode,input,wid),context=diagBinding(signal),secrets=[spec.key].filter(Boolean);
  const row={...diagNew({...context,pid:p.id},'research',mode==='fetch'?'读取网页':'搜索 · '+spaceEngines[spec.service]),endpoint:traceEndpoint(spec.url,secrets),capture:diagBodies(p.id)};
  if(row.capture)row.request=traceBody(spec.service==='tavily'?{query:spec.query,search_depth:'basic',max_results:5}:{method:'GET',url:spec.url,...(spec.query?{query:spec.query}:{})},secrets);
  try{
    const limit=AbortSignal.timeout(30000),raw=await spaceTransport(spec,signal?AbortSignal.any([signal,limit]):limit);
    row.http=raw.status;if(row.capture)row.response=traceBody(raw.body,secrets);if(raw.status<200||raw.status>=300)throw Error((spec.service==='page'?'网页':spaceEngines[spec.service])+'返回 HTTP '+raw.status+'。'+([401,403].includes(raw.status)?'请核对访问权限或密钥。':''));
    let refs;
    if(mode==='fetch'){
      const parsed=/html/i.test(raw.type)?spacePlain(raw.body,true):{title:'',text:spacePlain(raw.body)};
      if(!parsed.text.trim())throw Error('网页没有可读取的正文，可能需要登录或在浏览器运行脚本。');
      const url=spaceUrl(raw.url);refs=[{label:parsed.title||new URL(url).hostname,url,text:agentClip(parsed.text,90000)}];
    }else{
      const data=JSON.parse(raw.body);
      const rows=spec.service==='wiki'?data.query?.search?.map(x=>[x.title,new URL('/?curid='+x.pageid,spec.url).href,x.snippet]):spec.service==='tavily'?data.results?.map(x=>[x.title,x.url,x.content]):data.web?.results?.map(x=>[x.title,x.url,x.description]);
      if(!Array.isArray(rows)&&(data.error||spec.service!=='brave'))throw Error('搜索服务返回了无法识别的结果。');
      refs=(rows||[]).slice(0,8).flatMap(([title,url,content])=>{try{return [{label:spacePlain(String(title||url),true).text||String(title||url),url:spaceUrl(url),text:agentClip(spacePlain(String(content||''),true).text,1800)}];}catch{return [];}});
    }
    row.status='ok';
    return refs;
  }catch(e){row.status=signal?.aborted?'cancelled':'error';row.error=traceText(e.message,secrets);diagSeenErrors.add(e);throw e;}
  finally{row.ms=Date.now()-row.at;await diagSave(p.id,[row]);}
}
