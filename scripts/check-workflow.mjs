import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import worker from '../worker/index.js';
const root=new URL('../',import.meta.url);
const stubs=new Map(),cache=new Map(),downloads=[];
function node(selector){if(!stubs.has(selector))stubs.set(selector,{innerHTML:'',textContent:'',value:'',checked:false,open:false,classList:{toggle(){},add(){},remove(){}},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;},addEventListener(){}});return stubs.get(selector);}
const ctx=createContext({console,Intl,Date,Math,crypto:webcrypto,URL,Blob,AbortSignal,AbortController,FormData,structuredClone,document:{title:'',querySelector:node,querySelectorAll:()=>[],addEventListener(){}},location:{hash:'#overview'},history:{replaceState(){}},window:{addEventListener(){},scrollTo(){}},requestAnimationFrame(){},setTimeout:()=>0,clearTimeout(){},localStorage:{getItem:k=>cache.get(k),setItem:(k,v)=>cache.set(k,v)},fetch:async()=>new Response(JSON.stringify({server:null,local:null})),downloads,assert});
const localPage=await readFile(new URL('dist/local/preview.html',root),'utf8');
runInContext(localPage.slice(localPage.lastIndexOf('<script>')+8,localPage.lastIndexOf('</script>')),ctx);
const evalApp=s=>runInContext(s,ctx);
evalApp(`(()=>{
  assert.equal(REGION_ROWS.length,249);assert.equal(Object.keys(MARKETS).length,249);
  assert.equal(PLATFORMS.length,50);assert.equal(new Set(MEDIA_GROUPS.flatMap(g=>g.items.map(r=>r[0]))).size,50);
  for(const [id,m] of Object.entries(MARKETS)){
    assert.equal(resolveMarket(id),id);assert.equal(resolveMarket(m.alpha3),id);assert.equal(resolveMarket(m.name),id);
    assert.ok(m.code.endsWith('-'+id));assert.ok(m.lang);
  }
  for(const id of PLATFORMS)assert.equal(resolvePlatform(platformLabel(id)),id);
  assert.equal(visiblePickerGroups('markets','jpn','全部')[0].ids.join(),'JP');
  assert.equal(visiblePickerGroups('platforms','rednote','国内')[0].ids.join(),'小红书');
  assert.equal(visiblePickerGroups('platforms','rednote','海外').length,0);
  assert.equal(resolveMarket('中国香港'),'HK');assert.equal(resolveMarket('en-GB'),'GB');
  assert.equal(resolvePlatform('B站'),'哔哩哔哩');assert.equal(resolvePlatform('Facebook'),'Meta');
  const card={...project().cards[0],market:'JP',platform:'YouTube',copy:'Folda Go 通勤用',title:'日本の折りたたみカップ'};
  assert.ok(!audit(card,project().brief).some(x=>x.reason.includes('书写系统')));
  assert.ok(audit({...card,market:'US'},project().brief).some(x=>x.reason.includes('书写系统')));
  const long={...card,market:'CN',title:'好'.repeat(16),copy:'杯'.repeat(46)};
  const flagged=audit({...long,platform:'Google Ads'},project().brief);
  assert.ok(flagged.some(x=>x.path==='copy'&&x.quote==='92 / 90'));assert.ok(flagged.some(x=>x.path==='title'&&x.quote==='32 / 30'));
  assert.ok(!audit({...long,platform:'小红书'},project().brief).some(x=>/正文上限|标题上限|Facebook/.test(x.reason)));
})()`);
const initial=evalApp('clone(project())'),b=initial.brief,c=initial.cards[0];
assert.equal(initial.cards.length,12);assert.equal(initial.data.length,12);
assert.equal(new Set(initial.cards.map(x=>x.id)).size,12);
assert.ok(initial.cards.every(x=>x.shots.length===4));
assert.equal(evalApp("project().cards.filter(c=>reviewState(c,project().brief)==='高风险').length"),0);
assert.throws(()=>evalApp('exportCards([project().cards[0]])'),/人工审核/);
evalApp("download=(name,content)=>downloads.push({name,content});reviewDialog(project().cards[0].id)");
assert.throws(()=>evalApp("confirmCard(project().cards[0].id,true)"),/审阅人/);
node('#review-by').value='质检测试';node('#human-ack').checked=true;
evalApp("confirmCard(project().cards[0].id,true)");assert.equal(downloads.length,1);assert.match(downloads[0].content,/质检测试/);assert.match(downloads[0].content,/12–15s/);
await evalApp(`(async()=>{
  const original=download,p=project(),card=p.cards[0],before=p.exports.length;
  globalThis.meridianDesktop={};
  try{
    download=async()=>false;assert.equal(await exportCards([card]),false);assert.equal(p.exports.length,before);
    download=async()=>{throw Error('write failed');};await assert.rejects(exportCards([card]),/write failed/);assert.equal(p.exports.length,before);
    download=async()=>true;assert.equal(await exportCards([card]),true);assert.equal(p.exports.length,before+1);
  }finally{download=original;delete globalThis.meridianDesktop;}
})()`);
assert.ok(evalApp("audit({...project().cards[0],copy:'Guaranteed 900 mL. 100% leakproof'},project().brief).some(i=>i.level==='高'&&i.path==='copy')"));
assert.ok(evalApp("audit({...project().cards[0],copy:'X'.repeat(151)},project().brief).some(i=>i.level==='高'&&i.reason.includes('上限'))"));
assert.ok(evalApp("audit({...project().cards[3],copy:'X'.repeat(140)},project().brief).some(i=>i.level==='低')"));
assert.ok(evalApp("audit(project().cards.find(c=>c.direction==='proof'),{...project().brief,evidence:'',source:''}).some(i=>i.path==='proof'&&i.level==='高')"));
assert.throws(()=>evalApp("checkedSemantic({issues:[{level:'高',path:'bogus',quote:'x',reason:'y',fix:'z'}]})"));
assert.equal(evalApp("reviewState({...project().cards[0],revision:2},project().brief)"),'待语义复核');
const rt=evalApp("parseData(dataCsv(project().data,project().currency)).rows");assert.equal(JSON.stringify(rt),JSON.stringify(initial.data));
assert.equal(evalApp("readCsv('a,b\\n\"x, y\",\"甲\\n乙\"')[1].values[0]"),'x, y');
assert.throws(()=>evalApp("parseData('素材名称,创意方向,受众,国家,展示量,点击量,转化量,花费\\na,场景型,x,US,1,2,1,1')"),/第 2 行/);
assert.throws(()=>evalApp("parseData('素材名称,创意方向,受众,国家,展示量,点击量,转化量,花费,币种\\na,场景型,x,US,100,2,1,5,USD\\nb,证明型,x,ID,100,2,1,8,IDR')"),/多种币种/);
assert.equal(evalApp("metrics(total([])).cpa"),null);
const r=evalApp("activeReport(project())");assert.ok(r.best&&r.worst);assert.ok(r.experiments.some(x=>x.type==='点击后流失'&&x.d==='scene'));assert.equal(r.all.ctr,r.all.clicks/r.all.impressions);assert.equal(r.all.cvr,r.all.conversions/r.all.clicks);
for(const k of ['overview','brief','creative','audit','report']){evalApp("go('"+k+"')");assert.match(node('#view').innerHTML,/<h1>/);}
evalApp('nextBrief(0)');assert.equal(evalApp('project().round'),2);assert.equal(evalApp('project().parent'),initial.id);assert.match(evalApp('project().brief.experiment'),/A 组/);assert.equal(evalApp('project().data.length'),0);
const html=await (await worker.fetch(new Request('https://test.invalid/'))).text();assert.match(html,/经纬创意/);assert.doesNotMatch(html,/\/\*@JS@\*\//);
const input={brief:b,market:c.market,platform:c.platform,direction:c.direction,creative:c,provider:'server'};
const req=(op,body,headers={})=>new Request('https://test.invalid/api/'+op,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
assert.equal((await worker.fetch(req('generate',input),{})).status,409);
assert.equal((await worker.fetch(req('generate',input,{origin:'https://other.invalid'}),{})).status,403);
const fetchOrig=globalThis.fetch;
try{
  globalThis.fetch=async(url,opts)=>{const payload=JSON.parse(opts.body);assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(payload.text.format.name==='creative'?c:{issues:[]})}]}]});};
  for(const op of ['generate','audit']){const result=await worker.fetch(req(op,input),{OPENAI_API_KEY:'fixture-no-network'});assert.equal(result.status,200);assert.ok((await result.json()).result);}
  globalThis.fetch=async(url,opts)=>{const payload=JSON.parse(opts.body);assert.equal(url,'http://127.0.0.1:11434/api/chat');assert.equal(payload.stream,false);assert.equal(payload.format.type,'object');return Response.json({message:{content:JSON.stringify(c)}});};
  assert.equal((await worker.fetch(req('generate',{...input,provider:'local'}),{LOCAL_MODEL:'fixture'})).status,200);
  const stateBeforeKey=JSON.stringify([...cache.values()]);
  node('#model-provider').value='deepseek';node('#model-base').value='https://api.deepseek.com';
  node('#model-id').value='deepseek-flash';node('#session-key').value='fixture-ui-session';
  evalApp('saveConnection()');node('#session-key').value='';
  assert.equal(evalApp('connectionFromForm().key'),'fixture-ui-session');
  node('#model-provider').value='openai';node('#model-base').value='https://api.openai.com/v1';
  assert.throws(()=>evalApp('connectionFromForm()'),/API Key/);
  node('#model-provider').value='deepseek';node('#model-base').value='https://api.deepseek.com';
  node('#model-test-result').isConnected=true;
  ctx.fetch=(url,opts)=>worker.fetch(new Request('http://workbench.test'+url,opts),{IS_LOCAL:true});
  const calls=[];
  globalThis.fetch=async(url,opts)=>{
    assert.equal(url,'https://api.deepseek.com/chat/completions');
    assert.equal(new Headers(opts.headers).get('authorization'),'Bearer fixture-ui-session');
    const upstream=JSON.parse(opts.body);assert.equal(upstream.model,'deepseek-flash');calls.push(upstream);
    const output=[{ok:true},c,{issues:[]}][calls.length-1];
    return Response.json({model:'ds-serving-model',choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]});
  };
  await evalApp('testConnection()');assert.match(node('#model-test-result').textContent,/连接成功.*ds-serving-model/);
  assert.ok(!JSON.stringify(calls[0]).includes(initial.brief.name));
  const generated=await evalApp("callModel('generate',db.projects[0],db.projects[0].cards[0],new AbortController().signal,activeConnection())");
  assert.equal(generated.engine,'ds-serving-model');assert.equal(generated.result.shots.length,4);
  const reviewed=await evalApp("callModel('audit',db.projects[0],db.projects[0].cards[0],new AbortController().signal,activeConnection())");
  assert.equal(reviewed.result.issues.length,0);assert.equal(calls.length,3);
  assert.equal(JSON.stringify([...cache.values()]),stateBeforeKey);assert.ok(!stateBeforeKey.includes('fixture-ui-session'));
}finally{globalThis.fetch=fetchOrig;}
evalApp(`(()=>{
  const before=db.active;
  importBrief(JSON.stringify({markets:['Japan','中国大陆','JPN'],platforms:['rednote','YouTube Shorts','小红书']}),'targets.json');
  assert.equal(project().briefDraft.markets.join(),'JP,CN');assert.equal(project().briefDraft.platforms.join(),'小红书,YouTube');
  const scoped=emptyProject(SAMPLE_BRIEF);
  scoped.data=parseData('素材名称,创意方向,受众,国家,平台,展示量,点击量,转化量,花费\\n样本,场景型,通勤者,JPN,YouTube Shorts,3000,100,5,12').rows;
  assert.equal(scoped.data[0].country,'日本');assert.equal(scoped.data[0].platform,'YouTube');
  db.projects.push(scoped);setProject(scoped.id,'report');nextBrief(0);
  assert.equal(project().brief.markets.join(),'JP');assert.equal(project().brief.platforms.join(),'YouTube');
  setProject(before);
})()`);
console.log(JSON.stringify({variants:initial.cards.length,rows:initial.data.length,spend:r.all.spend,ctr:r.all.ctr,cvr:r.all.cvr,cpa:r.all.cpa,example:r.experiments[0],checks:'UI views, CSV edge cases, approval gate, risks, round trip and both model adapters passed (model adapter fixtures)'},null,2));

