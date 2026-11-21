let spaceTicking=false,spaceWakeLast=null,spaceWakeError='',spaceWakeChain=Promise.resolve();
function spaceSchedules(){
  const rows=[];try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(agentPrefix+'schedule/')){const s=JSON.parse(localStorage.getItem(k));if(s?.id)rows.push(s);}}}catch{}
  return rows.sort((a,b)=>(a.next||Infinity)-(b.next||Infinity));
}
function spaceZoned(at,zone){
  const f=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  return Object.fromEntries(f.formatToParts(at).filter(x=>x.type!=='literal').map(x=>[x.type,+x.value]));
}
function spaceLocalEpoch(c){return Date.UTC(c.year,c.month-1,c.day,c.hour,c.minute,c.second||0);}
function spaceFromWall(c,zone){
  const wall=spaceLocalEpoch(c);let epoch=wall;const seen=new Set();
  for(let i=0;i<5;i++){const diff=wall-spaceLocalEpoch(spaceZoned(epoch,zone));if(!diff)return epoch;
    seen.add(epoch);if(seen.has(epoch+diff))return Math.max(epoch,epoch+diff);epoch+=diff;}
  return epoch;
}
function spaceNext(s,due,now){
  if(s.freq==='once')return null;
  if(s.freq==='interval'){const period=s.minutes*60000;return due+(Math.floor(Math.max(0,now-due)/period)+1)*period;}
  const interval=s.freq==='weekly'?7:1,anchor=spaceZoned(s.anchor,s.zone),today=spaceZoned(now,s.zone);
  const date=Date.UTC(anchor.year,anchor.month-1,anchor.day),days=Math.floor((Date.UTC(today.year,today.month-1,today.day)-date)/86400000);
  let steps=Math.max(0,Math.floor(days/interval));
  function at(n){const d=new Date(date+n*interval*86400000);return spaceFromWall({year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),hour:anchor.hour,minute:anchor.minute},s.zone);}
  let next=at(steps);if(next<=Math.max(due,now))next=at(steps+1);return next;
}
function spaceWakeSync(force=false){
  if(!globalThis.meridianDesktop?.scheduleWake)return Promise.resolve();
  const on=localStorage.getItem('meridian-system-wake')==='on';
  const due=on?Math.min(...spaceSchedules().filter(s=>s.enabled&&s.next).map(s=>s.next)):Infinity;
  const at=Number.isFinite(due)?new Date(due).toISOString():'';
  if(!force&&(spaceWakeLast===at||spaceWakeLast===null&&!on))return spaceWakeChain;
  spaceWakeLast=at;
  spaceWakeChain=spaceWakeChain.catch(()=>{}).then(async()=>{try{await meridianDesktop.scheduleWake(at);spaceWakeError='';}catch(e){spaceWakeLast=null;spaceWakeError=e.message;if(force)throw e;}});return spaceWakeChain;
}
async function spaceFire(s,due,manual=false){
  const p=db.projects.find(x=>x.id===s.pid);if(!p)return;
  const rid=manual?id():'timer-'+s.id+'-'+due,runKey='run/'+rid;
  let run;try{run=JSON.parse(localStorage.getItem(agentPrefix+runKey)||'null');}catch{}
  if(!run){
    const now=Date.now();run={id:rid,pid:p.id,created:now,updated:now,goal:s.goal,pick:s.pick||'',scope:agentScope(p,{goal:s.goal,direction:'scene'}),
      inputs:s.inputs||{files:[],url:'',query:''},budget:{limit:s.budget??null,reported:0,held:0},status:'queued',steps:[],tool:null,scheduleId:s.id,scheduledFor:due};
    spaceSet(runKey,run);
  }else agentRecords.set(runKey,run);
  if(!manual&&s.next===due){s.next=spaceNext(s,due,Date.now());if(!s.next)s.enabled=false;}
  s.lastRun=rid;s.lastAt=Date.now();spaceSet('schedule/'+s.id,s);
  if(run.status==='queued'){await agentContinue(p,run);}
  if(page==='workspace')render();
}
async function spaceTick(){
  if(spaceTicking||agentActive||job)return;spaceTicking=true;
  const tick=async()=>{
    const now=Date.now();for(const s of spaceSchedules()){
      const previous=s.lastRun&&JSON.parse(localStorage.getItem(agentPrefix+'run/'+s.lastRun)||'null');
      if(previous?.status==='queued'&&s.lastAt){const p=db.projects.find(x=>x.id===s.pid);if(p){agentRecords.set('run/'+previous.id,previous);await agentContinue(p,previous);}break;}
      if(s.enabled&&s.next&&s.next<=now&&db.projects.some(p=>p.id===s.pid)){await spaceFire(s,s.next);break;}
    }
  };
  try{if(globalThis.navigator?.locks?.request)await navigator.locks.request('meridian-timers-v1',{ifAvailable:true},lock=>lock?tick():null);else await tick();}
  catch(e){spaceNotice='定时任务未完成 · '+(e.message||e);}
  finally{spaceTicking=false;await spaceWakeSync().catch(()=>{});}
}
function spaceBoot(){
  if(!globalThis.indexedDB)return;
  spaceIndex(spaceOf(project())).then(()=>{if(page==='agent'||page==='workspace')render();}).catch(()=>{});
  setTimeout(spaceTick,1200);globalThis.setInterval?.(spaceTick,15000);
  globalThis.addEventListener?.('meridian-schedule-tick',spaceTick);
  globalThis.addEventListener?.('focus',spaceTick);
  globalThis.addEventListener?.('storage',e=>{
    if(e.key?.startsWith(agentPrefix)){
      const k=e.key.slice(agentPrefix.length);try{if(e.newValue==null)agentRecords.delete(k);else agentRecords.set(k,JSON.parse(e.newValue));}catch{}
      if((page==='workspace'||settingsAt('directory')&&k.startsWith('workspace/'))&&!$('#dialog')?.open)render();
    }
  });
}
