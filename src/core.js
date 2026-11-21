const DIRECTIONS = {
  pain: {name:'痛点解决型', short:'痛点型', en:'Problem / Solution', icon:'focus', color:'coral', intro:'从一个具体困扰出发，用产品演示回答它。'},
  scene: {name:'场景种草型', short:'场景型', en:'In context', icon:'frame', color:'blue', intro:'让产品进入生活中的一个瞬间，展示使用理由。'},
  proof: {name:'社会证明型', short:'证明型', en:'Social proof', icon:'quote', color:'sage', intro:'把有出处的反馈拍成可以追溯的使用故事。'}
};
const TIMES = ['0–3s','3–7s','7–12s','12–15s'];
const FIELDS = {insight:'核心创意洞察', audience:'目标人群', reason:'推荐理由',title:'标题',copy:'广告正文',cta:'CTA',tags:'话题标签',proof:'证据引用'};
const SAMPLE_BRIEF = {
  name:'Folda 随行杯上市计划', brand:'Folda Go', product:'一款给通勤和日常外带咖啡使用的可折叠随行杯。喝完后可以折起收纳。',
  benefits:'容量 350 mL；折叠后高度 6 cm；杯盖可拆洗。',tone:'轻松、具体，像同事分享日常好物。',audience:'城市通勤者与外带咖啡爱好者',goal:'购买转化',
  markets:['ID','US'], platforms:['TikTok','Meta'], terms:'Folda Go',params:'350 mL；6 cm',banned:'全网第一；永久防漏；100% leakproof',
  evidence:'喝完折起来，就能放进我的小包。',source:'模拟访谈 JKT-03，已获本案例引用许可（教学数据）',assetNotes:'',experiment:'',limit:''
};
const EMPTY_BRIEF = {name:'',brand:'',product:'',benefits:'',tone:'',audience:'',goal:'购买转化',markets:['ID'],platforms:['TikTok'],terms:'',params:'',banned:'',evidence:'',source:'',assetNotes:'',experiment:'',limit:''};
const id = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2);
const splitTerms = value => String(value||'').split(/[;；,，、\n|]+/).map(x=>x.trim()).filter(Boolean);
const escapeHtml = value => String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const keyOf = (market,platform,direction) => [market,platform,direction].join('.');
const baseCard = (b,m,p,d) => ({id:keyOf(m,p,d),market:m,platform:p,direction:d,origin:'model',revision:1,semantic:null,approval:null});
function emptyProject(brief = EMPTY_BRIEF) {
  return {id:id(), brief:clone(brief), round:1, parent:null, demo:false,assets:[],cards:[],data:[],sourceFile:'',currency:'USD',updated:Date.now(),sourceType:'',exports:[]};
}
function validateBrief(b) {
  const required = {name:'任务名称',brand:'品牌或产品名',product:'产品介绍',benefits:'核心卖点',tone:'品牌语气',audience:'目标受众',goal:'营销目标'};
  for (const [k,label] of Object.entries(required)) if(!String(b[k]||'').trim()) throw Error('请填写'+label+'。');
  if (!b.markets?.length||b.markets.some(x=>!Object.hasOwn(MARKETS,x)))throw Error('请从目标市场下拉菜单选择至少一个国家或地区。');
  if (!b.platforms?.length||b.platforms.some(x=>!Object.hasOwn(PROFILE,x)))throw Error('请从投放平台下拉菜单选择至少一家媒体。');
  if(b.limit && (!/^\d+$/.test(String(b.limit)) || Number(b.limit)<1)) throw Error('团队正文上限须为正整数。');
}
function checkedCard(item,b,m,p,d) {
  if(!item || item.direction!==d) throw Error('创意方向与请求不匹配。');
  const out=baseCard(b,m,p,d);
  for(const k of ['insight','audience','reason','title','copy','cta']) {
    if(typeof item[k]!=='string'||!item[k].trim()||item[k].length>2600) throw Error('创意字段缺失或超长：'+FIELDS[k]);
    out[k]=item[k].trim();
  }
  if(!Array.isArray(item.shots)||item.shots.length!==4) throw Error('每条脚本需要四个连续分镜，合计 15 秒。');
  out.shots=item.shots.map((s,i)=>{
    for(const k of ['visual','voice','subtitle']) if(typeof s?.[k]!=='string'||!s[k].trim()||s[k].length>650) throw Error('分镜 '+(i+1)+' 缺少画面、旁白或字幕。');
    return {time:TIMES[i],visual:s.visual.trim(),voice:s.voice.trim(),subtitle:s.subtitle.trim()};
  });
  if(!Array.isArray(item.tags)||!item.tags.length||item.tags.length>8||item.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>100)) throw Error('话题标签格式错误。');
  out.tags=item.tags.map(t=>t.trim());out.proof=String(item.proof||'').slice(0,2000);
  return out;
}
const variantText = c => [c.title,c.copy,c.cta,...c.tags,...c.shots.flatMap(s=>[s.voice,s.subtitle])].join('\n');
function projectPairs(b){return b.markets.flatMap(m=>b.platforms.map(p=>({m,p})));}
function isSampleProduct(b){
  return ['brand','product','benefits','tone','audience','goal','terms','params','banned','evidence','source','assetNotes','experiment'].every(k=>(b[k]||'')===(SAMPLE_BRIEF[k]||''));
}
