// Shared by the editor, CSV importer, desktop service and hosted API.
const PRIORITY_MARKETS = ['CN','US','ID','GB','JP','KR','SG','MY','TH','VN','PH','IN','DE','FR','CA','AU','BR','MX','AE','SA'];
const MARKET_ALIASES = {
  CN:['中国大陆','中国内地','大陆','内地','Mainland China','PRC'],US:['美国','美利坚合众国','美國','United States of America','America','U.S.'],
  ID:['印尼'],GB:['UK','U.K.','英国','英國','Great Britain'],HK:['香港','中国香港','Hong Kong SAR'],MO:['澳门','澳門','中国澳门','Macau'],TW:['台湾','臺灣','台灣','中国台湾'],
  JP:['日本国','Japan'],KR:['南韩','南韓','Republic of Korea'],KP:['朝鲜','DPRK'],SG:['狮城','新加坡共和国'],MY:['大马','馬來西亞'],AE:['阿联酋','UAE'],
  VN:['Viet Nam'],TH:['泰國'],SA:['沙特','沙烏地阿拉伯'],NZ:['紐西蘭'],AU:['澳洲'],
  TR:['土耳其','Turkey','Türkiye'],CZ:['捷克共和国','Czech Republic'],CI:['象牙海岸','Ivory Coast'],MM:['缅甸','Burma'],RU:['俄国','Russian Federation'],
  PS:['巴勒斯坦','Palestine'],CD:['刚果金','DR Congo'],CG:['刚果布'],ZA:['南非共和国']
};
const zhRegion = new Intl.DisplayNames(['zh-CN'],{type:'region'});
const enRegion = new Intl.DisplayNames(['en'],{type:'region'});
const zhLanguage = new Intl.DisplayNames(['zh-CN'],{type:'language'});
const collateMarkets = new Intl.Collator('zh-CN-u-co-pinyin',{sensitivity:'base',numeric:true});
function searchKey(value) {
  return String(value??'').normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,'');
}
const MARKETS = Object.create(null), marketIndex = new Map();
const legacyLanguageLabels={ID:'Bahasa Indonesia',US:'English (US)'};
for(const [id,alpha3,alias,lat,lon] of REGION_ROWS){
  const locale=new Intl.Locale('und-'+id).maximize();
  const langId=locale.language==='zh'?'zh-'+locale.script:locale.language;
  const lang=legacyLanguageLabels[id]||zhLanguage.of(langId);
  const code=langId+'-'+id, name=zhRegion.of(id), english=enRegion.of(id);
  const names=[id,alpha3,name,english,alias,code,...(MARKET_ALIASES[id]||[])];
  for(const n of names)marketIndex.set(searchKey(n),id);
  MARKETS[id]={id,alpha3,name,english,lang,code,script:locale.script,point:lat===undefined?null:[lat,lon],keys:names.map(searchKey)};
}
const MARKET_GROUPS = [
  {label:'常用市场',ids:PRIORITY_MARKETS},
  {label:'其他国家和地区',ids:Object.keys(MARKETS).filter(id=>!PRIORITY_MARKETS.includes(id)).sort((a,b)=>collateMarkets.compare(MARKETS[a].name,MARKETS[b].name))}
];
function resolveMarket(value) {
  const found=marketIndex.get(searchKey(value));
  if(found)return found;
  const input=String(value||'').trim().replace(/_/g,'-');
  if(!/^[A-Za-z]{2,3}-(?:[A-Za-z]{4}-)?[A-Za-z]{2}$/.test(input))return null;
  const region=input.slice(-2).toUpperCase();
  return Object.hasOwn(MARKETS,region)?region:null;
}

