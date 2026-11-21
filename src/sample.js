const sampleStories={
  ID:{
    pain:{title:'Tas kecil, gelas ikut', hook:['Gelas kosong makan tempat?','Tas penuh setelah ngopi?'],copy:['Gelas kosong makan tempat? Lipat Folda Go setelah ngopi.','Isi tas sudah penuh? Folda Go bisa dilipat setelah kopi habis. Lihat ukurannya sebelum berangkat.'],voices:['Gelas kosong masih makan tempat?','Ini Folda Go. Isinya 350 mL.','Selesai ngopi, lipat jadi 6 cm.','Cek ukurannya, yuk.'],subs:['Gelas kosong, tas penuh?','Folda Go · 350 mL','Dilipat jadi 6 cm','Cek ukurannya'],tags:['#BekalNgantor','#TasKerja']},
    scene:{title:'Kopi sebelum berangkat',hook:['Ikut ngopi sebelum naik kereta?','Satu kopi sebelum ke kantor.'],copy:['Dari kedai ke peron, Folda Go ikut ritme pagimu.','Mulai di kedai, lanjut ke kantor. Lihat bagaimana Folda Go masuk ke tas setelah kopimu habis.'],voices:['Pagi ini, mampir ngopi dulu.','Bawa Folda Go ke kedai langganan.','Kopinya habis? Lipat, lalu simpan.','Lihat cara pakainya.'],subs:['Mampir ngopi dulu','Folda Go di kedai','Habis, lipat, simpan','Lihat caranya'],tags:['#KopiPagi','#RutinitasPagi']},
    proof:{title:'Dicoba di tas kecil',hook:['Apa kata pemakai Folda Go?','Sesudah ngopi, masuk tas?'],copy:['Seorang pengguna bercerita soal tas kecilnya. Lihat Folda Go dilipat setelah ngopi.','Dalam wawancara, seorang pengguna bilang Folda Go muat di tas kecilnya setelah dilipat. Lihat demonya.'],voices:['Seorang pengguna bercerita begini.','Setelah ngopi, gelasnya dilipat.','Lalu muat di tas kecil miliknya.','Lihat contoh lipatannya.'],subs:['Cerita seorang pengguna','Folda Go dilipat','Muat di tas kecilnya','Lihat demonya'],tags:['#CeritaPengguna','#GelasLipat']}
  },
  US:{
    pain:{title:'Room in your work bag',hook:['Empty cup, full tote?','What takes up room after coffee?'],copy:['Empty cup, full tote? Fold Folda Go down after coffee.','An empty cup can take up half a pocket. See how Folda Go folds to 6 cm after your coffee.'],voices:['Empty cup, full tote?','Meet Folda Go, the 350 mL cup.','After coffee, fold it down to 6 cm.','Check the fit for your bag.'],subs:['Empty cup, full tote?','Folda Go · 350 mL','Folds to 6 cm','Check the fit'],tags:['#WorkBag','#CoffeeBreak']},
    scene:{title:'From café to commute',hook:['Coffee stop before the train?','A coffee stop on the way in.'],copy:['Coffee stop, train ride, desk. Take Folda Go along for the morning.','Follow Folda Go from the coffee counter to the commute. Once the cup is empty, fold it into your tote.'],voices:['First stop, the corner café.','Coffee goes in my Folda Go.','Last sip, then fold it for the train.','See it in a morning routine.'],subs:['First stop: coffee','Folda Go at the counter','Last sip. Fold. Go.','See the routine'],tags:['#MorningCommute','#CafeRun']},
    proof:{title:'A small-bag field note',hook:['What did one tester notice?','One tester brought a small bag.'],copy:['One tester said Folda Go fit in their small bag after coffee. Watch the fold.','One interviewee singled out the fit in their small bag after folding Folda Go. Here is that fold in close-up.'],voices:['One tester told us about their bag.','After coffee, they folded the cup.','It fit in their own small bag.','Watch Folda Go fold.'],subs:['One tester’s experience','After coffee: fold','Fit in their small bag','Watch the fold'],tags:['#FieldNotes','#EverydayCarry']}
  }
};
const sampleVisuals={
  pain:['俯拍空杯占住包内侧袋，手试着收起耳机。','同一机位给杯身与容量标识一个近景。','连续实拍向下折叠，用刻度尺对照收起高度。','将杯子放回侧袋，定格产品名与按钮。'],
  scene:['用店门推开或接过咖啡的动作开场。','跟拍从柜台接过杯子，保留自然环境声。','切到喝完后的通勤包，连续展示折叠和收纳。','在车站入口收束，画面留出 CTA 的位置。'],
  proof:['字幕注明单次模拟访谈来源，拍摄桌上的杯子和小包。','从侧面实拍喝完后的杯子与折叠动作。','固定镜头将杯子收入受访者使用的同款尺寸小包。','以实拍产品和访谈编号收尾，保留出处。']
};
const sampleInsights={
  pain:'空杯在通勤包里仍占空间。开头先拍出这个困扰，再用同机位的折叠前后对照解释产品。',
  scene:'把咖啡店、通勤路和工作日串成一次晨间使用，让观众看到杯子在什么时候值得带出门。',
  proof:'只复述一位受访者对小包收纳的反馈，再实拍同一个动作，把个人体验和普遍承诺区分开。'
};
function sampleTriplet(b,m,p){
  const tiktok=p==='TikTok', ix=tiktok?0:1;
  return Object.keys(DIRECTIONS).map(d=>{
    const story=sampleStories[m][d], v=sampleVisuals[d];
    const c=checkedCard({direction:d,title:story.title,copy:story.copy[ix],cta:m==='ID'?(tiktok?'Lihat selengkapnya':'Belanja sekarang'):(tiktok?'Learn more':'Shop now'),
      tags:story.tags,insight:sampleInsights[d]+(tiktok?'用手持近景快速切入。':'首帧同时交代产品与使用理由，兼顾静音浏览。'),
      audience:m==='ID'?'在印尼城市通勤、习惯外带咖啡的人群':'美国城市中携带小包通勤的咖啡消费者',
      reason:{pain:'容易遇到收纳空间不足，可用同一只包验证差异。',scene:'日常购买咖啡，能直接代入从柜台到通勤路上的动作。',proof:'决策前需要看到真实使用体验，可以核查访谈和演示对应关系。'}[d],
      proof:d==='proof'?b.source:'',
      shots:v.map((visual,i)=>({visual:i===0&&!tiktok?'首帧静音可读。'+visual:visual,voice:i===0?story.hook[ix]:story.voices[i],subtitle:i===0&&!tiktok?story.hook[ix]:story.subs[i]}))
    },b,m,p,d);
    c.origin='sample';c.semantic={engine:'预置案例复核',revision:1,issues:[],at:'案例编制时'};
    return c;
  });
}
function makeSample(){
  const p=emptyProject(SAMPLE_BRIEF);p.demo=true;p.cards=projectPairs(p.brief).flatMap(({m,p:platform})=>sampleTriplet(p.brief,m,platform));
  const data=[
    ['ID','TikTok',[[26000,520,29,168],[30000,1050,19,231],[18000,324,22,143]]],
    ['ID','Meta',[[18000,330,20,138],[22000,625,12,175],[16000,272,17,120]]],
    ['US','TikTok',[[22000,475,25,323],[28000,1008,18,450],[17000,306,20,264]]],
    ['US','Meta',[[16000,310,17,238],[20000,560,10,330],[15000,255,16,215]]]
  ];
  p.data=data.flatMap(([m,platform,entries])=>entries.map(([impressions,clicks,conversions,spend],i)=>({
    name:['空杯占位','早班咖啡','小包访谈'][i]+' · '+m+' '+platform,direction:Object.keys(DIRECTIONS)[i],audience:'通勤咖啡人群',country:MARKETS[m].name,platform,
    impressions,clicks,conversions,spend
  })));
  p.sourceFile='folda-demo.csv';p.sourceType='模拟数据';return p;
}
