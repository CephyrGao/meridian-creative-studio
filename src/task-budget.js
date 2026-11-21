function readTokenLimit(value){
  if(value==null||String(value).trim()==='')return null;
  const s=String(value).trim(),n=Number(s);
  if(!/^\d+$/.test(s)||!Number.isSafeInteger(n)||n<1)throw Error('Token 预算需为正整数，留空表示不限。');
  return n;
}
function budgetLeft(b){return Math.max(0,b.limit-b.reported-b.held);}
function persistBudget(run){
  if(run.kind==='evaluation'){run.updated=Date.now();const p=db.projects.find(x=>x.id===run.pid);if(p)p.updated=run.updated;save();return !saveFailed;}
  agentSaveRun(run);return !agentVolatile.has('run/'+run.id);
}
function budgetRecover(run){
  const b=run.budget;
  if(b?.pending){b.held+=b.pending.amount;delete b.pending;persistBudget(run);}
}
function budgetBegin(ctx){
  const run=ctx.budgetRun,b=run?.budget;
  if(!b?.limit)return null;
  const amount=budgetLeft(b);
  if(!amount)throw new AgentNeeds('本任务可用 Token 已用完。调高预算后可继续当前步骤。','budget');
  b.pending={amount};
  if(!persistBudget(run)){
    delete b.pending;throw new AgentNeeds('本机未能保存预算预留，模型请求已暂停。释放存储空间后可继续。','storage');
  }
  return {run,amount};
}
function budgetSettle(ticket,data){
  if(!ticket)return;
  const b=ticket.run.budget;
  if(Array.isArray(data?.attempts)&&data.attempts.every(a=>Number.isSafeInteger(a.reservedTokens)&&a.reservedTokens>0)){
    for(const a of data.attempts){
      if(Number.isSafeInteger(a.usage?.total)&&a.usage.total>=0)b.reported+=a.usage.total;
      else b.held+=a.reservedTokens;
    }
  }else b.held+=ticket.amount;
  delete b.pending;persistBudget(ticket.run);
}
function budgetLabel(b){
  if(!b?.limit)return '无 Token 上限';
  const n=v=>v.toLocaleString('zh-CN');
  return `预算 ${n(b.limit)} · 已回报 ${n(b.reported)} · 未确认预留 ${n(b.held)} · 可用 ${n(budgetLeft(b))}`;
}
function budgetDialog(run){
  const b=run.budget;
  openDialog('调整任务 Token 预算',`<p>${h(run.goal||run.name)}</p><label class="field"><span>总预算（输入 + 输出 Token）</span><input id="budget-change" type="number" min="1" step="1" value="${b?.limit??''}" placeholder="留空表示不限"></label>
    <p class="hint">${h(budgetLabel(b))}。请求发出前会按输入字节量、消息开销和输出上限预留。没有回执的调用保留预留额。${b?.limit?'':'首次设限从保存时开始计量。'}</p>`,btn('保存预算',run.kind==='evaluation'?'quality-budget-save':'agent-budget-save','check','primary',run.id));
}
async function changeBudget(p,r,value){
  const limit=readTokenLimit(value);
  const change=()=>{
    const evaluation=r.kind==='evaluation';
    let fresh;try{fresh=evaluation?JSON.parse(localStorage.getItem(storeKey))?.projects.find(q=>q.id===p.id)?.evaluation?.runs.find(x=>x.id===r.id):JSON.parse(localStorage.getItem(agentPrefix+'run/'+r.id));}catch{}
    if(fresh?.pid===p.id&&(fresh.updated||fresh.created)>=(r.updated||r.created)&&!agentVolatile.has('run/'+r.id))Object.assign(r,fresh);
    if(agentActive?.id===r.id||(evaluation&&job)||r.status==='done')throw Error('请在任务暂停时调整预算。');
    budgetRecover(r);
    const b=r.budget?.limit?r.budget:{reported:0,held:0};
    if(limit!==null&&limit<b.reported+b.held)throw Error('总预算不能低于已回报和未确认预留的合计。');
    r.budget={...b,limit};if(!persistBudget(r))throw Error('本机空间不足，预算调整尚未保存。');closeDialog();render();
  };
  if(globalThis.navigator?.locks?.request)await navigator.locks.request((r.kind==='evaluation'?'meridian-evaluation-':'meridian-agent-')+r.id,{ifAvailable:true},lock=>{if(!lock)throw Error('此任务正在另一个窗口运行。');change();});
  else change();
}
