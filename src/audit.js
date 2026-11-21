const FIELD_PATHS=['insight','audience','reason','title','copy','cta','tags','proof',...TIMES.flatMap((_,i)=>['visual','voice','subtitle'].map(k=>'shots.'+i+'.'+k))];
function fieldName(path){
  if(FIELDS[path])return FIELDS[path];const [,i,k]=String(path).split('.');
  return TIMES[i]?'分镜 '+(Number(i)+1)+' · '+TIMES[i]+' · '+({visual:'画面',voice:'旁白',subtitle:'字幕'}[k]||k):'整条创意';
}
function cardFields(c){
  const base=['title','copy','cta','tags','proof','insight','audience','reason'].map(k=>[k,Array.isArray(c[k])?c[k].join(' '):c[k]||'']);
  return [...base,...c.shots.flatMap((s,i)=>['visual','voice','subtitle'].map(k=>['shots.'+i+'.'+k,s[k]]))];
}
const countText=s=>Array.from(s.trim()).length;
const weighted=s=>Array.from(s.trim()).reduce((n,ch)=>n+(/[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff01-\uff60]/u.test(ch)?2:1),0);
const foldText=s=>String(s).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
function audit(c,b){
  const issues=[],push=(level,path,quote,reason,fix,topic='format')=>issues.push({level,path,quote,reason,fix,topic,source:'程序规则'});
  const profile=PROFILE[c.platform],count=profile.weighted?weighted:countText,len=count(c.copy),titleSize=count(c.title);
  if(profile.hard&&len>profile.hard)push('高','copy',len+' / '+profile.hard,profile.label+' 的所选版位超出正文上限。','将正文压缩到 '+profile.hard+' 个字符位以内。');
  else if(profile.body&&len>profile.body)push('低','copy',String(len)+' 字符位','正文超过当前版位的可读性建议值。','把卖点放到开头，或将正文压缩到 '+profile.body+' 字符位。');
  if(b.limit&&Number(b.limit)<len)push('高','copy',len+' / '+b.limit,'超过本次 Brief 指定的团队正文上限。','缩短正文至 '+b.limit+' 字符位以内。');
  if(profile.hardTitle&&titleSize>profile.hardTitle)push('高','title',titleSize+' / '+profile.hardTitle,profile.label+' 的所选版位超出标题上限。','将单个标题缩短到 '+profile.hardTitle+' 个字符位以内。');
  if(profile.title&&titleSize>profile.title)push('低','title',c.title,'标题超过团队为 '+profile.placement+' 设置的 '+profile.title+' 字符可读性阈值。','保留一个核心利益点，并用版位预览确认截断位置。');
  const publicText=variantText(c),facts=[b.product,b.benefits,b.brand,b.params,b.evidence,b.terms].join(' ');
  for(const term of new Set([b.brand,...splitTerms(b.terms)].filter(Boolean))){
    if(!publicText.includes(term))push('高','copy',term,'投放内容中缺少必须原样保留的品牌术语。','在标题、正文、旁白或字幕中原样加入「'+term+'」。','brand');
  }
  if(c.direction==='proof'){
    if(!b.evidence.trim()||!b.source.trim())push('高','proof','缺少证据','社会证明方向缺少可引用的反馈内容或出处。','在 Brief 补充已获引用许可的原文和可核查的来源，再生成证明型素材。','fact');
    else if(!c.proof.includes(b.source.trim()))push('高','proof',c.proof||'空白','证据引用与 Brief 登记的来源不一致。','引用原始来源标识「'+b.source+'」，并核对原意。','fact');
  }
  const banned=splitTerms(b.banned);
  const categorical=/\b(?:guaranteed|guarantees|number one|best in the world|pasti berhasil|nomor satu|tanpa risiko|dijamin)\b|全球第一|百分之百|绝对有效|包治|永久防漏|100\s*%\s*(?:effective|aman|leakproof)/iu;
  const efficacy=/\b(?:cures?|heals?|menyembuhkan|clinically proven|terbukti klinis)\b|治愈|临床认证|疗效/iu;
  const culture=/\b(?:ramadan|halal|haram|islam|muslim|christmas|sacred|all americans|semua orang indonesia)\b|清真|斋月|宗教仪式|美国人都|印尼人都/iu;
  const social=/\b(?:rated|five.star|best.seller|customers love|users agree|terlaris|bintang lima|ribuan pengguna)\b|五星好评|万人推荐|销量第一/iu;
  const allowedNumbers=new Set((facts.match(/\d+(?:[.,]\d+)?/g)||[]).map(x=>Number(x.replace(',','.'))));
  const unitRx=/(\d+(?:[.,]\d+)?)\s*(m[lL]|[cCmM][mM]|kg|oz|hours?|jam|%|毫升|厘米|毫米|小时|克)(?![a-z])/gi;
  const normUnit=u=>({'毫升':'ml','厘米':'cm','毫米':'mm','小时':'h','hour':'h','hours':'h','jam':'h','克':'g'}[u.toLowerCase()]||u.toLowerCase());
  const allowedSpecs=new Set([...facts.matchAll(unitRx)].map(m=>Number(m[1].replace(',','.'))+' '+normUnit(m[2])));
  for(const [path,val] of cardFields(c)){
    if(!val||['proof','insight','audience','reason'].includes(path))continue;
    for(const word of banned)if(foldText(val).includes(foldText(word)))push('高',path,word,'出现 Brief 明确禁用的表述。','删除该表述，改用 Brief 中可演示的事实。','brand');
    for(const [rx,msg] of [[categorical,'存在绝对化承诺。'],[efficacy,'存在需要佐证的功效宣称。'],[social,'使用了需要出处的评价或销量表述。']]){
      const hit=val.match(rx);if(hit&&(!foldText(facts).includes(foldText(hit[0]))||rx===categorical))push('高',path,hit[0],msg,'使用可核对的具体事实；引用评价时保留原文和出处。','fact');
    }
    const hit=val.match(culture);if(hit)push('中',path,hit[0],'涉及文化身份、宗教或群体概括，需要按具体语境复核。','请当地审校者核对场景、措辞与相关授权，记录复核结论。');
    for(const m of val.matchAll(unitRx)){
      if(!allowedSpecs.has(Number(m[1].replace(',','.'))+' '+normUnit(m[2])))push('高',path,m[0],'该数值或单位组合无法在原始 Brief 中核对。','按 Brief 核对产品参数「'+(b.params||b.benefits)+'」。','fact');
    }
    if(!path.endsWith('.visual')){
      const nums=val.match(/\d+(?:[.,]\d+)?/g)||[];
      for(const n of new Set(nums))if(!allowedNumbers.has(Number(n.replace(',','.'))))push('中',path,n,'出现 Brief 未给出的数字。','补充出处，或删除未经佐证的价格、数量或百分比。','fact');
      if(!['Hans','Hant','Hani','Jpan','Kore','Hanb'].includes(MARKETS[c.market].script)&&/\p{Script=Han}/u.test(splitTerms(b.terms).concat(b.brand).reduce((v,t)=>v.split(t).join(''),val)))push('中',path,val,'受众文案中出现与目标语言常用书写系统不一致的汉字。','按'+MARKETS[c.market].lang+'核对原文，保留必要的品牌术语。');
    }
  }
  const uniq=new Set();return issues.filter(x=>{const k=[x.level,x.path,x.reason,x.quote].join('|');if(uniq.has(k))return false;uniq.add(k);return true;});
}
function checkedSemantic(raw){
  if(!raw||!Array.isArray(raw.issues)||raw.issues.length>60)throw Error('语义审查结果格式错误，请重试。');
  return raw.issues.map(i=>{
    if(!['高','中','低'].includes(i.level)||!FIELD_PATHS.includes(i.path)||!['quote','reason','fix'].every(k=>typeof i[k]==='string'&&i[k].trim()))throw Error('语义审查缺少有效的问题位置、等级或修改建议。');
    return {level:i.level,path:i.path,quote:i.quote,reason:i.reason,fix:i.fix,source:'模型复核'};
  });
}
const semanticReady=c=>!!c.semantic&&c.semantic.revision===c.revision;
const allIssues=(c,b)=>[...audit(c,b),...(semanticReady(c)?c.semantic.issues:[])];
function reviewState(c,b){
  const issues=allIssues(c,b);
  if(issues.some(x=>x.level==='高'))return '高风险';
  if(!semanticReady(c))return '待语义复核';
  if(c.approval?.revision===c.revision)return '已审核';
  return '待人工审核';
}
