function placementNotes(ids){
  if(!ids.length)return '<p class="hint">选择投放媒体后显示对应版位。</p>';
  const linked=ids.filter(id=>PROFILE[id]?.source);
  const specific=linked.map(id=>{
    const p=PROFILE[id];
    return `<p class="hint"><strong>${h(p.label)}</strong> · ${h(p.placement)}。${h(p.guidance)} <a class="plain" href="${h(p.source)}" target="_blank" rel="noopener">版位说明</a></p>`;
  });
  const other=ids.filter(id=>!PROFILE[id]?.source);
  if(other.length)specific.push(`<p class="hint">${h(selectionSummary('platforms',other))}按所选媒体形式制作。正文按 Brief 的团队上限检查，发布前请复核具体版位规格。</p>`);
  return specific.join('');
}
function briefView(p){
  const b=p.briefDraft||p.brief;
  const main=`<form id="brief-form" class="stack">
    ${panel('产品与任务',`<div class="formgrid">
    ${field('任务名称','name',b.name,{req:true,placeholder:'例如：新款随行杯上市',max:100})}
    ${field('品牌或产品名','brand',b.brand,{req:true,placeholder:'保留品牌原拼写',max:160})}
    ${field('产品介绍','product',b.product,{req:true,wide:true,rows:2,placeholder:'是什么产品，解决什么问题？'})}
    ${field('核心卖点','benefits',b.benefits,{req:true,rows:2,placeholder:'填写可证实、能演示的产品优势'})}
    ${field('品牌语气','tone',b.tone,{req:true,rows:2,placeholder:'例如：轻松、具体，避免夸张'})}</div>`)}
    ${panel('市场、平台与目标',`<div class="formgrid">${targetPicker('markets',b.markets)}${targetPicker('platforms',b.platforms)}${field('目标受众','audience',b.audience,{req:true,rows:2})}<label class="field"><span>营销目标<em>*</em></span><select name="goal">${['购买转化','获取线索','网站引流','品牌认知'].map(v=>option(v,v,b.goal)).join('')}</select></label></div>`)}
    ${panel('品牌约束与证明材料',`<div class="formgrid">${field('必须保留的术语','terms',b.terms,{placeholder:'多个术语用分号分隔'})}${field('锁定产品参数','params',b.params,{placeholder:'例如：350 mL；6 cm'})}
    ${field('禁用词','banned',b.banned,{placeholder:'多个词用分号分隔'})}${field('团队正文上限（可选）','limit',b.limit,{placeholder:'正整数，按字符位计',max:5})}
    ${field('可引用的原始反馈、销量或评价','evidence',b.evidence,{rows:2,placeholder:'仅填写可以核验且获准使用的事实'})}${field('证据来源与授权说明','source',b.source,{rows:2,placeholder:'链接、记录编号、日期或授权范围'})}</div>`)}
    ${panel('参考素材与实验要求',`<div class="stack">${field('已有素材摘要或画面说明','assetNotes',b.assetNotes,{rows:2,placeholder:'说明可复用的镜头、表达或历史测试经验'})}
    ${field('本轮实验要求','experiment',b.experiment,{rows:3,placeholder:'从复盘创建下一轮时，会自动带入对照组、实验组和指标'})}
    <div class="buttons">${btn('添加参考素材','asset','image','small')}${btn('导入投放 CSV','import-csv','upload','small')}</div><div class="hint">支持图片、Word、Excel、PDF 和文本。文档原件存入当前工作区，所选参考图与文字摘录用于模型生成。</div>
    ${assetList(p)}</div>`)}
    <div class="buttons">${btn('保存 Brief 并进入创意工坊','save-brief','check','primary')}${btn('下载 Brief JSON','brief-json','download')}</div></form>`;
  const sides=`<aside class="stack sidepanel">${panel('任务配置',`<div class="stack"><div><span class="small-label">计划生产</span><h2 id="plan-count">${b.markets.length*b.platforms.length*3} 条创意</h2></div><p class="hint">每个市场与平台组合生成痛点解决、场景种草和社会证明三个方向。</p><div class="tags">${badge('第 '+p.round+' 轮','green')}${p.demo?badge('示例项目','orange'):''}</div></div>`)}${panel('版位口径',`<div id="brief-placement-notes">${placementNotes(b.platforms)}</div>`)}${p.parent?panel('来源任务',btn('打开上一轮','switch-project','history','small',p.parent)):''}</aside>`;
  return head('营销 Brief',p.briefDraft?'已保存填写进度，确认后应用到创意。':'定义产品事实、投放边界与本轮目标。',btn('导入 Brief','import-brief','upload'))+`<div class="form-layout">${main}${sides}</div>`;
}
function assetList(p){return p.assets.length?`<div class="stack">${p.assets.map(a=>`<div class="asset">${a.image?`<img alt="参考图缩略图" src="${a.image}">`:ico('file')}<span class="break">${h(a.name)}</span><button type="button" class="plain" data-act="remove-asset" data-id="${h(a.id)}">移除</button></div>`).join('')}</div>`:'';}
function currentPair(p){
  if(!p.brief.markets.includes(filters.market))filters.market=p.brief.markets[0];
  if(!p.brief.platforms.includes(filters.platform))filters.platform=p.brief.platforms[0];
  return {m:filters.market,pf:filters.platform};
}
function pairFilters(p){const {m,pf}=currentPair(p);return `<div class="filterbar"><span class="small-label">市场</span><select aria-label="创意市场" data-filter="market">${p.brief.markets.map(v=>option(v,MARKETS[v].name+' · '+MARKETS[v].lang,m)).join('')}</select><span class="small-label">平台</span><select aria-label="创意平台" data-filter="platform">${p.brief.platforms.map(v=>option(v,platformLabel(v),pf)).join('')}</select></div>`;}
function creativeView(p){
  const b=p.brief,{m,pf}=currentPair(p),combos=b.markets.length*b.platforms.length*3;
  const list=Object.entries(DIRECTIONS).map(([k,d])=>{const c=p.cards.find(c=>c.id===keyOf(m,pf,k));return `<article class="variant"><div class="vid-head ${d.color}"><div><h3>${d.name}</h3><span class="en">${d.en}</span></div>${ico(d.icon)}</div><div class="variant-body">${c?`<div class="tags">${riskBadge(c,b)}${badge(c.origin==='sample'?'预置示例':'模型生成')}</div><h4 lang="${MARKETS[m].code}">${h(c.title)}</h4><p lang="${MARKETS[m].code}">${h(c.copy)}</p><p class="hint">${h(c.insight)}</p><div class="buttons">${btn('脚本与分镜','detail','frame','small',c.id)}${btn('编辑','edit','edit','small',c.id)}</div>`:`<h4>待生成</h4><p>${d.intro}</p><div class="buttons">${btn('生成此方向','generate-one','spark','small',keyOf(m,pf,k))}</div>`}</div></article>`;}).join('');
  return head('创意工坊',b.name||'请先完善营销 Brief。',btn('生成全部创意','generate','spark','primary'))+`<div class="rowline"><div class="tags">${badge(p.cards.length+' / '+combos+' 条已生成','green')}${badge('15 秒短视频')}</div></div>${pairFilters(p)}<div class="variant-list">${list}</div><div class="sectionline"><h2>本组制作说明</h2></div><div class="panel"><div class="formgrid"><div><h3>${h(MARKETS[m]?.name||'目标市场')} · ${h(pf||'投放平台')}</h3><p class="hint">${h(PROFILE[pf]?.placement||'选择平台后显示版位')}。标题、旁白、字幕与 CTA 使用目标市场语言，分镜说明供中文制作团队使用。</p></div><div><h3>审核流程</h3><p class="hint">可编辑每一条创意。修改后会重算程序规则，并清除该条旧版的模型复核和人工确认。</p></div></div></div>`;
}
function auditView(p){
  const st=filters.audit,counts={};for(const c of p.cards){const s=reviewState(c,p.brief);counts[s]=(counts[s]||0)+1;}
  const rows=p.cards.filter(c=>!st||reviewState(c,p.brief)===st);
  const table=rows.length?`<div class="tablewrap"><table class="table"><thead><tr><th>创意 / 方向</th><th>市场 / 平台</th><th>检查结果</th><th>审核状态</th><th>操作</th></tr></thead><tbody>${rows.map(c=>{
    const list=allIssues(c,p.brief),levels=['高','中','低'].map(l=>[l,list.filter(x=>x.level===l).length]).filter(x=>x[1]);
    return `<tr><td class="name"><strong>${h(c.title)}</strong><small>${DIRECTIONS[c.direction].name}</small></td><td>${MARKETS[c.market].name}<small>${h(c.platform)}</small></td><td>${levels.length?levels.map(([l,n])=>badge(l+' '+n,{高:'high',中:'medium',低:'blue'}[l])).join(' '):badge(semanticReady(c)?'未发现问题':'规则通过','good')}</td><td>${riskBadge(c,p.brief)}</td><td>${btn('审阅','review','shield','small',c.id)}</td></tr>`;}).join('')}</tbody></table></div>`:empty(p.cards.length?'该状态下暂无创意':'尚无待审创意','生成创意后，这里会显示规则检查和模型复核结果。',btn('前往创意工坊','nav','spark','small','creative'));
  return head('质检与审核',p.brief.name||'本项目',btn('运行模型复核','audit-all','spark')+btn('导出已审核创意','export','download','primary'))+`<div class="panel"><div class="panel-title"><div><h2>审核队列</h2><p class="hint">高风险需先修正。语义复核完成后，由编辑核对当前版本并确认导出。</p></div>${badge(p.cards.length+' 条创意')}</div><div class="filterbar"><span class="small-label">审核状态</span><select aria-label="审核状态" data-filter="audit">${option('','全部（'+p.cards.length+'）',st)}${['高风险','待语义复核','待人工审核','已审核'].map(s=>option(s,s+'（'+(counts[s]||0)+'）',st)).join('')}</select></div>${table}</div><div class="sectionline"><h2>质检口径</h2></div><div class="cols2">${panel('程序规则',`<p class="hint">逐字段核对禁用词、必留术语、数字、单位和证据来源。</p>${placementNotes(p.brief.platforms)}`)}${panel('模型与人工复核',`<p class="hint">模型结合原始 Brief、素材与目标语言检查语气、事实、文化语境和脚本。审阅人可查看问题原文、字段位置、风险等级及建议，再作确认。</p>`)}</div>`;
}
function reportFilters(p){return `<div class="filterbar"><span class="small-label">数据范围</span><select aria-label="复盘国家" data-filter="country">${option('','所有国家',filters.country)}${[...new Set(p.data.map(r=>r.country))].map(x=>option(x,x,filters.country)).join('')}</select><select aria-label="复盘平台" data-filter="adPlatform">${option('','所有平台',filters.adPlatform)}${[...new Set(p.data.map(r=>r.platform))].map(x=>option(x,x,filters.adPlatform)).join('')}</select></div>`;}
function activeReport(p){return report(p.data.filter(r=>(!filters.country||r.country===filters.country)&&(!filters.adPlatform||r.platform===filters.adPlatform)),p.currency,p.brief.goal);}
function reportView(p){
  const top=head('投放复盘',p.sourceFile?'当前数据 · '+p.sourceFile:'导入投放数据，生成下一轮素材实验。',btn('示例 CSV','sample-csv','download')+btn('导入 CSV','import-csv','upload','primary'));
  if(!p.data.length)return top+empty('还没有投放数据','下载示例 CSV 后可修改和导入，或直接载入一份模拟数据体验复盘。',btn('载入模拟数据','load-sample','chart'));
  const r=activeReport(p),cc=p.currency;
  const rank=(label,x)=>`<div class="slot"><span class="small-label">${label}</span><h3 class="break">${h(x?.name||'暂无可比较素材')}</h3><p class="hint">${x?h(x.country+' · '+x.platform+' · '+x.audience+'，'+x.measure+' '+x.own+'，同组 '+x.peer+'。'):'需要同市场、受众和平台的不同素材，且样本达到比较门槛。'}</p></div>`;
  const exp=r.experiments.map((x,i)=>`<article class="experiment-card"><div class="rowline"><h3>${h(x.type)}</h3>${badge(DIRECTIONS[x.d].short,'green')}</div><p class="hint">${h(x.name+' · '+x.country+' · '+x.platform+' · '+x.audience)}</p><p>${h(x.signal)}</p><p>${h(x.keep)}</p><div class="versus"><b>A</b><span>${h(x.a)}</span><b>B</b><span>${h(x.b)}</span></div><p class="hint">主指标 ${h(x.metric)} · 观察指标 ${h(x.guard)}。${h(x.next)}</p>${btn('创建下一轮 Brief','next-brief','beaker','small',String(i))}</article>`).join('');
  const groupTable=`<div class="tablewrap"><table class="table"><thead><tr><th>方向</th><th>CTR</th><th>CVR</th><th>CPC</th><th>CPA</th></tr></thead><tbody>${r.byDir.map(x=>`<tr><td>${DIRECTIONS[x.d].short}</td>${[pct(x.ctr),pct(x.cvr),money(x.cpc,cc),money(x.cpa,cc)].map(n=>`<td class="num">${n}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const materialTable=`<div class="tablewrap"><table class="table"><thead><tr>${['素材名称 / 受众','市场 / 平台','方向','展示','点击','转化','花费','CTR','CVR','CPC','CPA'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${r.creative.slice(0,200).map(x=>`<tr><td class="name">${h(x.name)}<small>${h(x.audience)}</small></td><td>${h(x.country)}<small>${h(x.platform)}</small></td><td>${DIRECTIONS[x.direction].short}</td>${[number(x.impressions),number(x.clicks),number(x.conversions),money(x.spend,cc),pct(x.ctr),pct(x.cvr),money(x.cpc,cc),money(x.cpa,cc)].map(v=>`<td class="num">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return top+reportFilters(p)+`<div class="sectionline"><h2>投放指标</h2>${badge((p.sourceType||'导入数据')+' · '+cc,p.sourceType==='模拟数据'?'orange':'')}</div>${statBlock(r,cc)}<div class="sectionline"><h2>素材诊断</h2><span class="hint">${r.count} 条素材触发诊断</span></div><div class="cols2 reportcols"><div class="stack">${panel('可比素材表现',`<div class="stack">${rank('相对较好',r.best)}${rank('相对较弱',r.worst)}</div>`)}${panel('创意标签汇总',groupTable+`<p class="hint">各方向按分子、分母分别求和后计算；市场组合会影响汇总表现。</p>`)}</div>${panel('下一轮素材实验',`<div class="stack">${exp||empty('暂无实验','调整筛选范围或补充数据。')}</div>`)}</div><div class="sectionline"><h2>素材明细</h2><span class="hint">${r.creative.length} 条素材${r.creative.length>200?' · 表格展示前 200 条':''}</span></div><div class="panel">${materialTable}<details><summary>计算与诊断口径</summary><p class="hint">CTR = 点击 / 展示，CVR = 转化 / 点击，CPC = 花费 / 点击，CPA = 花费 / 转化。分母为零显示 —。排名以同国家、平台和受众的其他素材为对照。当前素材及对照分别至少有 1,000 次展示和 30 次点击。购买、线索以 CPA，引流以 CTR，认知以 CPM 比较相对表现。高点击低转化阈值为 CTR ≥ 同组的 1.15 倍且 CVR ≤ 0.85 倍；CPA ≥ 1.5 倍、或零转化且花费 ≥ 同组 CPA 的两倍，提示成本异常。花费 ≥ 同组其他素材均值两倍，提示预算集中。结果用于提出实验假设。</p></details></div>`;
}

