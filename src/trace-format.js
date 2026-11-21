const traceBodyLimit=32768;
const traceHidden='[已隐藏]';
function traceUsage(reply) {
  const u=reply?.usage||{};
  const count=(...xs)=>xs.find(n=>Number.isSafeInteger(n)&&n>=0)??null;
  const input=count(u.prompt_tokens,u.input_tokens,reply?.prompt_eval_count);
  const output=count(u.completion_tokens,u.output_tokens,reply?.eval_count);
  return {input,output,total:count(u.total_tokens,input!==null&&output!==null?input+output:null)};
}
function traceText(value,secrets=[]) {
  let text=String(value??'');
  for(const secret of secrets)if(typeof secret==='string'&&secret.length)text=text.split(secret).join(traceHidden);
  return text.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi,traceHidden)
    .replace(/(?:data:[\w.+/-]+;base64,)[A-Za-z0-9+/=]+/gi,'[二进制内容已省略]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+_./~=-]+/gi,traceHidden)
    .replace(/\b(?:sk-(?:proj-)?|gh[pousr]_|xox[bpar]-)[A-Za-z0-9_-]{8,}/g,traceHidden)
    .replace(/((?:https?|wss?):\/\/)[^/\s"'@]+@/gi,'$1')
    .replace(/([?&][\w.%~-]+)=([^&#\s"'<>]*)/g,'$1=[已隐藏]')
    .replace(/((?:["']?)(?:[\w-]*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential)|authorization|cookie|密码|密钥|令牌)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&}]+)/gi,'$1"[已隐藏]"');
}
function traceBody(value,secrets=[]) {
  if(value==null)return null;
  const privateField=k=>/^(?:key|token|owner|session|authorization|proxyauthorization|cookie|setcookie|clientsecret|credentials?|password|passwd|密钥|密码|令牌)$|(?:apikey|token|sessionkey|sessionid|privatekey|password|secret|credential|authorization|cookie)$/.test(k);
  function clean(v,depth){
    if(depth>20)return '[已省略深层内容]';
    if(typeof v==='string'){
      if(/^\s*[\[{]/.test(v)&&v.length<200000){try{return JSON.stringify(clean(JSON.parse(v),depth+1));}catch{}}
      return traceText(v,secrets);
    }
    if(Array.isArray(v))return v.map(x=>clean(x,depth+1));
    if(!v||typeof v!=='object')return v;
    const out=Object.create(null);
    for(const [key,value] of Object.entries(v)){
      const k=key.toLowerCase().replace(/[-_\s]/g,'');
      if(privateField(k)){out[key]=traceHidden;continue;}
      if(['reasoningcontent','thinking','encryptedcontent','reasoningtext'].includes(k)&&typeof value!=='object'){out[key]='[内部推理已省略]';continue;}
      if(k==='images'||(k==='data'&&typeof value==='string'&&(v.type==='image'||v.type==='audio'||v.mimeType))){out[key]='[二进制内容已省略]';continue;}
      out[traceText(key,secrets)]=clean(value,depth+1);
    }
    return out;
  }
  const safe=clean(value,0);
  const text=typeof safe==='string'?safe:JSON.stringify(safe,null,2);
  return text.length>traceBodyLimit?text.slice(0,traceBodyLimit)+'\n…【正文过长，已截取前 32,768 个字符】':text;
}
function traceEndpoint(value,secrets=[]) {
  try{const u=new URL(value);return traceText(u.origin+u.pathname,secrets);}catch{return '';}
}
function traceAttempt(trace,url,body,key){
  if(!trace)return null;
  const secrets=key?[key]:[];
  const row={at:Date.now(),endpoint:traceEndpoint(url,secrets),model:traceText(body.model,secrets).slice(0,160),http:null,usage:traceUsage(null)};
  if(trace.bodies)row.request=traceBody(body,secrets);
  trace.attempts.push(row);
  return row;
}
