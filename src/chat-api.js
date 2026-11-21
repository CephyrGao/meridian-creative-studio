function configuredChat(env) {
  const result = {};
  if(env.OPENAI_API_KEY) result.openai = {model:env.OPENAI_MODEL || CHAT_PROVIDERS.openai.model, hasKey:true};
  if(env.DEEPSEEK_API_KEY) result.deepseek = {model:env.DEEPSEEK_MODEL || CHAT_PROVIDERS.deepseek.model, hasKey:true};
  if(env.COMPAT_BASE_URL && env.COMPAT_MODEL) {
    try { result.compatible = {baseUrl:chatBaseUrl(env.COMPAT_BASE_URL), model:chatModelId(env.COMPAT_MODEL), hasKey:!!env.COMPAT_API_KEY}; }
    catch { /* An invalid optional preset must not prevent the other models from loading. */ }
  }
  return result;
}
function getChatProvider(env, config, suppliedKey) {
  const vendor=config.provider;
  if(!Object.hasOwn(CHAT_PROVIDERS,vendor)) throw new ModelError('请选择 OpenAI、DeepSeek 或自定义 OpenAI 兼容接口。',400);
  const preset=CHAT_PROVIDERS[vendor], saved=configuredChat(env)[vendor];
  let base, model;
  try {
    base=chatBaseUrl(config.baseUrl || saved?.baseUrl || preset.baseUrl);
    model=chatModelId(config.model || saved?.model || preset.model);
  } catch(e) {throw new ModelError(e.message,400);}
  if(vendor!=='compatible' && base!==preset.baseUrl) throw new ModelError('使用其他服务地址时，请选择「自定义 OpenAI 兼容接口」。',400);
  const sameCustom=vendor==='compatible' && base===saved?.baseUrl;
  if(vendor==='compatible' && env.IS_LOCAL!==true && !sameCustom) throw new ModelError('在线服务仅允许服务端配置的兼容地址。本地启动器支持填写自定义地址。',403);
  const serverKey=vendor==='openai'?env.OPENAI_API_KEY:vendor==='deepseek'?env.DEEPSEEK_API_KEY:sameCustom?env.COMPAT_API_KEY:'';
  const key=(suppliedKey || serverKey || '').trim();
  if(key.length>4096 || /[\u0000-\u0020\u007f]/.test(key)) throw new ModelError('API Key 中有无效字符，请重新复制。',400);
  if(vendor!=='compatible' && !key) throw new ModelError('请填写 '+preset.label+' API Key，或在启动服务前设置对应环境变量。',401);
  return {kind:'chat',vendor,model,key,endpoint:base+'/chat/completions'};
}
function upstreamFailure(status, body) {
  const detail=body?.error || {};
  const fields=[detail.param,detail.code,detail.message].filter(x=>typeof x==='string').join(' ').toLowerCase();
  let hint;
  switch(status){
    case 400: case 422: hint='服务商拒绝了请求参数，请核对模型对消息、图片和 JSON 输出的支持。';break;
    case 401: hint='API Key 无效、过期或属于其他服务商。';break;
    case 402: hint='服务商余额不足，请检查 API 账户。';break;
    case 403: hint='当前 API Key 或地区没有调用此模型的权限。';break;
    case 404: hint='请核对 Base URL、/chat/completions 路径和模型 ID。';break;
    case 429: hint=fields.includes('quota')?'当前 API 额度不足，请核对配额。':'服务商限流或额度不足，请检查配额后重试。';break;
    default: hint=status>=500?'服务商暂时无法处理请求。':'服务商未接受本次请求。';
  }
  const err=new ModelError('服务商返回 HTTP '+status+'。'+hint,status>=400&&status<=599?status:502);
  err.upstreamStatus=status;
  const unsupported=/unsupported|not supported|not support|unknown|unrecognized|not permitted|extra inputs|not allowed|not a valid parameter|unexpected|不支持/.test(fields);
  if((status===400||status===422)&&unsupported) {
    if(fields.includes('response_format')) err.unsupported='response_format';
    else if(fields.includes('max_tokens')) err.unsupported='max_tokens';
  }
  return err;
}
async function postModelJson(url,body,key,signal,timeoutMs,trace) {
  const headers={'content-type':'application/json'};
  if(key) headers.authorization='Bearer '+key;
  const timer=AbortSignal.timeout(timeoutMs);
  const combined=signal&&typeof AbortSignal.any==='function'?AbortSignal.any([timer,signal]):timer;
  let res, payload;
  const reserve=budgetReserve(trace,body);
  const row=traceAttempt(trace,url,body,key);
  if(reserve)row.reservedTokens=reserve;
  try{
    res=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:combined,redirect:'manual'});
    if(row)row.http=res.status;
    if(res.status>=300&&res.status<400) throw new ModelError('模型服务返回了重定向，请填写最终 API 地址。',502);
    const raw=await res.text();
    try { payload=JSON.parse(raw); }
    catch(e) {
      if(combined.aborted)throw e;
      if(row&&trace.bodies)row.response=traceBody(res.meridianTraceBody??raw,[key]);
      if(res.ok)throw new ModelError('模型服务返回了非 JSON 内容，请检查填写的是 API 地址。',502);
    }
    if(row&&payload!=null){
      row.usage=traceUsage(payload);
      let safePayload=payload;
      if(typeof res.meridianTraceBody==='string'){try{safePayload=JSON.parse(res.meridianTraceBody);}catch{safePayload=res.meridianTraceBody;}}
      if(typeof safePayload?.model==='string')row.model=traceText(safePayload.model,[key]).slice(0,160);
      if(trace.bodies)row.response=traceBody(safePayload,[key]);
    }
  } catch(e) {
    if(e instanceof ModelError)throw e;
    if(signal?.aborted)throw new ModelError('模型请求已取消。',499);
    if(timer.aborted||e.name==='TimeoutError')throw new ModelError('模型请求超时。已完成的条目会保留。',504);
    throw new ModelError('无法连接模型服务，请检查 Base URL、网络和服务状态。',503);
  }finally{
    if(row)row.ms=Math.max(0,Date.now()-row.at);
    if(reserve)trace.remaining=Math.max(0,trace.remaining-(row.usage.total??reserve));
  }
  if(!res.ok){
    const error=upstreamFailure(res.status,payload);
    if(row)row.error=error.message;
    throw error;
  }
  return payload;
}
function parseModelJson(text) {
  if(typeof text!=='string'||!text.trim()) throw new ModelError('模型返回了空内容，请检查模型或重试。',502);
  const clean=text.trim().replace(/^```(?:json)?\s*|\s*```$/gi,'');
  try{return JSON.parse(clean);}catch{throw new ModelError('模型回复不是完整的 JSON，当前结果未写入工作台。',502);}
}
function validateShape(value, shape, path='result') {
  const fail=()=>{throw new ModelError('模型 JSON 的字段不符合约定：'+path+'。请重试或更换模型。',502);};
  if(shape.enum&&!shape.enum.includes(value))fail();
  if(shape.type==='object'){
    if(value===null||typeof value!=='object'||Array.isArray(value))fail();
    for(const [field,s] of Object.entries(shape.properties)){if(!Object.hasOwn(value,field))throw new ModelError('模型 JSON 缺少字段 '+path+'.'+field+'。',502);validateShape(value[field],s,path+'.'+field);}
  }else if(shape.type==='array'){
    if(!Array.isArray(value)||value.length<(shape.minItems||0)||value.length>(shape.maxItems??Infinity))fail();
    value.forEach((item,index)=>validateShape(item,shape.items,path+'['+index+']'));
  }else if(typeof value!==shape.type)fail();
}
function formatExample(task,direction) {
  if(task==='test')return {ok:true};
  if(task==='audit')return {issues:[{level:'中',path:'copy',quote:'待核对的原文',reason:'具体原因',fix:'具体修改建议'}]};
  return {direction,insight:'洞察',audience:'目标人群',reason:'推荐理由',title:'目标语言标题',copy:'目标语言广告正文',cta:'目标语言 CTA',tags:['#localtag'],proof:'',shots:[0,1,2,3].map(i=>({visual:'第 '+(i+1)+' 镜的画面',voice:'目标语言旁白',subtitle:'目标语言字幕'}))};
}
async function structuredChat(provider, task, spec, signal,trace) {
  const instruction=spec.instruction+'\n返回一个 JSON 对象。字段形状示例：'+JSON.stringify(spec.example||formatExample(task,spec.direction))+
    (task==='audit'?'。实际无问题时使用 {"issues":[]}。':'。示例占位文本须替换为实际内容。');
  const content=spec.images.length?[{type:'text',text:spec.input},...spec.images.map(url=>({type:'image_url',image_url:{url}}))]:spec.input;
  const body={model:provider.model,messages:[{role:'system',content:instruction},{role:'user',content}],stream:false,response_format:{type:'json_object'}};
  if(provider.vendor==='openai'){body.max_completion_tokens=spec.budget;body.store=false;}
  else body.max_tokens=spec.budget;
  if(provider.vendor==='deepseek')body.thinking={type:'disabled'};
  let result;
  for(;;){
    try{result=await postModelJson(provider.endpoint,body,provider.key,signal,120000,trace);break;}
    catch(e){
      if(provider.vendor!=='compatible')throw e;
      if(e.unsupported==='response_format'&&Object.hasOwn(body,'response_format')){delete body.response_format;continue;}
      if(e.unsupported==='max_tokens'&&Object.hasOwn(body,'max_tokens')){body.max_completion_tokens=body.max_tokens;delete body.max_tokens;continue;}
      throw e;
    }
  }
  const choice=result?.choices?.[0];
  if(choice?.finish_reason==='length')throw new ModelError('模型达到输出长度上限，未返回完整结果。',502);
  if(choice?.finish_reason==='content_filter'||choice?.message?.refusal)throw new ModelError('服务商未返回这次请求的内容。',422);
  const parsed=parseModelJson(choice?.message?.content);
  validateShape(parsed,spec.shape);
  return {result:parsed,engine:typeof result.model==='string'&&result.model?result.model:provider.model,usage:traceUsage(result)};
}
async function localChatRoute(request, env, input) {
  if(env.IS_LOCAL!==true)throw new ModelError('标准聊天测试端点仅在本地运行版开放。',404);
  if(['api_key','key','apiKey'].some(k=>Object.hasOwn(input,k)))throw new ModelError('请在 Authorization 请求头中传入 API Key。',400);
  if(!Array.isArray(input.messages)||!input.messages.length)throw new ModelError('messages 需要至少一条消息。',400);
  if(input.stream!==undefined&&input.stream!==false)throw new ModelError('此本地测试端点使用非流式回复，请设置 stream 为 false。',400);
  if(typeof input.model!=='string'||!input.model.trim())throw new ModelError('请填写 model。',400);
  const vendor=request.headers.get('x-model-provider') || (/^deepseek/i.test(input.model)?'deepseek':input.model===env.COMPAT_MODEL&&env.COMPAT_BASE_URL?'compatible':'openai');
  const auth=request.headers.get('authorization');
  if(auth&&!/^Bearer\s+\S+$/i.test(auth))throw new ModelError('Authorization 需使用 Bearer 格式。',401);
  const provider=getChatProvider(env,{provider:vendor,model:input.model,baseUrl:request.headers.get('x-model-base-url')},auth?.replace(/^Bearer\s+/i,''));
  const body={...input,model:provider.model,stream:false};
  const result=await postModelJson(provider.endpoint,body,provider.key,request.signal,120000);
  if(!Array.isArray(result?.choices)||!result.choices[0]?.message)throw new ModelError('上游回复缺少 Chat Completions 的 choices[0].message。',502);
  return json(result);
}

