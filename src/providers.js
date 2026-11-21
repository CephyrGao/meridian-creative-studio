const CHAT_PROVIDERS = Object.freeze({
  openai: {label:'OpenAI', baseUrl:'https://api.openai.com/v1', model:'gpt-4.1-mini'},
  deepseek: {label:'DeepSeek', baseUrl:'https://api.deepseek.com', model:'deepseek-flash'},
  compatible: {label:'自定义 OpenAI 兼容接口', baseUrl:'', model:''}
});
function chatBaseUrl(value) {
  if(typeof value !== 'string' || !value.trim() || value.length > 1500) throw Error('请填写 API Base URL。');
  let url;
  try { url = new URL(value.trim()); } catch { throw Error('Base URL 需要填写完整的 http 或 https 地址。'); }
  const loopback = ['localhost','127.0.0.1','[::1]'].includes(url.hostname.toLowerCase());
  if(url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) throw Error('云端服务请用 HTTPS；本机回环地址也支持 HTTP。');
  if(url.username || url.password || url.search || url.hash) throw Error('Base URL 只填写服务器地址和 API 路径。密钥请填在 API Key 栏。');
  const path=url.pathname.replace(/\/+$/,'').replace(/\/chat\/completions$/,'').replace(/\/+$/,'');
  return url.origin + path;
}
function chatModelId(value) {
  if(typeof value !== 'string' || !value.trim() || value.trim().length > 240 || /[\u0000-\u001f\u007f]/.test(value)) throw Error('请填写服务商提供的模型 ID。');
  return value.trim();
}

