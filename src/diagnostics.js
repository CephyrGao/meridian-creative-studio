const diagLimit=120,diagViews=new Map(),diagVolatile=new Set(),diagContexts=new WeakMap(),diagSeenErrors=new WeakSet();
const diagStatus={ok:'成功',error:'失败',cancelled:'已停止',blocked:'待补充'};
const diagSources={research:'联网工具',model:'模型',mcp:'MCP 出站',incoming:'MCP 入站',agent:'Agent',app:'工作台',unconfirmed:'模型请求'};
const diagRoute={'agent/plan':'任务规划','agent/write':'技能分析',generate:'生成脚本',audit:'语义复核','model/test':'测试模型连接'};
let diagDatabase,diagQueue=Promise.resolve(),diagFilter='all',diagTask='',diagBusyRead=new Set();
function diagCounts(){return {calls:0,unknown:0,failures:0,input:0,output:0,total:0,inputKnown:0,outputKnown:0,totalKnown:0};}
function diagSummary(pid){return {pid,...diagCounts(),byRun:{},recent:[]};}
function diagViewState(pid){
  if(!diagViews.has(pid))diagViews.set(pid,{sum:diagSummary(pid),rows:[],loaded:false});
  return diagViews.get(pid);
}
function diagBodies(pid){
  try{return localStorage.getItem('meridian-trace-bodies/'+pid)!=='off';}catch{return false;}
}
function diagBinding(signal){
  return (signal&&diagContexts.get(signal))||{pid:db.active,runId:'',step:''};
}
function diagDb(){
  if(!diagDatabase)diagDatabase=new Promise(resolve=>{
    if(!globalThis.indexedDB){resolve(null);return;}
    let req;try{req=indexedDB.open('meridian-run-history',1);}catch{resolve(null);return;}
    req.onupgradeneeded=()=>{
      const db=req.result;
      db.createObjectStore('projects',{keyPath:'pid'});
      db.createObjectStore('records',{keyPath:'id'}).createIndex('project','pid');
    };
    req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();diagDatabase=null;};resolve(db);};
    req.onerror=()=>resolve(null);
    req.onblocked=()=>resolve(null);
  });
  return diagDatabase;
}
function diagCount(sum,row){
  if(row.status==='error')sum.failures++;
  if(row.kind==='unconfirmed')sum.unknown++;
  if(row.kind!=='model')return;
  sum.calls++;
  for(const field of ['input','output','total']){
    const n=row.usage?.[field];
    if(Number.isSafeInteger(n)&&n>=0){sum[field]+=n;sum[field+'Known']++;}
  }
}
function diagFold(sum,rows){
  const seen=new Set(sum.recent.map(r=>r.id)),added=[];
  for(const row of rows){
    if(seen.has(row.id))continue;
    seen.add(row.id);added.push(row);sum.recent.push({id:row.id,at:row.at});
    diagCount(sum,row);
    if(row.runId){
      sum.byRun??={};
      if(!Object.hasOwn(sum.byRun,row.runId))sum.byRun[row.runId]=diagCounts();
      diagCount(sum.byRun[row.runId],row);
    }
  }
  sum.recent.sort((a,b)=>b.at-a.at||b.id.localeCompare(a.id));
  return {added,removed:sum.recent.splice(diagLimit)};
}
function diagDiskWrite(handle,pid,rows){
  return new Promise((resolve,reject)=>{
    const tx=handle.transaction(['projects','records'],'readwrite'),projects=tx.objectStore('projects'),records=tx.objectStore('records');
    const req=projects.get(pid);let sum;
    req.onsuccess=()=>{
      sum=req.result||diagSummary(pid);
      const {added,removed}=diagFold(sum,rows);
      for(const r of added)records.put(r);
      for(const r of removed)records.delete(r.id);
      projects.put(sum);
    };
    tx.oncomplete=()=>resolve(sum);tx.onabort=()=>reject(tx.error||Error('无法保存运行记录。'));
  });
}
function diagDiskRead(handle,pid){
  return new Promise((resolve,reject)=>{
    const tx=handle.transaction(['projects','records'],'readonly');
    const sum=tx.objectStore('projects').get(pid),rows=tx.objectStore('records').index('project').getAll(pid);
    tx.oncomplete=()=>resolve({sum:sum.result||diagSummary(pid),rows:rows.result.sort((a,b)=>b.at-a.at||b.id.localeCompare(a.id)),loaded:true});
    tx.onabort=()=>reject(tx.error||Error('无法读取运行记录。'));
  });
}
function diagRedraw(pid){if(settingsAt('records')&&db.active===pid)render();}
function diagEnsure(pid,force=false){
  const view=diagViewState(pid);
  if(diagBusyRead.has(pid)||(view.loaded&&!force)||diagVolatile.has(pid))return diagQueue;
  diagBusyRead.add(pid);
  diagQueue=diagQueue.then(async()=>{
    try{
      const archive=localStorage.getItem(archivePrefix+pid);
      if(archive){diagViews.set(pid,JSON.parse(archive));return;}
      const handle=await diagDb();if(!handle)throw Error();
      diagViews.set(pid,await diagDiskRead(handle,pid));
    }catch{diagVolatile.add(pid);view.loaded=true;}
    finally{diagBusyRead.delete(pid);diagRedraw(pid);}
  });
  return diagQueue;
}
function diagSave(pid,rows){
  if(!pid||!rows.length)return Promise.resolve();
  diagQueue=diagQueue.then(async()=>{
    const view=diagViewState(pid);
    try{
      const archive=localStorage.getItem(archivePrefix+pid);
      if(archive&&!diagVolatile.has(pid)){
        const stored=JSON.parse(archive);diagFold(stored.sum,rows);
        const kept=new Map([...stored.rows,...rows].map(r=>[r.id,r]));stored.rows=stored.sum.recent.map(r=>kept.get(r.id));
        localStorage.setItem(archivePrefix+pid,JSON.stringify(stored));diagViews.set(pid,stored);diagRedraw(pid);return;
      }
      const handle=await diagDb();
      if(!handle||diagVolatile.has(pid))throw Error();
      view.sum=await diagDiskWrite(handle,pid,rows);
      if(settingsAt('records')&&db.active===pid){diagViews.set(pid,await diagDiskRead(handle,pid));diagRedraw(pid);return;}
    }catch{diagVolatile.add(pid);diagFold(view.sum,rows);view.loaded=true;}
    const recent=new Map([...view.rows,...rows].map(r=>[r.id,r]));
    view.rows=view.sum.recent.map(r=>recent.get(r.id)).filter(Boolean);
    diagRedraw(pid);
  }).catch(()=>{diagVolatile.add(pid);});
  return diagQueue;
}
function diagNew(context,kind,label){
  const idValue=id();
  return {id:idValue,group:idValue,at:Date.now(),pid:context.pid,runId:context.runId||'',step:context.step||'',kind,label};
}
function diagError(error,label,context=diagBinding(),status='error'){
  if(!error||typeof error!=='object'||diagSeenErrors.has(error))return;
  diagSeenErrors.add(error);
  const secrets=[sessionOptions?.key,mcpConnection?.token,mcpTokenDraft,mcpAccess?.token];
  const row=diagNew(context,'app',label);
  if(context.runId)row.kind='agent';
  return diagSave(context.pid,[{...row,status,ms:null,error:traceText(error.message||String(error),secrets).slice(0,1300)}]);
}
function diagModelRows(base,data,response,error,body,settings,key,capture){
  const attempts=data?.attempts;
  if(Array.isArray(attempts)&&attempts.length){
    const budgetStop=error?.action==='budget';
    const rows=attempts.map((a,i)=>{
      const last=i===attempts.length-1&&!budgetStop,failed=!!a.error||(last&&!!error);
      return {...base,id:base.id+'/'+(i+1),at:a.at||base.at,ms:a.ms,kind:'model',index:i+1,count:attempts.length,
        model:a.model||settings.model,provider:settings.provider,endpoint:a.endpoint,http:a.http,appHttp:response?.status,
        usage:a.usage,status:last&&error?.diagCancelled?'cancelled':failed?'error':'ok',
        error:traceText(last&&error?error.message:a.error||'',[key]),capture,
        request:capture?a.request:null,response:capture?a.response:null};
    });
    if(budgetStop)rows.push({...base,id:base.id+'/budget',kind:'app',label:'预算暂停 · '+base.label,at:Date.now(),status:'blocked',ms:null,error:traceText(error.message,[key])});
    return rows;
  }
  const actual=!!data&&!error&&(data.engine||data.ok===true);
  return [{...base,kind:actual?'model':Array.isArray(attempts)?'app':'unconfirmed',ms:Date.now()-base.at,
    model:traceText(data?.engine||data?.model||settings.model||'',[key]),provider:settings.provider,endpoint:'/api/'+base.route,
    appHttp:response?.status,usage:data?.usage,status:error?.action==='budget'?'blocked':error?.diagCancelled?'cancelled':error?'error':'ok',
    error:error?traceText(error.message,[key]):'',capture,layer:'工作台接口',
    request:capture?traceBody(body,[key]):null,response:capture?traceBody(data,[key]):null}];
}
function diagMoment(value){
  if(!value)return '暂无记录';
  return new Date(value).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
}
function projectModified(p){
  let last=Number(p.updated)||Date.parse(p.updated)||0;
  const consider=value=>{const t=typeof value==='number'?value:Date.parse(value);if(Number.isFinite(t))last=Math.max(last,t);};
  for(const r of agentRunsFor(p.id))consider(r.updated);
  consider(agentRecords.get('memory/'+p.id)?.updated);
  for(const c of p.cards||[]){consider(c.approval?.at);consider(c.semantic?.at);}
  for(const e of p.exports||[])consider(e.at);
  return last;
}
let diagPollTimer=null;
const diagInboundReads=new Map();
function diagSyncInbound(pid){
  if(!pid||!mcpLocal())return Promise.resolve();
  if(diagInboundReads.has(pid))return diagInboundReads.get(pid);
  const sync=(async()=>{
    const owner=mcpOwnerId(),base={owner,projectId:pid};
    for(let page=0;page<10;page++){
      const packet=await mcpLocalPost('manage',{...base,action:'journal'},{},AbortSignal.timeout(8000));
      const rows=(packet.events||[]).filter(r=>r.pid===pid&&r.kind==='incoming'&&typeof r.id==='string');
      if(!rows.length)break;
      await diagSave(pid,rows);
      await mcpLocalPost('manage',{...base,action:'ack',ids:rows.map(r=>r.id)},{},AbortSignal.timeout(8000));
      if(rows.length<12)break;
    }
  })().catch(()=>{}).finally(()=>diagInboundReads.delete(pid));
  diagInboundReads.set(pid,sync);return sync;
}
function diagScheduleInbound(){
  clearTimeout(diagPollTimer);
  if(mcpAccess.active&&mcpAccess.projectId)diagPollTimer=setTimeout(async()=>{
    await diagSyncInbound(mcpAccess.projectId);diagScheduleInbound();
  },3500);
}
async function diagChangeSharedCapture(pid,enabled){
  if(mcpLocal())await mcpLocalPost('manage',{action:'recording',owner:mcpOwnerId(),projectId:pid,enabled},{},AbortSignal.timeout(8000));
}
