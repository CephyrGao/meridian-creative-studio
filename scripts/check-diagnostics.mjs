import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import worker from '../worker/index.js';
const root=new URL('../',import.meta.url),ctx=createContext({assert,URL});
const sources=await Promise.all(['trace-format','diagnostics'].map(file=>readFile(new URL('src/'+file+'.js',root),'utf8')));
runInContext(sources.join('\n'),ctx);
runInContext(`{
  const sum=diagSummary('a');
  for(let n=0;n<140;n++)diagFold(sum,[{id:'a/'+n,at:n,runId:n%2?'run-a':'run-b',status:n===2?'error':'ok',kind:'model',usage:{input:n===0?null:0,output:1,total:n===0?null:1}}]);
  diagFold(sum,[{id:'a/139',at:139,status:'error',kind:'model',usage:{total:500}}]);
  assert.equal(sum.byRun['run-a'].calls,70);assert.equal(sum.byRun['run-b'].total,69);assert.equal(sum.calls,140);assert.equal(sum.recent.length,120);assert.equal(sum.total,139);assert.equal(sum.inputKnown,139);assert.equal(sum.outputKnown,140);assert.equal(sum.failures,1);
  const safe=traceBody({apiKey:'unique-key',messages:[{content:JSON.stringify({password:'unseen-pass',text:'Bearer captured-key'})}],url:'https://user:pw@host.invalid/a?sig=bogus',images:['a'.repeat(80)]});
  for(const sensitive of ['unique-key','unseen-pass','captured-key','user:pw','bogus','aaaaaaaaaa'])assert.ok(!safe.includes(sensitive),sensitive);
  assert.equal(traceUsage({usage:{prompt_tokens:0,completion_tokens:0}}).total,0);
  assert.equal(traceUsage({usage:{prompt_tokens:5}}).total,null);
  assert.ok(traceBody('量'.repeat(50000)).includes('已截取'));
}`,ctx);
const actual=globalThis.fetch,seen=[];
let next;
globalThis.fetch=async(url,opts)=>{const req=JSON.parse(opts.body);seen.push(req);return next(req);};
const cfg={provider:'compatible',baseUrl:'https://metrics-fixture.invalid/v1',model:'tester'},key='fixture-session-sensitive';
const post=async(path,c,body={},mode='body',env={IS_LOCAL:true})=>{
  const request=new Request('http://localhost:8764/api/'+path,{method:'POST',
    headers:{'content-type':'application/json','x-session-model-key':key,...(mode?{'x-meridian-trace':mode}:{})},
    body:JSON.stringify({...c,...body})});
  const r=await worker.fetch(request,env);return [r.status,await r.json()];
};
const chat=(value,usage)=>Response.json({id:'fixture-reply',model:'actual-model',choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(value)}}],usage});
try{
  next=req=>Object.hasOwn(req,'response_format')?Response.json({error:{param:'response_format',message:'unsupported response_format',api_key:key}},{status:400}):chat({ok:true},{prompt_tokens:71,completion_tokens:4,total_tokens:75});
  let [status,d]=await post('model/test',cfg);
  assert.equal(status,200);assert.equal(d.attempts.length,2);assert.equal(d.attempts[0].http,400);assert.equal(d.attempts[1].http,200);
  assert.ok(JSON.parse(d.attempts[0].request).response_format);assert.ok(!('response_format' in JSON.parse(d.attempts[1].request)));
  assert.ok(d.attempts[0].response.includes('[已隐藏]'));assert.ok(!JSON.stringify(d).includes(key));
  assert.deepEqual(d.usage,{input:71,output:4,total:75});assert.equal(d.total_tokens,75);
  next=()=>chat({unexpected:true},{prompt_tokens:13,completion_tokens:2,total_tokens:15});
  [status,d]=await post('model/test',cfg);assert.equal(status,502);assert.equal(d.attempts[0].http,200);assert.equal(d.attempts[0].usage.total,15);assert.match(d.attempts[0].response,/unexpected/);
  next=()=>new Response('upstream error containing '+key,{status:502});
  [status,d]=await post('model/test',cfg);assert.equal(status,502);assert.match(d.attempts[0].response,/upstream error/);assert.ok(!JSON.stringify(d).includes(key));
  next=()=>chat({ok:true},{total_tokens:23});
  [,d]=await post('model/test',cfg,{},'summary');assert.deepEqual(d.usage,{input:null,output:null,total:23});assert.ok(!('request' in d.attempts[0])&&!('response' in d.attempts[0]));
  [,d]=await post('model/test',cfg,{},'');assert.ok(!('attempts' in d));
  next=()=>chat({ok:true},undefined);[,d]=await post('model/test',cfg);assert.equal(d.usage.total,null);assert.ok(!('total_tokens' in d));
  next=()=>Response.json({model:'local',message:{content:'{"ok":true}'},prompt_eval_count:6,eval_count:3});
  [,d]=await post('model/test',{provider:'local'},{},'body',{IS_LOCAL:true,LOCAL_MODEL:'fixture-local'});assert.deepEqual(d.usage,{input:6,output:3,total:9});
  next=()=>Response.json({model:'responses',output:[{content:[{type:'output_text',text:'{"ok":true}'}]}],usage:{input_tokens:9,output_tokens:4,total_tokens:13}});
  [,d]=await post('model/test',{provider:'session'});assert.deepEqual(d.usage,{input:9,output:4,total:13});
  const count=seen.length;[status,d]=await post('generate',cfg,{market:'invalid'});assert.equal(status,422);assert.equal(seen.length,count);assert.deepEqual(d.attempts,[]);
  const bounded=async limit=>{
    const r=await worker.fetch(new Request('http://localhost:8764/api/model/test',{method:'POST',headers:{
      'content-type':'application/json','x-session-model-key':key,'x-meridian-trace':'summary','x-meridian-token-budget':String(limit)},body:JSON.stringify(cfg)}),{IS_LOCAL:true});
    return [r.status,await r.json()];
  };
  let start=seen.length;[status,d]=await bounded(1);
  assert.equal(status,409);assert.equal(d.code,'task_token_budget');assert.equal(seen.length,start);assert.ok(d.required>256);
  const required=d.required;
  next=()=>Response.json({error:{param:'response_format',message:'unsupported response_format'}},{status:400});
  [status,d]=await bounded(required);assert.equal(status,409);assert.equal(d.attempts.length,1);assert.equal(seen.length,start+1);
  assert.equal(d.attempts[0].reservedTokens,required);assert.equal(d.attempts[0].usage.total,null);
  next=req=>Object.hasOwn(req,'response_format')?Response.json({error:{param:'response_format',message:'unsupported response_format'},usage:{total_tokens:0}},{status:400}):chat({ok:true},{total_tokens:8});
  [status,d]=await bounded(required);assert.equal(status,200);assert.equal(d.attempts.length,2);assert.equal(d.usage.total,8);
  console.log('Diagnostics verified: actual HTTP attempts, retry payloads, successful transport with failed validation, usage variants, missing vs zero, project retention, masking, summary-only capture and pre-dispatch budget enforcement on each provider retry.');
}finally{globalThis.fetch=actual;}
