using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace MeridianStudio {
    internal static class NativeChecks {
        const string TestBase="https://meridian-fixture.invalid/v1";
        internal sealed class Fixture : HttpMessageHandler {
            readonly Func<ApiInput,Task<ApiReply>> forward;
            internal Fixture(Func<ApiInput,Task<ApiReply>> forwarder){forward=forwarder;}
            internal sealed class Events : Stream {
                readonly ApiEventStream events;byte[] chunk;int offset;
                internal Events(ApiEventStream source){events=source;}
                public override async Task<int> ReadAsync(byte[] output,int start,int count,CancellationToken cancel){
                    if(chunk==null||offset==chunk.Length){chunk=await events.Next().ConfigureAwait(false);offset=0;if(chunk==null)return 0;}
                    int n=Math.Min(count,chunk.Length-offset);Buffer.BlockCopy(chunk,offset,output,start,n);offset+=n;return n;
                }
                protected override void Dispose(bool disposing){if(disposing)events.Disconnect();base.Dispose(disposing);}
                public override int Read(byte[] b,int o,int n){return ReadAsync(b,o,n,CancellationToken.None).GetAwaiter().GetResult();}
                public override bool CanRead{get{return true;}} public override bool CanWrite{get{return false;}} public override bool CanSeek{get{return false;}}
                public override long Length{get{throw new NotSupportedException();}} public override long Position{get{throw new NotSupportedException();}set{throw new NotSupportedException();}}
                public override void Flush(){} public override long Seek(long o,SeekOrigin origin){throw new NotSupportedException();}
                public override void SetLength(long n){throw new NotSupportedException();}public override void Write(byte[] b,int o,int n){throw new NotSupportedException();}
            }
            async Task<HttpResponseMessage> Legacy(HttpRequestMessage request){
                var headers=new Dictionary<string,string>{{"host","127.0.0.1"},{"content-type","application/json"}};
                if(request.Headers.Authorization!=null)headers["authorization"]=request.Headers.Authorization.ToString();
                var result=await forward(new ApiInput{Path=request.RequestUri.PathAndQuery,Method=request.Method.Method,Headers=headers,Body=request.Content==null?"":await request.Content.ReadAsStringAsync()});
                var content=result.Events==null?(HttpContent)new ByteArrayContent(result.Bytes):new StreamContent(new Events(result.Events));
                content.Headers.ContentType=System.Net.Http.Headers.MediaTypeHeaderValue.Parse(result.Type);
                return new HttpResponseMessage((System.Net.HttpStatusCode)result.Status){Content=content};
            }
            protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token) {
                if(request.RequestUri.Host=="meridian-fixture.invalid"&&(request.RequestUri.AbsolutePath=="/sse"||request.RequestUri.AbsolutePath=="/messages"))return await Legacy(request);
                string payload=await request.Content.ReadAsStringAsync();
                if(request.RequestUri.AbsoluteUri=="https://meridian-fixture.invalid/mcp")return McpReply(request,Json.Read(payload));
                var packet=Json.Read(payload);string fixtureModel=packet.Str("model");
                if(request.RequestUri.AbsoluteUri!=TestBase+"/chat/completions" || request.Method!=HttpMethod.Post ||
                    request.Headers.Authorization==null || request.Headers.Authorization.Parameter!="fixture-test" || !(fixtureModel=="fixture-model"||fixtureModel=="fixture-model-b"))
                    return new HttpResponseMessage(System.Net.HttpStatusCode.BadRequest){Content=new StringContent("{}")};
                object content=new{ok=true};
                if(payload.Contains("营销任务规划"))content=new{skills=new[]{"campaign-review","experiment-design"}};
                else if(payload.Contains("营销分析员"))content=new{headline="品牌语气审校",body="采用简短的通勤场景用语 [S1]。",sources=new[]{"S1"},questions=new object[0]};
                else if(payload.Contains("独立审稿人"))content=new{issues=new object[0]};
                else if(payload.Contains("15 秒竖屏广告")) {
                    var messages=(System.Collections.IEnumerable)packet["messages"];
                    var last=messages.Cast<Dictionary<string,object>>().Last();
                    string input=last.Str("content");
                    string direction=String.IsNullOrEmpty(input)?"scene":Json.Read(input).Str("direction");
                    content=new{direction, insight="通勤场景",audience="通勤者",reason="场景与受众相符",
                    title="Morning coffee",copy="Fold the cup after your coffee.",cta="See how it folds",tags=new[]{"#Coffee"},proof="",
                    shots=Enumerable.Range(0,4).Select(i=>new{visual="杯子",voice="Fold the cup.",subtitle="Fold it."}).ToArray()};
                }
                var result=new{id="fixture-completion",model=fixtureModel,choices=new[]{new{index=0,finish_reason="stop",message=new{role="assistant",content=Json.Write(content)}}},usage=new{prompt_tokens=7,completion_tokens=4,total_tokens=11}};
                return new HttpResponseMessage(System.Net.HttpStatusCode.OK){Content=new StringContent(Json.Write(result),Encoding.UTF8,"application/json")};
            }
            static HttpResponseMessage McpReply(HttpRequestMessage request,Dictionary<string,object> packet) {
                string method=packet.Str("method");
                object id;packet.TryGetValue("id",out id);
                var code=System.Net.HttpStatusCode.OK;object value;
                if(request.Headers.Authorization==null || request.Headers.Authorization.Parameter!="mcp-fixture-test")
                    return new HttpResponseMessage(System.Net.HttpStatusCode.Unauthorized){Content=new StringContent("{}")};
                if(method=="server/discover")code=System.Net.HttpStatusCode.BadRequest;
                if(method=="initialize")value=new{protocolVersion="2025-11-25",capabilities=new{tools=new{}},serverInfo=new{name="营销资料测试服务",version="1"}};
                else if(method=="server/discover")value=null;
                else {
                    IEnumerable<string> ids;
                    if(!request.Headers.TryGetValues("Mcp-Session-Id",out ids)||ids.FirstOrDefault()!="desktop-fixture-session")
                        return new HttpResponseMessage(System.Net.HttpStatusCode.BadRequest){Content=new StringContent("{}")};
                    if(method=="notifications/initialized")return new HttpResponseMessage(System.Net.HttpStatusCode.Accepted){Content=new StringContent("")};
                    if(method=="tools/list")value=new{tools=new[]{new{name="lookup",description="查询渠道资料",annotations=new{readOnlyHint=true},inputSchema=new{type="object",properties=new{market=new{type="string"}},required=new[]{"market"}}}}};
                    else if(method=="tools/call") {
                        var args=(Dictionary<string,object>)((Dictionary<string,object>)packet["params"])["arguments"];
                        var result=new{jsonrpc="2.0",id,result=new{content=new[]{new{type="text",text="渠道资料 · "+args.Str("market")}}}};
                        return new HttpResponseMessage(code){Content=new StringContent(": keep-alive\r\n\r\nevent: message\r\ndata: "+Json.Write(result)+"\r\n\r\n",Encoding.UTF8,"text/event-stream")};
                    } else return new HttpResponseMessage(System.Net.HttpStatusCode.NotFound){Content=new StringContent("{}")};
                }
                var reply=new HttpResponseMessage(code){Content=new StringContent(Json.Write(new{jsonrpc="2.0",id,result=value}),Encoding.UTF8,"application/json")};
                if(method=="initialize")reply.Headers.TryAddWithoutValidation("Mcp-Session-Id","desktop-fixture-session");
                return reply;
            }
        }
        internal static async Task VerifyMcp(LoopbackApi api,Func<ApiInput,Task<ApiReply>> forward,string token) {
            foreach(string name in new[]{"get_brief","list_approved_creatives","get_campaign_report"}) {
                var payload=Json.Write(new{jsonrpc="2.0",id=42,method="tools/call",@params=new{name,arguments=new{}}});
                var wire="POST /mcp HTTP/1.1\r\nHost: "+new Uri(api.Origin).Authority+"\r\nAuthorization: Bearer "+token+
                    "\r\nMCP-Protocol-Version: 2025-11-25\r\nContent-Type: application/json\r\nContent-Length: "+Encoding.UTF8.GetByteCount(payload)+"\r\n\r\n"+payload;
                using(var input=new MemoryStream(Encoding.UTF8.GetBytes(wire))) {
                    var reply=await forward(api.ReadRequest(input,Stream.Null));
                    var raw=Encoding.UTF8.GetString(reply.Bytes);
                    if(reply.Status!=200 || !raw.Contains("structuredContent") || !raw.Contains("Folda") ||
                       (name=="list_approved_creatives" && !raw.Contains("\"total\":1")))throw new InvalidDataException("MCP shared tool failed: "+name);
                }
            }
        }
        internal static async Task VerifyInProcess(LoopbackApi api,Func<ApiInput,Task<ApiReply>> forward) {
            if(api==null)throw new InvalidOperationException("SDK listener was not opened");
            foreach(string path in new[]{"/v1/chat/completions","/api/model/test","/api/generate","/api/audit"}) {
                bool raw=path.StartsWith("/v1/");
                object payload;
                if(raw)payload=new{model="fixture-model",messages=new[]{new{role="user",content="hello"}},stream=false};
                else payload=new{provider="compatible",baseUrl=TestBase,model="fixture-model",market=path=="/api/audit"?"CN":"JP",platform=path=="/api/audit"?"小红书":"YouTube",direction="scene",
                    brief=new{brand="Folda Go",product="折叠随行杯"},creative=new{title="Folda Go"}};
                string json=Json.Write(payload), host=new Uri(api.Origin).Authority;
                string header="POST "+path+" HTTP/1.1\r\nHost: "+host+"\r\nContent-Type: application/json\r\nContent-Length: "+Encoding.UTF8.GetByteCount(json)+"\r\n"+
                    (raw?"X-Model-Provider: compatible\r\nX-Model-Base-URL: "+TestBase+"\r\nAuthorization: Bearer fixture-test\r\n":"X-Session-Model-Key: fixture-test\r\n")+"\r\n";
                ApiReply reply;
                using(var wire=new MemoryStream(Encoding.UTF8.GetBytes(header+json)))
                    reply=await forward(api.ReadRequest(wire,Stream.Null));
                string body=Encoding.UTF8.GetString(reply.Bytes);
                var parsed=Json.Read(body);
                if(reply.Status!=200 || (raw&&parsed.Str("id")!="fixture-completion") || (path=="/api/model/test"&&!Object.Equals(parsed["ok"],true)) ||
                    ((!raw&&path!="/api/model/test")&&!parsed.ContainsKey("result")))throw new InvalidOperationException(path+" HTTP "+reply.Status+" "+body);
            }
        }
        internal static async Task VerifyLoopback(string origin) {
            if(String.IsNullOrEmpty(origin))throw new InvalidOperationException("SDK listener was not opened");
            int calls=0;
            using(var upstream=new LoopbackApi(request=>{
                var payload=Json.Read(request.Body);
                if(request.Method!="POST" || request.Path!="/v1/chat/completions" || payload.Str("model")!="meridian-test" ||
                   !request.Headers.ContainsKey("authorization") || request.Headers["authorization"]!="Bearer demo-test-token")
                    return Task.FromResult(new ApiReply(400,"{\"error\":{\"message\":\"incorrect provider request\"}}"));
                calls++;
                return Task.FromResult(new ApiReply(200,Json.Write(new{id="chatcmpl-local-test",model="meridian-test",choices=new[]{
                    new{index=0,finish_reason="stop",message=new{role="assistant",content="{\"ok\":true}"}}
                },usage=new{total_tokens=9}})));
            }))
            using(var client=new HttpClient(new HttpClientHandler{UseProxy=false}) {Timeout=TimeSpan.FromSeconds(11)}) {
                using(var req=new HttpRequestMessage(HttpMethod.Post,origin+"/v1/chat/completions")) {
                    req.Headers.Add("x-model-provider","compatible");
                    req.Headers.Add("x-model-base-url",upstream.Origin+"/v1");
                    req.Headers.TryAddWithoutValidation("Authorization","Bearer demo-test-token");
                    req.Content=new StringContent("{\"model\":\"meridian-test\",\"messages\":[{\"role\":\"user\",\"content\":\"test\"}],\"stream\":false}",Encoding.UTF8,"application/json");
                    using(var res=await client.SendAsync(req)) {
                        string raw=await res.Content.ReadAsStringAsync();
                        if(!res.IsSuccessStatusCode || Json.Read(raw).Str("id")!="chatcmpl-local-test")throw new InvalidOperationException("SDK round-trip HTTP "+(int)res.StatusCode+" "+raw);
                    }
                }
                using(var req=new HttpRequestMessage(HttpMethod.Post,origin+"/api/model/test")) {
                    req.Headers.Add("x-session-model-key","demo-test-token");
                    req.Content=new StringContent(Json.Write(new{provider="compatible",baseUrl=upstream.Origin+"/v1",model="meridian-test"}),Encoding.UTF8,"application/json");
                    using(var res=await client.SendAsync(req)) {
                        string raw=await res.Content.ReadAsStringAsync();
                        if(!res.IsSuccessStatusCode || !Object.Equals(Json.Read(raw)["ok"],true))throw new InvalidOperationException("Model probe HTTP "+(int)res.StatusCode+" "+raw);
                    }
                }
                if(calls!=2)throw new InvalidOperationException("Expected two actual requests to the local test provider");
            }
        }
    }
}
