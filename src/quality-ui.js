function qualityRunName(r){return r.name+' · '+diagMoment(r.created);}
function qualityCell(r,c){
  if(!r)return '<td>—</td>';
  const item=r.items.find(i=>i.caseId===c.id);
  const result=item?.review?`${item.review.decision==='pass'?'通过':'返修'} · 语气 ${item.review.tone}/5`:item?.status==='done'?'待人工审阅':({running:'生成中',failed:'失败',paused:'已暂停',pending:'待生成'}[item?.status]||'待生成');
  return `<td>${h(result)}${item?.card?btn('查看 / 审阅','quality-review','','small',r.id+'|'+c.id):item?.error?`<small>${h(item.error)}</small>`:''}</td>`;
}
function qualityView(p){
  const {choice,book,suite,runs,a,b}=qualityChoice(p);
  const pick=(key,selected)=>`<label class="field"><span>对照 ${key.toUpperCase()}</span><select id="quality-${key}">${option('','选择模型记录',selected)}${runs.map(r=>option(r.id,qualityRunName(r),selected)).join('')}</select></label>`;
  const metrics=(r)=>{
    if(!r)return null;const m=qualityStats(r);
    return {name:r.name,done:`${m.generated}/${m.total}`,coverage:`${m.reviewed}/${m.generated}`,autoFacts:m.autoFacts,autoBrand:m.autoBrand,facts:m.facts,tone:m.tone,pass:m.pass};
  };
  const ma=metrics(a),mb=metrics(b);
  const table=runs.length?`<div class="quality-select">${pick('a',choice.a)}${pick('b',choice.b)}</div><div class="diag-table"><table><thead><tr><th>同版本比较</th><th>${h(ma?.name||'A')}</th><th>${h(mb?.name||'B')}</th></tr></thead><tbody>
    ${[['生成成功 / 案例','done'],['事实与证据规则通过率','autoFacts'],['品牌用词规则通过率','autoBrand'],['已审 / 已生成','coverage'],['事实准确率（人工）','facts'],['品牌语气均分','tone'],['人工通过率','pass']].map(([l,k])=>`<tr><td>${l}</td><td>${h(ma?.[k]||'—')}</td><td>${h(mb?.[k]||'—')}</td></tr>`).join('')}</tbody></table></div><div class="buttons">${a?btn('A 组调用明细','diag-run','list','small',a.id):''}${b?btn('B 组调用明细','diag-run','list','small',b.id):''}</div><p class="hint">规则通过率按已生成案例计算。事实准确率、语气均分和人工通过率按已审案例计算。可切换模型连接，用相同案例再运行一组。</p>`:'<p class="hint">运行第一组后可逐条审阅。切换到第二个模型，再运行同一版本即可并排比较。</p>';
  const incomplete=runs.filter(r=>r.status!=='done').map(r=>`<div class="slot"><strong>${h(qualityRunName(r))}</strong><p>${h(r.error||'本组有未完成案例。')}</p><small>${h(budgetLabel(r.budget))}</small><div class="buttons">${job||agentActive?'':btn('继续剩余案例','quality-resume','play','small',r.id)+btn('调整预算','quality-budget','coins','small',r.id)}</div></div>`).join('');
  return head('营销质量评测',p.brief.name||'当前项目',btn('切换评测模型','settings-tab','plug','','api'))+
    `<section class="panel"><div class="quality-setup"><label class="field"><span>评测集版本</span><select id="quality-suite">${book.suites.map(s=>option(s.id,`版本 ${s.version} · ${s.cases.length} 份 Brief`,suite.id)).join('')}</select></label>
    <label class="field"><span>本组 Token 预算</span><input id="quality-budget-input" type="number" min="1" placeholder="留空不限" value="${h(choice.budget)}"></label><div class="buttons">${btn('加入当前 Brief','quality-add','plus')}${job||agentActive?'':btn('运行当前模型','quality-start','play','primary')}</div></div><small class="hint">${modelName()?'当前模型 · '+h(modelName()):'连接模型后可生成评测结果'} · 每个案例生成一条广告</small></section>
    <div class="quality-block">${panel('模型对照',table)}${panel('逐案审阅',`<div class="diag-table"><table><thead><tr><th>固定 Brief</th><th>对照 A</th><th>对照 B</th></tr></thead><tbody>${suite.cases.map(c=>`<tr><td><strong>${h(c.name)}</strong><small>${h(MARKETS[c.market].name+' · '+platformLabel(c.platform))}</small>${btn('查看 Brief','quality-case','','small',c.id)}</td>${qualityCell(a,c)}${qualityCell(b,c)}</tr>`).join('')}</tbody></table></div>`)}</div>`+(incomplete?panel('未完成评测',incomplete):'');
}
function qualityBrief(c){
  const b=c.brief;
  return `<div class="slot quality-brief"><strong>${h(c.name)}</strong><p>${h(b.product)}</p><dl>${[['受众',b.audience],['可核实事实',[b.benefits,b.params].filter(Boolean).join(' · ')],['品牌语气',b.tone],['保留 / 禁用',[b.terms,b.banned].filter(Boolean).join(' / ')],['授权证据',[b.evidence,b.source].filter(Boolean).join(' · ')],['审阅要点',c.checks.join('；')]].filter(([,v])=>v).map(([k,v])=>`<div><dt>${k}</dt><dd>${h(v)}</dd></div>`).join('')}</dl></div>`;
}
function qualityReviewDialog(r,c,item){
  const v=item.review||{},card=item.card;
  const choices=(id,label,options,selected)=>`<label class="field"><span>${label}</span><select id="quality-${id}">${option('','请选择',String(selected||''))}${options.map(([k,l])=>option(k,l,String(selected||''))).join('')}</select></label>`;
  const clues=item.issues?.length?item.issues.map(i=>`${fieldName(i.path)} · ${i.reason} ${i.quote}`).join('\n'):'程序检查未发现已配置规则中的问题。';
  openDialog('审阅 · '+c.name,`<div class="stack">${qualityBrief(c)}<div class="slot"><h3>${h(card.title)}</h3><p>${h(card.copy)}</p><p>${h(card.cta)}</p><small>${h(item.engine||r.name)}</small>
    <details class="diag-body"><summary>分镜、标签与证据</summary><pre>${h(agentCreativeText(card)+'\n'+card.tags.join(' ')+'\n'+card.proof)}</pre></details>
    <details class="diag-body"><summary>程序检查 · ${(item.issues||[]).length} 项提示</summary><pre>${h(clues)}</pre></details></div>
    ${choices('facts','事实核对',[['pass','所有宣称均可由 Brief 支持'],['revise','有错误或缺少支持的宣称']],v.facts)}
    ${choices('tone','品牌语气（1–5 分）',qualityScale.map((s,i)=>[String(i+1),i+1+' · '+s]),v.tone)}
    ${choices('decision','人工结论',[['pass','通过，可进入制作'],['revise','返修后再审']],v.decision)}
    <label class="field"><span>审阅人</span><input id="quality-reviewer" maxlength="100" value="${h(v.by||'')}"></label><label class="field"><span>依据或修改意见</span><textarea id="quality-note" maxlength="1200" rows="2">${h(v.note||'')}</textarea></label></div>`,
    btn('保存审阅','quality-review-save','check','primary',r.id+'|'+c.id),true);
}
async function qualityAction(action,value){
  const p=project(),{suite}=qualityChoice(p),[rid,cid]=(value||'').split('|');
  const r=p.evaluation?.runs.find(r=>r.id===rid),c=suite.cases.find(c=>c.id===(cid||value)),item=r?.items.find(i=>i.caseId===cid);
  switch(action){
    case 'quality-start':return qualityStart(p);
    case 'quality-resume':if(r)return qualityContinue(p,r);return;
    case 'quality-add':return qualityAddDialog(p);
    case 'quality-add-save':return qualityAddCase(p);
    case 'quality-case':if(c)openDialog(c.name,qualityBrief(c),btn('关闭','close'));return;
    case 'quality-budget':if(r)budgetDialog(r);return;
    case 'quality-budget-save':if(r)return changeBudget(p,r,$('#budget-change').value);return;
    case 'quality-review':if(c&&item?.card)qualityReviewDialog(r,c,item);return;
    case 'quality-review-save':{
      if(!c||!item?.card)throw Error('所选记录已变化，请重新打开。');
      const facts=$('#quality-facts').value,tone=Number($('#quality-tone').value),decision=$('#quality-decision').value,by=$('#quality-reviewer').value.trim();
      if(!['pass','revise'].includes(facts)||!['pass','revise'].includes(decision)||!Number.isInteger(tone)||tone<1||tone>5||!by)throw Error('请逐项评分、选定审核结论并填写审阅人。');
      item.review={facts,tone,decision,by,note:$('#quality-note').value.trim(),at:Date.now()};qualitySave(p);closeDialog();render();return;
    }
  }
}
function qualityForm(e){
  const {choice}=qualityChoice(project());
  if(e.target.id==='quality-budget-input'){choice.budget=e.target.value;return;}
  if(e.type!=='change')return;
  if(e.target.id==='quality-suite'){Object.assign(choice,{suite:e.target.value,a:'',b:''});render();}
  if(['quality-a','quality-b'].includes(e.target.id)){
    const k=e.target.id.slice(-1),other=k==='a'?'b':'a',old=choice[k];
    choice[k]=e.target.value;if(choice[other]===choice[k])choice[other]=old;render();
  }
}
