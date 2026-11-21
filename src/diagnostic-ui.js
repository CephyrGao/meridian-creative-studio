function diagToken(n){return Number.isSafeInteger(n)?n.toLocaleString('zh-CN'):'未返回';}
function diagDuration(ms){return !Number.isFinite(ms)?'—':ms<1000?ms+' ms':(ms/1000).toFixed(2)+' 秒';}
function diagMetric(sum,field,title){
  const count=sum[field+'Known'];
  return `<div class="diag-metric"><small>${h(title)}</small><strong>${count?diagToken(sum[field]):sum.calls?'—':'0'}</strong><span>${count===sum.calls?(count?'全部有回执':'尚无已确认调用'):`${count}/${sum.calls} 次有此字段`}</span></div>`;
}
function diagSelected(state){
  return state.rows.filter(r=>(!diagTask||r.runId===diagTask)&&(diagFilter==='all'||(diagFilter==='issues'?r.status==='error'||r.status==='blocked':diagFilter==='mcp'?['mcp','incoming'].includes(r.kind):r.kind===diagFilter)));
}
function diagnosticView(p){
  const state=diagViewState(p.id),s=diagTask?(state.sum.byRun?.[diagTask]||diagCounts()):state.sum,rows=diagSelected(state);
  if(!state.loaded&&!diagBusyRead.has(p.id))diagEnsure(p.id);
  const subtitle=(p.brief.name||'当前项目')+' · '+(diagTask?'当前任务用量':'项目累计用量')+' · 最后更新 '+diagMoment(projectModified(p));
  const metrics=`<div class="diag-metrics"><div class="diag-metric"><small>模型调用</small><strong>${diagToken(s.calls)}</strong><span>${s.unknown?s.unknown+' 次工作台请求缺少上游回执':'含自动重试的实际请求'}</span></div>${diagMetric(s,'input','输入 Token')}${diagMetric(s,'output','输出 Token')}${diagMetric(s,'total','已知合计 Token')}</div>`;
  const actions=btn('刷新记录','diag-refresh','history','small')+btn('导出当前记录','diag-export','download','small');
  const controls=[['all','全部'],['issues','错误日志'],['model','模型'],['mcp','MCP'],['research','联网']].map(([k,l])=>`<button type="button" data-act="diag-filter" data-id="${k}" aria-pressed="${diagFilter===k}">${l}</button>`).join('');
  const task=diagTask?(agentRecords.get('run/'+diagTask)||p.evaluation?.runs.find(r=>r.id===diagTask)):null;
  const list=rows.length?`<div class="diag-table"><table><thead><tr><th>调用 / 操作</th><th>状态</th><th>耗时</th><th>总 Token</th><th>发生时间</th><th></th></tr></thead><tbody>${rows.map(row=>{
    const sub=[diagSources[row.kind],row.model,row.count>1?'第 '+row.index+'/'+row.count+' 次请求':'',row.step].filter(Boolean).join(' · ');
    return `<tr><td><strong>${h(row.label)}</strong><small>${h(sub)}</small></td><td>${badge(diagStatus[row.status]||row.status,row.status==='ok'?'good':row.status==='error'?'high':'medium')}</td><td>${h(diagDuration(row.ms))}</td><td>${row.kind==='model'?diagToken(row.usage?.total):'—'}</td><td>${h(diagMoment(row.at))}</td><td>${btn('详情','diag-detail','','small',row.id)}</td></tr>`;
  }).join('')}</tbody></table></div>`:empty(!state.loaded?'正在读取记录':diagFilter==='issues'?'没有匹配的错误记录':'暂无匹配的运行记录',diagTask?'本任务的模型、MCP 调用和异常会出现在这里。':'从模型连接、Agent 或 MCP 发起调用后，可在这里查看详情。');
  const capture=diagBodies(p.id);
  return `<div class="settings-records"><div><h2>运行记录</h2><p class="hint">${h(subtitle)}</p></div><div class="buttons">${actions}</div></div>`+metrics+`<section class="panel diag-panel"><div class="diag-controls"><div class="diag-tabs" aria-label="日志分类">${controls}</div>
    <button type="button" class="agent-switch" role="switch" aria-checked="${capture}" data-act="diag-bodies">记录正文 · ${capture?'开':'关'}</button></div>
    ${task?`<div class="diag-scope">${h(task.goal||('营销评测 · '+task.name))} ${btn('显示整个项目','diag-reset','','small')}</div>`:''}${list}
    <p class="hint diag-foot">用量从本版启用后按回执累计，每个项目保留最近 ${diagLimit} 条详情。正文仅保存在本机，单侧最多展示 32,768 个字符。${diagVolatile.has(p.id)?'本机日志存储暂不可用，新增记录仅保留在本窗口。':''}</p></section>`;
}
function diagDetail(row){
  const pairs=[['记录 ID',row.id],['来源',diagSources[row.kind]],['状态',diagStatus[row.status]],['发生时间',diagMoment(row.at)],['耗时',diagDuration(row.ms)],
    ['任务',row.runId?agentRecords.get('run/'+row.runId)?.goal||project().evaluation?.runs.find(r=>r.id===row.runId)?.name||row.runId:null],['步骤',row.step],['模型',row.model],['请求地址',row.endpoint],
    ['上游 HTTP',row.http],['工作台 HTTP',row.appHttp],['请求组',row.group],['同组请求',row.count>1?`${row.index} / ${row.count}`:null]];
  if(row.kind==='model')pairs.push(['输入 Token',diagToken(row.usage?.input)],['输出 Token',diagToken(row.usage?.output)],['合计 Token',diagToken(row.usage?.total)]);
  const info=`<dl class="diag-fields">${pairs.filter(([,v])=>v!==null&&v!==undefined&&v!=='').map(([k,v])=>`<div><dt>${h(k)}</dt><dd>${h(v)}</dd></div>`).join('')}</dl>`;
  const wire=['model','mcp','incoming','unconfirmed','research'].includes(row.kind)||row.layer;
  const body=wire?['request','response'].map((field,i)=>`<details class="diag-body" ${i?'':'open'}><summary>${i?'响应体':'请求体'} · ${h(row.layer||(row.kind==='research'?'联网服务':row.kind==='model'?'模型服务商':'MCP JSON-RPC'))}</summary>${row[field]!=null?`<pre>${h(row[field])}</pre>`:`<p class="hint">${row.capture===false?'此调用已关闭正文记录。':i?'没有收到可展示的响应正文。':'没有可展示的请求正文。'}</p>`}</details>`).join(''):'';
  const evaluation=project().evaluation?.runs.some(r=>r.id===row.runId);
  const related=row.runId?btn(evaluation?'打开评测记录':'打开 Agent 任务','diag-open-run','layers','small',row.runId):'';
  openDialog(row.label,info+(row.error?`<p class="warnbox">${h(row.error)}</p>`:'')+body,related+btn('关闭','close'),true);
}
async function diagAction(action,value){
  const p=project(),state=diagViewState(p.id);
  switch(action){
    case 'diag-detail':{const row=state.rows.find(r=>r.id===value);if(row)diagDetail(row);break;}
    case 'diag-filter':diagFilter=value;render();break;
    case 'diag-bodies':{
      const enabled=!diagBodies(p.id);
      try{localStorage.setItem('meridian-trace-bodies/'+p.id,enabled?'on':'off');}catch{throw Error('未能保存正文记录设置。');}
      await diagChangeSharedCapture(p.id,enabled);render();break;
    }
    case 'diag-refresh':await diagSyncInbound(p.id);await diagEnsure(p.id,true);break;
    case 'diag-run':diagFilter='all';diagTask=value;go('diagnostics');break;
    case 'diag-open-run':{
      const evaluation=p.evaluation?.runs.find(r=>r.id===value);
      if(evaluation){Object.assign(qualityChoice(p).choice,{suite:evaluation.suiteId,a:evaluation.id,b:''});go('quality');return;}
      const r=agentRecords.get('run/'+value);if(!r||r.pid!==p.id)return;
      agentSelection.set(p.id,value);go('agent');break;
    }
    case 'diag-reset':diagTask='';render();break;
    case 'diag-export':{
      await diagEnsure(p.id);await diagQueue;
      const view=diagViewState(p.id),{recent,byRun,...totals}=view.sum;
      await download((p.brief.name||'项目')+'-运行记录.json',JSON.stringify({project:p.brief.name,exported:new Date().toISOString(),projectTotals:totals,
        ...(diagTask?{taskId:diagTask,taskTotals:byRun?.[diagTask]||diagCounts()}:{}),records:diagSelected(view)},null,2),'application/json');
      break;
    }
  }
}
