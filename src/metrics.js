const CSV_LABELS={name:['素材名称','素材名','creative_name','creative','name'],direction:['创意方向','创意标签','direction','strategy','creative_direction'],audience:['受众','目标受众','audience'],country:['国家','市场','country','market'],platform:['平台','投放平台','platform'],impressions:['展示量','曝光量','impressions'],clicks:['点击量','点击','clicks'],conversions:['转化量','转化','conversions'],spend:['花费','消耗','spend','cost'],currency:['币种','货币','currency']};
const NUMBER_KEYS=['impressions','clicks','conversions','spend'];
const tagAliases={pain:['痛点解决型','痛点解决','痛点型','痛点','pain','problem solution','problem/solution','pain point'],scene:['场景种草型','场景种草','场景型','场景','scene','scenario','lifestyle'],proof:['社会证明型','社会证明','证明型','证明','proof','social proof','testimonial']};
function readCsv(text){
  text=String(text).replace(/^\uFEFF/,'');
  const rows=[];let values=[],field='',quoted=false,closed=false,line=1,start=1;
  const finish=()=>{values.push(field);if(values.some(v=>v.trim()!==''))rows.push({line:start,values});values=[];field='';closed=false;};
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}
      else{field+=ch;if(ch==='\n')line++;}continue;
    }
    if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;finish();line++;start=line;continue;}
    if(ch===','){values.push(field);field='';closed=false;continue;}
    if(closed){if(!/\s/.test(ch))throw Error('第 '+line+' 行引号后有多余字符。');continue;}
    if(ch==='"'){if(field.trim())throw Error('第 '+line+' 行的双引号位置不正确。');quoted=true;field='';continue;}
    field+=ch;
  }
  if(quoted)throw Error('第 '+start+' 行的引号未闭合。');
  finish();return rows;
}
function parseData(text,defaultCurrency='USD'){
  const lines=readCsv(text);if(lines.length<2)throw Error('CSV 需要表头和至少一条投放记录。');
  if(lines.length>20001)throw Error('单次最多导入 20,000 行。请按投放周期分批。');
  const headers=lines[0].values.map(h=>h.trim().toLowerCase().replace(/[ -]+/g,'_'));
  const idx={};
  for(const [key,aliases] of Object.entries(CSV_LABELS)){
    const matches=headers.map((h,i)=>aliases.includes(h)?i:-1).filter(i=>i>=0);
    if(matches.length>1)throw Error('表头重复：'+aliases[0]);
    if(!matches.length&&!['currency','platform'].includes(key))throw Error('缺少列「'+aliases[0]+'」。');
    idx[key]=matches[0]??-1;
  }
  const currencies=new Set();
  const rows=lines.slice(1).map(({line,values})=>{
    if(values.length!==headers.length)throw Error('第 '+line+' 行列数不同。含逗号的素材名或数字需用双引号包裹。');
    const row={};for(const [k,i] of Object.entries(idx))row[k]=i<0?'':values[i].trim();
    for(const k of ['name','direction','audience','country'])if(!row[k])throw Error('第 '+line+' 行缺少'+CSV_LABELS[k][0]+'。');
    row.direction=Object.keys(tagAliases).find(k=>tagAliases[k].includes(row.direction.toLowerCase()));
    if(!row.direction)throw Error('第 '+line+' 行的创意方向无法识别，请使用痛点型、场景型或证明型。');
    for(const k of NUMBER_KEYS){
      const v=row[k];
      if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(v))throw Error('第 '+line+' 行「'+CSV_LABELS[k][0]+'」应为非负数字。');
      row[k]=Number(v.replace(/,/g,''));
      if(!Number.isFinite(row[k])||row[k]>Number.MAX_SAFE_INTEGER||(k!=='spend'&&!Number.isInteger(row[k])))throw Error('第 '+line+' 行的计数须为有效整数。');
    }
    if(row.clicks>row.impressions||row.conversions>row.clicks)throw Error('第 '+line+' 行不符合点击归因口径：展示量 ≥ 点击量 ≥ 转化量。');
    const currency=(row.currency||defaultCurrency||'USD').toUpperCase();
    if(!/^[A-Z]{3}$/.test(currency))throw Error('第 '+line+' 行的币种请使用三位代码，例如 USD 或 IDR。');
    currencies.add(currency);delete row.currency;
    const country=resolveMarket(row.country);if(country)row.country=MARKETS[country].name;
    row.platform=resolvePlatform(row.platform)||row.platform||'未填写';
    return row;
  });
  if(currencies.size!==1)throw Error('文件包含多种币种。请先统一花费币种，或拆分文件。');
  return {rows,currency:[...currencies][0]};
}
const divide=(a,b)=>b?a/b:null;
function total(rows){const v={impressions:0,clicks:0,conversions:0,spend:0};for(const row of rows)for(const k of NUMBER_KEYS)v[k]+=row[k];return v;}
function metrics(t){return {...t,ctr:divide(t.clicks,t.impressions),cvr:divide(t.conversions,t.clicks),cpc:divide(t.spend,t.clicks),cpa:divide(t.spend,t.conversions)};}
function groups(rows,keyFn){
  const table=new Map();for(const row of rows){const key=keyFn(row);if(!table.has(key))table.set(key,[]);table.get(key).push(row);}return table;
}
const pct=v=>v==null?'—':(v*100).toFixed(2)+'%';
const number=v=>Math.round(v).toLocaleString('en-US');
const moneyFormats=new Map();
function money(v,c='USD'){
  if(v==null)return '—';
  if(!moneyFormats.has(c))moneyFormats.set(c,new Intl.NumberFormat('en-US',{style:'currency',currency:c,maximumFractionDigits:c==='IDR'?0:2,minimumFractionDigits:c==='IDR'?0:2}));
  return moneyFormats.get(c).format(v);
}
const csvEncode=values=>values.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',');
function dataCsv(rows,currency){
  const keys=['name','direction','audience','country','platform',...NUMBER_KEYS,'currency'];
  return '\uFEFF'+[csvEncode(keys.map(k=>CSV_LABELS[k][0])),...rows.map(r=>csvEncode(keys.map(k=>k==='currency'?currency:k==='direction'?DIRECTIONS[r.direction].short:r[k])))].join('\r\n');
}
function report(rows,currency,goal){
  const all=metrics(total(rows)),byDir=Object.keys(DIRECTIONS).map(d=>({d,...metrics(total(rows.filter(r=>r.direction===d)))}));
  const creative=[...groups(rows,r=>JSON.stringify([r.country,r.platform,r.audience,r.direction,r.name])).values()].map(gr=>({...gr[0],...metrics(total(gr))}));
  const observations=[],ranked=[];const traffic=goal==='网站引流',awareness=goal==='品牌认知';
  for(const segment of groups(creative,r=>JSON.stringify([r.country,r.platform,r.audience])).values()){
    const segTotal=total(segment);
    for(const r of segment){
      if(segment.length<2||r.impressions<1000||r.clicks<30)continue;
      const ref=metrics(Object.fromEntries(NUMBER_KEYS.map(k=>[k,segTotal[k]-r[k]])));
      if(ref.clicks<30||ref.impressions<1000)continue;
      const info={name:r.name,d:r.direction,country:r.country,platform:r.platform,audience:r.audience};
      const cmp=traffic?divide(r.ctr,ref.ctr):awareness?divide(divide(ref.spend,ref.impressions),divide(r.spend,r.impressions)):divide(ref.cpa,r.cpa);
      if(cmp!=null&&Number.isFinite(cmp)&&cmp>0)ranked.push({...info,score:cmp,measure:traffic?'CTR':awareness?'CPM':'CPA',own:traffic?pct(r.ctr):money(awareness?r.spend*1000/r.impressions:r.cpa,currency),peer:traffic?pct(ref.ctr):money(awareness?ref.spend*1000/ref.impressions:ref.cpa,currency)});
      else if(!traffic&&!awareness&&!r.conversions&&r.spend>0&&ref.cpa>0)ranked.push({...info,score:0,measure:'CPA',own:'无转化',peer:money(ref.cpa,currency)});
      const gap=(a,b)=>b>0?a/b:0;
      if(ref.cvr>0&&r.ctr>=ref.ctr*1.15&&r.cvr<=ref.cvr*.85)
        observations.push({...info,type:'点击后流失',weight:4+gap(r.ctr,ref.ctr),signal:'CTR '+pct(r.ctr)+'（同组 '+pct(ref.ctr)+'），CVR '+pct(r.cvr)+'（同组 '+pct(ref.cvr)+'）。',
          keep:r.direction==='scene'?'保留场景化开头与首帧。':'保留当前开头与受众。',a:'维持当前卖点出现时间。',b:'把已核实的核心卖点移到第 3–7 秒。',metric:'CVR',guard:'CTR',next:'卖点顺序确认后，另开一轮对照两种 CTA。'});
      if(ref.cpa>0&&((!r.conversions&&r.spend>=2*ref.cpa)||(r.cpa!=null&&r.cpa>=ref.cpa*1.5)))
        observations.push({...info,type:'转化成本异常',weight:3+Math.min(2,gap(r.cpa,ref.cpa)),signal:'花费 '+money(r.spend,currency)+'，转化 '+r.conversions+'，CPA '+money(r.cpa,currency)+'（同组 '+money(ref.cpa,currency)+'）。',keep:'固定受众、开头和投放预算。',a:'沿用当前 CTA。',b:'改为明确说明下一步动作的 CTA。',metric:'CPA',guard:'CVR',next:'先核对落地页与转化事件，再比较成本。'});
      if(ref.spend>0&&r.spend>=2*(ref.spend/(segment.length-1)))
        observations.push({...info,type:'花费集中',weight:2,signal:'该素材花费 '+money(r.spend,currency)+'，同组其他素材平均 '+money(ref.spend/(segment.length-1),currency)+'。',keep:'固定市场、受众和投放时段。',a:'按当前素材配比投放。',b:'给同组素材相等测试预算。',metric:'CPA',guard:'花费',next:'复核预算设定与投放时长后再解释差异。'});
    }
  }
  ranked.sort((a,b)=>b.score-a.score);observations.sort((a,b)=>b.weight-a.weight);
  const count=new Set(observations.map(o=>o.name+'|'+o.country+'|'+o.audience+'|'+o.platform)).size;
  const best=ranked.find(x=>x.score>1.001)||null,worst=[...ranked].reverse().find(x=>x.score<.999)||null;
  const experiments=[],seen=new Set();for(const o of observations){if(seen.has(o.type))continue;experiments.push(o);seen.add(o.type);if(experiments.length===3)break;}
  if(!experiments.length&&creative.length){
    const x=best||creative[0];experiments.push({type:ranked.length?'开头对照':'建立同组对照',name:x.name,d:x.d||x.direction,country:x.country,platform:x.platform,audience:x.audience,
      signal:ranked.length?'当前样本未触发异常阈值。':'可比素材或点击样本不足，先补齐对照组。',keep:'使用同一市场、受众、预算和投放周期。',a:'沿用当前首帧。',b:'首帧提前展示一次产品使用动作。',metric:traffic?'CTR':awareness?'CPM':'CVR',guard:traffic?'CPC':'CPA',next:'达到预设样本量后，再判断是否扩大测试。'});
  }
  return {all,byDir,creative,observations,experiments,best,worst,count};
}
function experimentBrief(x){return [x.type+'｜'+x.name,x.country+' · '+x.platform+' · '+x.audience,'观察：'+x.signal,'保持：'+x.keep,'A 组：'+x.a,'B 组：'+x.b,'主指标 '+x.metric+'；观察指标 '+x.guard+'。'+x.next].join('\n');}
