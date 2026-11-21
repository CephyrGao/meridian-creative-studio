import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {webcrypto} from 'node:crypto';

const base='http://127.0.0.1:8764';
const fixture=createContext({crypto:webcrypto,Intl});
for(const n of ['regions','catalog','core','sample'])runInContext(await readFile(new URL('../src/'+n+'.js',import.meta.url),'utf8'),fixture);
const sample=runInContext('makeSample()',fixture);
const card=sample.cards[0];
const draft={brief:sample.brief,market:card.market,platform:card.platform,direction:card.direction};
const routes=['/api/model/test','/api/generate','/api/audit'];
const issue={level:'中',path:'copy',quote:'example',reason:'复核语境',fix:'核对上下文'};
const reply=x=>({id:'chatcmpl-fixture',object:'chat.completion',created:42,model:'fixture-actual',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:typeof x==='string'?x:JSON.stringify(x)}}],usage:{total_tokens:17}});
const savedFetch=globalThis.fetch;
let respond,requests=[];
globalThis.fetch=async(url,opts)=>{
  const req={url:String(url),body:JSON.parse(opts.body),headers:new Headers(opts.headers),redirect:opts.redirect};requests.push(req);
  return await respond(req);
};
async function request(path,data,headers={},env={IS_LOCAL:true}){
  const res=await worker.fetch(new Request(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)}),env);
  return {status:res.status,body:await res.json()};
}
const checkError=async(p,status,pattern)=>{const r=await p;assert.equal(r.status,status);assert.match(typeof r.body.error==='string'?r.body.error:r.body.error.message,pattern);return r;};
try {
  const thumb='data:image/png;base64,AAAA';
  for(const [provider,endpoint,model] of [
    ['openai','https://api.openai.com/v1/chat/completions','gpt-4.1-mini'],
    ['deepseek','https://api.deepseek.com/chat/completions','deepseek-flash'],
    ['compatible','https://gateway.example/v1/chat/completions','team/model-42']
  ]){
    const cfg=provider==='compatible'?{provider,baseUrl:endpoint+'/',model}:{provider};
    for(const path of routes){
      requests=[];
      respond=req=>{
        assert.equal(req.url,endpoint);assert.equal(req.headers.get('authorization'),'Bearer fixture-key');assert.equal(req.redirect,'manual');
        assert.equal(req.body.model,model);assert.equal(req.body.stream,false);assert.equal(req.body.response_format.type,'json_object');
        assert.ok(!('input' in req.body));assert.equal(req.body.messages[0].role,'system');
        if(provider==='deepseek')assert.equal(req.body.thinking.type,'disabled');
        if(provider==='openai')assert.ok(req.body.max_completion_tokens>0);else assert.ok(req.body.max_tokens>0);
        if(path==='/api/model/test'){assert.ok(!JSON.stringify(req.body).includes(sample.brief.name));assert.ok(!JSON.stringify(req.body).includes(thumb));}
        else{assert.equal(req.body.messages[1].content[1].image_url.url,thumb);assert.ok(req.body.messages[1].content[0].text.includes(sample.brief.name));}
        return Response.json(reply(path.endsWith('/test')?{ok:true}:path.endsWith('/audit')?{issues:[issue]}:card));
      };
      const res=await request(path,{...draft,...cfg,images:[thumb],creative:card},{'x-session-model-key':'fixture-key'});
      assert.equal(res.status,200);assert.equal(requests.length,1);
      if(path.endsWith('/test')){assert.deepEqual(res.body.reply,{ok:true});assert.equal(res.body.model,'fixture-actual');assert.equal(res.body.total_tokens,17);}
      else {assert.equal(res.body.engine,'fixture-actual');assert.ok(path.endsWith('/audit')?res.body.result.issues.length===1:res.body.result.shots.length===4);}
    }
  }
  for(const [market,platform,locale,placement] of [
    ['CN','小红书','zh-Hans-CN','信息流笔记与短视频'],['JP','YouTube','ja-JP','Shorts 竖屏短视频'],
    ['BR','Google Ads','pt-BR','响应式搜索广告'],['FR','Reuters','fr-FR','商业合作内容提案']
  ]){
    for(const route of ['/api/generate','/api/audit']){
      respond=req=>{
        const spec=JSON.parse(req.body.messages[1].content);
        assert.equal(spec.market,market);assert.equal(spec.locale,locale);assert.equal(spec.platform,platform);
        assert.ok(spec.placement.includes(placement));assert.ok(spec.language);assert.ok(spec.marketName);
        assert.deepEqual(spec.brief.markets,[market]);assert.deepEqual(spec.brief.platforms,[platform]);
        return Response.json(reply(route.endsWith('audit')?{issues:[]}:card));
      };
      const result=await request(route,{...draft,market,platform,creative:card,provider:'deepseek'},{'x-session-model-key':'fixture-key'});
      assert.equal(result.status,200,market+' / '+platform+' / '+route);
    }
  }
  await checkError(request('/api/generate',{...draft,market:'ZZ',platform:'YouTube'}),422,/市场/);
  const rawBody={model:'deepseek-flash',messages:[{role:'user',content:'Reply OK'}],stream:false};
  respond=req=>{assert.equal(req.url,'https://api.deepseek.com/chat/completions');assert.deepEqual(req.body,rawBody);assert.equal(req.headers.get('authorization'),'Bearer sdk-fixture');return Response.json(reply('OK'));};
  const sdk=await request('/v1/chat/completions',rawBody,{Authorization:'Bearer sdk-fixture'});
  assert.equal(sdk.body.choices[0].message.content,'OK');assert.equal(sdk.body.object,'chat.completion');
  await checkError(request('/v1/chat/completions',{...rawBody,stream:true}),400,/stream/);
  await checkError(request('/v1/chat/completions',rawBody,{},{}),404,/本地/);
  const env={IS_LOCAL:true,DEEPSEEK_API_KEY:'server-deep',DEEPSEEK_MODEL:'custom-deep',OPENAI_API_KEY:'server-open',COMPAT_BASE_URL:'https://trusted.example/v1',COMPAT_MODEL:'x',COMPAT_API_KEY:'server-custom'};
  respond=req=>{assert.equal(req.headers.get('authorization'),'Bearer server-deep');assert.equal(req.body.model,'custom-deep');return Response.json(reply({ok:true}));};
  assert.equal((await request(routes[0],{provider:'deepseek'},{},env)).status,200);
  respond=req=>{assert.equal(req.headers.get('authorization'),null);return Response.json(reply({ok:true}));};
  assert.equal((await request(routes[0],{provider:'compatible',model:'x',baseUrl:'http://localhost:1234/v1'},{},env)).status,200);
  respond=()=>{throw Error('Unexpected provider call');};
  await checkError(request(routes[0],{provider:'openai',baseUrl:'https://other.example'}, {},env),400,/自定义/);
  await checkError(request(routes[0],{provider:'compatible',model:'x',baseUrl:'https://elsewhere.example'}, {},{...env,IS_LOCAL:false}),403,/在线/);
  for(const url of ['http://external.example/v1','file:///etc/hosts','https://u:p@gateway.example/v1','https://gateway.example/v1?key=dummy'])await checkError(request(routes[0],{provider:'compatible',model:'x',baseUrl:url}),400,/Base URL|HTTPS/);
  await checkError(request(routes[0],{provider:'deepseek'}),401,/API Key/);
  await checkError(request(routes[0],{provider:'deepseek'},{origin:'https://other.example'},env),403,/来源/);
  const status=await (await worker.fetch(new Request(base+'/api/status'),env)).text();assert.ok(!status.includes('server-deep'));assert.ok(!status.includes('server-open'));assert.ok(!status.includes('server-custom'));
  requests=[];const compat={provider:'compatible',model:'x',baseUrl:'https://gateway.example/v1'};
  respond=req=>{
    if(req.body.response_format)return Response.json({error:{message:'Unsupported parameter response_format'}},{status:400});
    if(req.body.max_tokens)return Response.json({error:{message:'Unsupported parameter max_tokens; use max_completion_tokens'}},{status:400});
    assert.ok(req.body.max_completion_tokens);return Response.json(reply({ok:true}));
  };
  assert.equal((await request(routes[0],compat)).status,200);assert.equal(requests.length,3);
  for(const status of [401,402,403,404,429,503]){
    requests=[];respond=()=>Response.json({error:{message:'upstream text fixture-secret'}},{status});
    const err=await checkError(request(routes[0],compat),status,new RegExp('HTTP '+status));assert.equal(err.body.upstream_status,status);assert.ok(!JSON.stringify(err).includes('fixture-secret'));assert.equal(requests.length,1);
  }
  for(const [bad,match] of [[reply('  '),/空内容/],[reply('hello'),/JSON/],[reply({ok:false}),/字段/],[{choices:[{finish_reason:'length'}]},/长度/]]){
    respond=()=>Response.json(bad);await checkError(request(routes[0],compat),502,match);
  }
  respond=()=>new Response(null,{status:307,headers:{location:'https://elsewhere.example'}});
  await checkError(request(routes[0],compat),502,/重定向/);
  console.log('PASS: three providers x probe/generate/audit, SDK route, credential scopes, HTTP errors, alternate parameter support and invalid/empty/truncated results (simulated upstream).');
}finally{globalThis.fetch=savedFetch;}