// A medium is a creative destination. Placement and production notes describe the intended deliverable.
const MEDIA_GROUPS = [
  {scope:'海外',label:'海外 · 社交与影音',items:[
    ['TikTok','预约信息流 · Spark Ads Pull','抖音国际版|Tik Tok'],
    ['Meta','Facebook Feed 视频','Facebook|FB|脸书|臉書|Meta Ads','Meta（Facebook）'],
    ['Instagram','Reels 短视频','IG|Instagram Reels|照片墙'],
    ['YouTube','Shorts 竖屏短视频','YouTube Shorts|油管|YT'],
    ['LinkedIn','专业信息流视频','领英|領英'],['X','时间线推广内容','Twitter|推特','X（Twitter）'],
    ['Snapchat','竖屏短视频','Snap'],['Pinterest','灵感图钉与短视频','拼趣'],
    ['Reddit','社区信息流','红迪'],['LINE','信息流与品牌账号内容','LINE Ads'],
    ['KakaoTalk','品牌频道内容','Kakao|卡考'],['WhatsApp','品牌消息与对话引导','Whats App'],
    ['Spotify','音频广告创意','声田|Spotify Ads']
  ]},
  {scope:'海外',label:'海外 · 搜索与电商',items:[
    ['Google Ads','响应式搜索广告 · 单个标题与描述候选','Google|谷歌|谷歌广告|Google Search'],
    ['Microsoft Advertising','搜索广告文案候选','Bing|Microsoft Ads|微软广告|必应'],
    ['Amazon Ads','商品推广与品牌内容','Amazon|亚马逊|亚马逊广告'],
    ['Shopee','站内商品与短视频内容','虾皮|蝦皮'],['Lazada','站内商品与品牌内容','来赞达']
  ]},
  {scope:'海外',label:'海外 · 新闻与出版',items:[
    ['BBC News','商业合作内容提案','BBC|英国广播公司|BBC新闻'],
    ['CNN','商业合作内容提案','美国有线电视新闻网|CNN International'],
    ['The New York Times','商业合作内容提案','NYT|纽约时报'],['The Guardian','商业合作内容提案','卫报|Guardian'],
    ['Reuters','商业合作内容提案','路透社|路透'],['Nikkei','商业合作内容提案','日经|日本经济新闻'],
    ['Kompas','商业合作内容提案','Kompas.com|罗盘报']
  ]},
  {scope:'国内',label:'国内 · 社交与影音',items:[
    ['抖音','竖屏信息流短视频','Douyin|巨量引擎抖音'],['小红书','信息流笔记与短视频','Xiaohongshu|REDnote|小红书聚光|XHS'],
    ['微信视频号','视频号内容流','视频号|WeChat Channels|Weixin Channels'],['微信朋友圈','朋友圈信息流','朋友圈|WeChat Moments'],
    ['微信公众号','公众号品牌内容','公众号|WeChat Official Accounts'],['快手','竖屏短视频','Kuaishou|磁力引擎'],
    ['哔哩哔哩','视频内容与信息流','B站|Bilibili|哔站'],['微博','社交信息流','Weibo|新浪微博'],
    ['知乎','知识内容与信息流','Zhihu'],['腾讯视频','视频内容推广','Tencent Video'],['爱奇艺','视频内容推广','iQIYI'],
    ['优酷','视频内容推广','Youku'],['QQ','社交信息流','腾讯QQ|QQ广告']
  ]},
  {scope:'国内',label:'国内 · 搜索与电商',items:[
    ['百度','搜索广告文案候选','Baidu|百度营销|百度搜索'],['淘宝','站内商品与短视频内容','Taobao|淘宝直播'],
    ['天猫','站内品牌与商品内容','Tmall'],['京东','站内商品与品牌内容','JD|JD.com|Jingdong|京准通'],
    ['拼多多','站内商品与品牌内容','Pinduoduo|PDD']
  ]},
  {scope:'国内',label:'国内 · 新闻与资讯',items:[
    ['今日头条','资讯推荐流','Toutiao|头条'],['腾讯新闻','资讯信息流','Tencent News'],['网易新闻','资讯信息流','NetEase News'],
    ['澎湃新闻','商业合作内容提案','The Paper'],['人民网','商业合作内容提案','People.cn|People’s Daily Online'],
    ['新华网','商业合作内容提案','XinhuaNet|新华网客户端'],['央视网','商业合作内容提案','CCTV.com|央视网客户端']
  ]}
];
const PROFILE=Object.create(null),platformIndex=new Map();
for(const group of MEDIA_GROUPS){
  for(const [id,placement,aliases,label=id] of group.items){
    const names=[id,label,...aliases.split('|')];
    for(const name of names)platformIndex.set(searchKey(name),id);
    let guidance='适配该媒体的受众与内容习惯。按具体版位复核尺寸和字数。';
    if(placement.includes('商业合作'))guidance='采用清楚标识的品牌合作提案。仅使用 Brief 允许引用的内容，勿暗示媒体报道、编辑背书或已获刊发。';
    if(placement.includes('搜索广告'))guidance='标题和正文作为搜索广告候选，突出搜索意图与行动。15 秒分镜用于配套视频素材。';
    if(id==='Spotify')guidance='优先保证旁白独立可懂，视频分镜供配套视觉素材使用。';
    PROFILE[id]={id,label,placement,guidance,group:group.label,scope:group.scope,keys:names.map(searchKey)};
  }
}
Object.assign(PROFILE.TikTok,{weighted:true,body:100,hard:150,source:'https://ads.tiktok.com/resources/help/article/tiktok-reservation-in-feed-ads-reach-frequency',guidance:'原帖正文上限 150 半角字符位，建议 100。'});
Object.assign(PROFILE.Meta,{body:125,title:27,source:'https://www.facebook.com/business/ads-guide/video/facebook-feed',guidance:'本工作台的可读性建议为正文 125、标题 27 字符。'});
Object.assign(PROFILE['Google Ads'],{weighted:true,hard:90,hardTitle:30,source:'https://support.google.com/google-ads/answer/7684791',guidance:'单个标题上限 30、单条描述上限 90，全角字符按两位计。每条产出为一组候选文案，15 秒分镜用作配套视频。'});
const PLATFORMS=Object.keys(PROFILE);
const resolvePlatform=value=>platformIndex.get(searchKey(value))||null;
const platformLabel=id=>PROFILE[id]?.label||id;

