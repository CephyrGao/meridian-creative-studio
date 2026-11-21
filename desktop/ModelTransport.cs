using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace MeridianStudio {
    internal static class Json {
        internal static string Write(object value) { return new JavaScriptSerializer {MaxJsonLength=16000000}.Serialize(value); }
        internal static Dictionary<string,object> Read(string text,int maxLength=16000000) { return new JavaScriptSerializer {MaxJsonLength=maxLength}.Deserialize<Dictionary<string,object>>(text); }
        internal static string Str(this IDictionary<string,object> data, string key) {
            object value;
            return data.TryGetValue(key,out value) && value is string ? (string)value : "";
        }
    }
    internal sealed class ModelTransport : IDisposable {
        readonly HttpClient web;
        readonly HttpClient loopback = Client(false);
        readonly Dictionary<string,string> tokens = new Dictionary<string,string>();
        readonly Dictionary<string,object> config = new Dictionary<string,object>();
        DateTime nextDetection;
        Task<string> checking;
        string lastModel;
        static HttpClient Client(bool proxy) {
            var handler = new HttpClientHandler { AllowAutoRedirect=false, UseCookies=false, UseProxy=proxy, AutomaticDecompression=DecompressionMethods.GZip|DecompressionMethods.Deflate };
            return new HttpClient(handler) { Timeout=Timeout.InfiniteTimeSpan };
        }
        internal ModelTransport(HttpMessageHandler testWebHandler) {
            web=testWebHandler==null?Client(true):new HttpClient(testWebHandler);
            config["IS_LOCAL"] = true;
            foreach (string name in new[]{"OPENAI_MODEL","DEEPSEEK_MODEL","COMPAT_MODEL","COMPAT_BASE_URL"}) {
                string value=Environment.GetEnvironmentVariable(name);
                if (!String.IsNullOrWhiteSpace(value)) config[name]=value.Trim();
            }
            foreach (string name in new[]{"OPENAI_API_KEY","DEEPSEEK_API_KEY","COMPAT_API_KEY"}) {
                string value=Environment.GetEnvironmentVariable(name);
                if (String.IsNullOrWhiteSpace(value)) continue;
                string marker="meridian-environment-"+Guid.NewGuid().ToString("N");
                config[name]=marker;
                tokens[marker]=name;
            }
        }
        internal async Task<object> Configuration(bool detect, string apiOrigin, string pipePath) {
            var copy=new Dictionary<string,object>(config);
            copy["MCP_LAUNCH"]=new {command=System.Reflection.Assembly.GetExecutingAssembly().Location,args=new[]{"--mcp-stdio"},pipe=pipePath};
            copy["LOCAL_MODEL"] = detect ? await LocalModel() : lastModel;
            return new {apiOrigin=apiOrigin,env=copy};
        }
        async Task<string> LocalModel() {
            if (DateTime.UtcNow < nextDetection) return lastModel;
            if (checking != null) return await checking;
            checking=ProbeLocal();
            try { lastModel=await checking; return lastModel; }
            finally { checking=null; nextDetection=DateTime.UtcNow.AddSeconds(lastModel==null?3:20); }
        }
        async Task<string> ProbeLocal() {
            try {
                using (var limit=new CancellationTokenSource(1600))
                using (var result=await loopback.GetAsync("http://127.0.0.1:11434/api/tags",limit.Token)) {
                    if (!result.IsSuccessStatusCode) return null;
                    var obj=Json.Read(await result.Content.ReadAsStringAsync());
                    object raw;
                    if (!obj.TryGetValue("models",out raw) || !(raw is IEnumerable)) return null;
                    var names=((IEnumerable)raw).OfType<Dictionary<string,object>>().Select(x=>x.Str("name"))
                        .Where(x=>x.Length>0&&!System.Text.RegularExpressions.Regex.IsMatch(x,"embed|rerank|bert",System.Text.RegularExpressions.RegexOptions.IgnoreCase)).ToList();
                    return names.FirstOrDefault(x=>x==Environment.GetEnvironmentVariable("OLLAMA_MODEL"))
                        ?? names.FirstOrDefault(x=>x.StartsWith("gemma3:4b")) ?? names.FirstOrDefault();
                }
            } catch (Exception) { return null; }
        }
        static bool Loopback(Uri uri) { return uri.Host=="127.0.0.1" || uri.Host=="[::1]" || String.Equals(uri.Host,"localhost",StringComparison.OrdinalIgnoreCase); }
        bool Authorized(string variable, Uri uri) {
            if (variable=="OPENAI_API_KEY") return uri.AbsoluteUri=="https://api.openai.com/v1/chat/completions" || uri.AbsoluteUri=="https://api.openai.com/v1/responses";
            if (variable=="DEEPSEEK_API_KEY") return uri.AbsoluteUri=="https://api.deepseek.com/chat/completions";
            string configured=config.Str("COMPAT_BASE_URL").TrimEnd('/');
            const string path="/chat/completions";
            if (configured.EndsWith(path,StringComparison.Ordinal)) configured=configured.Substring(0,configured.Length-path.Length).TrimEnd('/');
            Uri target;
            return variable=="COMPAT_API_KEY" && Uri.TryCreate(configured+path,UriKind.Absolute,out target) && target.AbsoluteUri==uri.AbsoluteUri;
        }
        internal async Task<object> Post(Dictionary<string,object> input, CancellationToken cancel) {
            Uri uri;
            if (!Uri.TryCreate(input.Str("url"),UriKind.Absolute,out uri) ||
                !(uri.Scheme=="https" || uri.Scheme=="http"&&Loopback(uri)) ||
                uri.UserInfo.Length>0 || uri.Query.Length>0 || uri.Fragment.Length>0 ||
                !(uri.AbsolutePath.EndsWith("/chat/completions",StringComparison.Ordinal) ||
                  uri.AbsoluteUri=="https://api.openai.com/v1/responses" || uri.AbsoluteUri=="http://127.0.0.1:11434/api/chat"))
                throw new InvalidDataException("模型服务地址无效。");
            string auth=input.Str("authorization");
            if (auth.Length>0 && (!auth.StartsWith("Bearer ",StringComparison.Ordinal) || auth.Length>4104 || auth.Any(Char.IsControl))) throw new InvalidDataException("凭据格式无效。");
            string variable,managedSecret=null;
            if (auth.Length>7 && tokens.TryGetValue(auth.Substring(7),out variable)) {
                if (!Authorized(variable,uri)) throw new InvalidDataException("模型地址与凭据不匹配。");
                managedSecret=Environment.GetEnvironmentVariable(variable).Trim();
                auth="Bearer "+managedSecret;
            }
            using (var req=new HttpRequestMessage(HttpMethod.Post,uri)) {
                req.Content=new StringContent(input.Str("body"),Encoding.UTF8,"application/json");
                if (auth.Length>0) req.Headers.TryAddWithoutValidation("Authorization",auth);
                using (var res=await (Loopback(uri)?loopback:web).SendAsync(req,HttpCompletionOption.ResponseHeadersRead,cancel))
                using (var stream=await res.Content.ReadAsStreamAsync())
                using (var bytes=new MemoryStream()) {
                    var buffer=new byte[16384];
                    int n;
                    while ((n=await stream.ReadAsync(buffer,0,buffer.Length,cancel))>0) {
                        if (bytes.Length+n>8*1024*1024) throw new InvalidDataException("模型回复过大。");
                        bytes.Write(buffer,0,n);
                    }
                    string responseText=Encoding.UTF8.GetString(bytes.ToArray());
                    string traceBody=!String.IsNullOrEmpty(managedSecret)&&responseText.Contains(managedSecret)?responseText.Replace(managedSecret,"[已隐藏]"):null;
                    return new {status=(int)res.StatusCode,body=responseText,traceBody};
                }
            }
        }
        internal async Task<object> McpHttp(Dictionary<string,object> input,Action<object> post,CancellationToken cancel) {
            Uri uri;
            if(!Uri.TryCreate(input.Str("url"),UriKind.Absolute,out uri) || uri.UserInfo.Length>0 || uri.Fragment.Length>0 ||
               !(uri.Scheme=="https" || uri.Scheme=="http" && Loopback(uri))) throw new InvalidDataException("MCP 地址无效。");
            string body=input.Str("body"), streamId=input.Str("stream");
            if(body.Length>160000 || streamId.Length>100) throw new InvalidDataException("MCP 请求过大。");
            bool get=input.Str("method")=="GET";
            if(!get){
                var packet=Json.Read(body);
                var methods=new[]{"initialize","notifications/initialized","server/discover","tools/list","tools/call"};
                if(packet.Str("jsonrpc")!="2.0" || !methods.Contains(packet.Str("method")))throw new InvalidDataException("MCP 请求无效。");
            }
            var headers=(Dictionary<string,object>)input["headers"];
            using(var req=new HttpRequestMessage(get?HttpMethod.Get:HttpMethod.Post,uri)) {
                if(!get)req.Content=new StringContent(body,Encoding.UTF8,"application/json");
                req.Headers.TryAddWithoutValidation("Accept",get?"text/event-stream":"application/json, text/event-stream");
                foreach(string name in new[]{"authorization","mcp-protocol-version","mcp-session-id","mcp-method","mcp-name"}) {
                    string value=headers.Str(name);
                    if(value.Length==0)continue;
                    if(value.Length>8192 || value.Any(Char.IsControl))throw new InvalidDataException("MCP 请求头无效。");
                    req.Headers.TryAddWithoutValidation(name,value);
                }
                using(var response=await (Loopback(uri)?loopback:web).SendAsync(req,HttpCompletionOption.ResponseHeadersRead,cancel)) {
                    IEnumerable<string> ids;
                    var session=response.Headers.TryGetValues("Mcp-Session-Id",out ids)?ids.FirstOrDefault():"";
                    post(new{op="mcpHead",stream=streamId,status=(int)response.StatusCode,session,
                        type=response.Content.Headers.ContentType==null?"":response.Content.Headers.ContentType.MediaType});
                    using(var bytes=await response.Content.ReadAsStreamAsync())
                    using(cancel.Register(()=>bytes.Dispose())) {
                        var buffer=new byte[24576];long total=0;int n;
                        while((n=await bytes.ReadAsync(buffer,0,buffer.Length,cancel))>0) {
                            total+=n;
                            if(!get&&total>4*1024*1024)throw new InvalidDataException("MCP 响应超过 4 MB。");
                            post(new{op="mcpChunk",stream=streamId,bytes=Convert.ToBase64String(buffer,0,n)});
                        }
                    }
                }
            }
            return new{ok=true};
        }
        public void Dispose() { web.Dispose(); loopback.Dispose(); }
    }
}
