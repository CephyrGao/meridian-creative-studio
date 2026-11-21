import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {hostStdio,endProcesses,startSharedPipe} from './mcp-host.mjs';
import {readFile} from 'node:fs/promises';
import worker from '../worker/index.js';
const js=await Promise.all(['mcp-wire','mcp-stream','mcp-client'].map(n=>readFile(new URL('../src/'+n+'.js',import.meta.url),'utf8')));
const {Client,send,format,Legacy}=new Function(js.join('\n')+'\nreturn {Legacy:McpLegacySse,Client:MeridianMcpClient,send:mcpUpstream,format:mcpResultText};')();
const base='http://127.0.0.1:8764',ep=base+'/mcp',env={IS_LOCAL:true};
const run=(path,options,config=env)=>worker.fetch(new Request(new URL(path,base),options),config);
const post=(path,data,headers={},config=env)=>run(path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)},config);
const local={'origin':base,'x-meridian-ui':'mcp'};
const owner='a'.repeat(48);
const manage=data=>post('/api/mcp/manage',{owner,...data},local);
const snapshot={projectId:'p1',brief:{name:'市场复盘',brand:'Folda'},round:2,source:'模拟数据',report:{currency:'USD',metrics:{ctr:.035}},creatives:[{id:'approved-1',title:'已审脚本'}]};
const rpc=(method,params={},id=1)=>({jsonrpc:'2.0',id,method,params});
assert.equal((await post('/mcp',rpc('tools/list'))).status,404);
assert.equal((await post('/api/mcp/manage',{owner,action:'publish',snapshot},{'origin':'https://other.example','x-meridian-ui':'mcp'})).status,403);
assert.equal((await post('/api/mcp/manage',{owner,action:'publish',snapshot},local,{})).status,404);
const shared=await (await manage({action:'publish',snapshot,capture:true})).json();
assert.equal(shared.active,true);
assert.equal((await post('/mcp',rpc('tools/list'))).status,401);
assert.equal((await (await manage({owner:'b'.repeat(48),action:'status'})).json()).token,undefined);
const auth={'authorization':'Bearer '+shared.token};
const init=await (await post('/mcp',rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'qa',version:'1'}}),auth)).json();
assert.equal(init.result.protocolVersion,'2025-11-25');
assert.equal((await post('/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},auth)).status,202);
const legacyList=await (await post('/mcp',rpc('tools/list'),auth)).json();
assert.deepEqual(legacyList.result.tools.map(t=>t.name),['get_brief','list_approved_creatives','get_campaign_report']);
const transport=async(data,token,signal)=>send(data,token,signal,(url,options)=>run(url,options));
const client=new Client(ep,shared.token,transport);
await client.connect();
assert.equal(client.name,'经纬创意');
assert.equal((await client.call('get_brief',{})).structuredContent.brief.brand,'Folda');
assert.deepEqual((await client.call('list_approved_creatives',{limit:1})).structuredContent.creatives,snapshot.creatives);
assert.equal((await client.call('list_approved_creatives',{limit:-1})).isError,true);
assert.equal((await client.call('get_campaign_report',{})).structuredContent.metrics.ctr,.035);
const journal=async(extra={})=>(await (await manage({action:'journal',projectId:'p1',...extra})).json()).events;
const records=await journal();
assert.ok(records.some(r=>r.label==='get_brief'&&r.response.includes('Folda'))&&records.some(r=>r.status==='error'));
assert.ok(records.every(r=>r.pid==='p1'&&r.kind==='incoming'&&r.http!==401));
assert.ok(!JSON.stringify(records).includes(shared.token));assert.deepEqual(await journal({owner:'b'.repeat(48)}),[]);assert.deepEqual(await journal({projectId:'p2'}),[]);
await manage({action:'ack',projectId:'p1',ids:records.map(r=>r.id)});
await manage({action:'recording',projectId:'p1',enabled:false});
await client.call('get_brief',{});
const muted=await journal();assert.equal(muted.length,1);assert.equal(muted[0].request,null);assert.equal(muted[0].response,null);
assert.equal((await manage({action:'publish',snapshot:{...snapshot,projectId:'different'}})).status,409);
snapshot.brief.brand='更新后的品牌';
assert.equal((await (await manage({action:'publish',snapshot})).json()).token,shared.token);
assert.equal((await client.call('get_brief',{})).structuredContent.brief.brand,'更新后的品牌');
await manage({action:'stop'});
assert.equal((await post('/mcp',rpc('tools/list'),auth)).status,404);
const sharedAgain=await (await manage({action:'publish',snapshot})).json();
assert.notEqual(shared.token,sharedAgain.token);
assert.equal((await post('/mcp',rpc('tools/list'),auth)).status,401);
let calls=0,notifications=0,providedFirstPage=false,requestedSecondPage=false,streamClosed=false;
const fixture=async(url,options)=>{
  assert.equal(url,'https://fixture.invalid/mcp');
  assert.equal(options.redirect,'error');assert.equal(options.headers.get('authorization'),'Bearer test-session');
  const m=JSON.parse(options.body);
  const reply=(result,headers={},status=200)=>new Response(JSON.stringify({jsonrpc:'2.0',id:m.id,result}),{status,headers:{'content-type':'application/json',...headers}});
  if (m.method==='server/discover') return new Response('legacy service',{status:400});
  if (m.method==='initialize') return reply({protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'市场查询'}},{'mcp-session-id':'session-1'});
  assert.equal(options.headers.get('mcp-session-id'),'session-1');assert.equal(options.headers.get('mcp-protocol-version'),'2025-06-18');
  if (m.method==='notifications/initialized'){notifications++;return new Response(null,{status:202});}
  if (m.method==='tools/list') {
    if (m.params.cursor) {assert.equal(m.params.cursor,'p2');requestedSecondPage=true;return reply({tools:[{name:'query',inputSchema:{type:'object'}}]});}
    providedFirstPage=true;return reply({tools:[],nextCursor:'p2'});
  }
  calls++;assert.equal(m.method,'tools/call');assert.deepEqual(m.params,{name:'query',arguments:{market:'日本'}});
  const wire=': heartbeat\r\n\r\nevent: message\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\n'+
    'data: '+JSON.stringify({jsonrpc:'2.0',id:m.id,result:{content:[{type:'text',text:'渠道资料 · 日本'}]}})+'\r\n\r\n';
  const bytes=new TextEncoder().encode(wire);
  return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));},cancel(){streamClosed=true;}}),
    {headers:{'content-type':'text/event-stream'}});
};
const relay=async(exchange,token)=>{
  const response=await post('/api/mcp/exchange',exchange,{...local,'x-meridian-mcp-token':token},{IS_LOCAL:true,MCP_FETCH:fixture});
  const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;
};
const remote=new Client('https://fixture.invalid/mcp','test-session',relay);
await remote.connect();
assert.equal(format(await remote.call('query',{market:'日本'})),'渠道资料 · 日本');
assert.ok(providedFirstPage&&requestedSecondPage&&streamClosed);assert.equal(calls,1);assert.equal(notifications,1);
const bad=await post('/api/mcp/exchange',{endpoint:'https://fixture.invalid/mcp',message:rpc('tools/list')},{...local,origin:'https://other.example'});
assert.equal(bad.status,403);
const sseUrl=base+'/sse',legacy=new Legacy(sseUrl,sharedAgain.token,(url,options)=>run(url,options));
const until=AbortSignal.timeout(10000);
await legacy.open(until);
const sseClient=new Client(sseUrl,sharedAgain.token,(e,t,signal)=>legacy.send(e.message,signal),'sse');
await sseClient.connect(until);assert.equal(sseClient.version,'2024-11-05');
const [brief,summary]=await Promise.all([sseClient.call('get_brief',{},until),sseClient.call('get_campaign_report',{},until)]);
assert.ok(brief.structuredContent.brief.brand);assert.equal(summary.structuredContent.metrics.ctr,.035);
assert.equal((await run(sseUrl)).status,401);
const auth2={authorization:'Bearer '+sharedAgain.token};assert.equal((await run(sseUrl,{headers:{...auth2,origin:'http://elsewhere.invalid'}})).status,403);
const abortBad=new Legacy(sseUrl,'secret',async(url,options)=>{
  assert.equal(options.method,'GET');return new Response('event: endpoint\ndata: https://other.invalid/push\n\n',{headers:{'content-type':'text/event-stream'}});
});
await assert.rejects(abortBad.open(until),/不同源/);
await manage({action:'stop'});await assert.rejects(sseClient.call('get_brief',{},until));legacy.close();
const sharedFinal=await (await manage({action:'publish',snapshot})).json();
const channel=(data,envExtra={})=>post('/api/mcp/channel',data,local,{IS_LOCAL:true,...envExtra});
assert.equal((await channel({action:'open',transport:'stdio',config:{command:'node',args:[],env:{}}})).status,403);
const pipe=startSharedPipe(worker);await pipe.ready;
const portableFile=new URL('./local.mjs',import.meta.url);
const openSession=async(config)=>{
  const start=await channel({action:'open',transport:'stdio',config},{MCP_STDIO:hostStdio});
  const value=await start.json();assert.equal(start.status,200,JSON.stringify(value));
  const client=new Client('stdio://local/qa','',async(data,t,signal)=>{
    const response=await channel({action:'send',id:value.id,message:data.message});
    return response.json();
  },'stdio',config.command);
  return {client,id:value.id};
};
try{
  const config={command:process.execPath,args:[fileURLToPath(portableFile),'--mcp-stdio'],env:{MERIDIAN_MCP_PIPE:pipe.path,MERIDIAN_MCP_TOKEN:sharedFinal.token}};
  const {client:proc,id}=await openSession(config);await proc.connect(until);
  assert.deepEqual(proc.tools.map(t=>t.name),['get_brief','list_approved_creatives','get_campaign_report']);
  assert.equal((await proc.call('get_brief',{},until)).structuredContent.brief.brand,snapshot.brief.brand);
  await manage({action:'stop'});await assert.rejects(proc.call('get_brief',{},until));
  assert.equal((await channel({action:'close',id})).status,200);
  assert.equal((await channel({action:'send',id,message:rpc('tools/list')})).status,404);
  const code=[
    "const readline=require('node:readline'); console.error('fixture stderr');",
    "readline.createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);if(m.id===undefined)return;",
    "let result=m.method==='initialize'?{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'stdio fixture'}}:m.method==='tools/list'?{tools:[{name:'echo',inputSchema:{type:'object'}}]}:{content:[{type:'text',text:process.argv[1]+'|'+process.env.FIXTURE_TEXT}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');});"
  ].join('');
  const quoted='含空格 "双引号" \\path\\';
  const external=await openSession({command:process.execPath,args:['-e',code,quoted],env:{FIXTURE_TEXT:'逐行数据'}});
  await external.client.connect(until);assert.equal(format(await external.client.call('echo',{},until)),quoted+'|逐行数据');
  await channel({action:'close',id:external.id});
}finally{endProcesses();pipe.close();}
console.log('Three MCP transports passed. Legacy SSE endpoint events, parallel calls, origin, authorization and revocation. Real portable stdio host and client child processes, quoted arguments, scoped environment and project tools.');
