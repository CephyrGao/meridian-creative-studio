using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace MeridianStudio {
    internal static class ResearchTransport {
        internal static bool Public(IPAddress ip){
            var b=ip.GetAddressBytes();
            if(b.Length==16)return (b[0]&0xe0)==0x20&&!(b[0]==32&&(b[1]==2||b[1]==1&&(b[2]==0||b[2]==13&&b[3]==184)));
            return b.Length==4&&b[0]!=0&&b[0]!=10&&b[0]!=127&&b[0]<224
                &&!(b[0]==100&&b[1]>=64&&b[1]<=127)&&!(b[0]==169&&b[1]==254)&&!(b[0]==172&&b[1]>=16&&b[1]<=31)
                &&!(b[0]==192&&(b[1]==168||b[1]==0&&(b[2]==0||b[2]==2)))&&!(b[0]==198&&(b[1]==18||b[1]==19||b[1]==51&&b[2]==100))&&!(b[0]==203&&b[1]==0&&b[2]==113);
        }
        static Uri Target(string input){
            Uri u;if(input.Length>4096||!Uri.TryCreate(input,UriKind.Absolute,out u)||!(u.Scheme=="https"||u.Scheme=="http")||u.UserInfo.Length+u.Fragment.Length>0||!(u.Port==80||u.Port==443))throw new InvalidDataException("仅支持公开 HTTP 或 HTTPS 网页。");return u;
        }
        internal static async Task<object> Read(Dictionary<string,object> data,CancellationToken cancel){
            string service=data.Str("service"),key=data.Str("key"),body=null;Uri u=Target(data.Str("url"));
            if(service!="page"){
                bool allowed=u.Scheme=="https"&&u.IsDefaultPort&&(service=="wiki"&&(u.Host=="en.wikipedia.org"||u.Host=="zh.wikipedia.org")&&u.AbsolutePath=="/w/api.php"||
                    service=="brave"&&u.Host=="api.search.brave.com"&&u.AbsolutePath=="/res/v1/web/search"||service=="tavily"&&u.Host=="api.tavily.com"&&u.AbsolutePath=="/search");
                if(!allowed)throw new InvalidDataException("搜索服务地址无效。");
                if(service!="wiki"&&(key.Length==0||key.Length>4096||key.Any(c=>Char.IsControl(c)||Char.IsWhiteSpace(c))))throw new InvalidDataException("搜索服务密钥无效。");
                if(service=="tavily"){var q=data.Str("query");if(q.Length<1||q.Length>500)throw new InvalidDataException("搜索关键词过长或为空。");body=Json.Write(new{query=q,search_depth="basic",max_results=5});}
            }
            if(Program.TestReport!=null){
                if(service=="page"&&u.AbsoluteUri=="https://api.github.com/repos/anthropics/skills/contents/skills")return new{url=u.AbsoluteUri,type="application/json",status=200,body=Json.Write(new[]{new{name="brand-guidelines",type="dir"}})};
                if(service=="page"&&u.AbsoluteUri=="https://raw.githubusercontent.com/anthropics/skills/main/skills/brand-guidelines/SKILL.md")return new{url=u.AbsoluteUri,type="text/plain",status=200,body="---\nname: brand-guidelines\ndescription: Test public brand style\n---\n# Brand guide\nReview input against the provided brand guide."};
                if(data.Str("query")=="meridian-integration-fixture"&&service=="brave")return new{url=u.AbsoluteUri,type="application/json",status=200,body=Json.Write(new{web=new{results=new[]{new{title="网页资料",url="https://example.org/brave",description="品牌口径"}}}})};
                if(data.Str("query")=="meridian-integration-fixture"&&service=="wiki")return new{url=u.AbsoluteUri,type="application/json",status=200,body=Json.Write(new{query=new{search=new[]{new{title="条目资料",pageid=23,snippet="条目简介"}}}})};
                if(service=="page"&&u.AbsoluteUri=="https://meridian-fixture.invalid/research-page")return new{url=u.AbsoluteUri,type="text/html",status=200,body="<title>网页验收</title><main><p>通勤随行杯收纳测试。</p></main>"};
                if(data.Str("query")=="meridian-integration-fixture"&&service=="tavily")return new{url=u.AbsoluteUri,type="application/json",status=200,body="{\"results\":[{\"title\":\"文献甲\",\"url\":\"https://example.org/source\",\"content\":\"市场调研记录\"}]}"};
            }
            for(int i=0;i<6;i++){
                cancel.ThrowIfCancellationRequested();
                var addresses=await Dns.GetHostAddressesAsync(u.DnsSafeHost).ConfigureAwait(false);
                if(addresses.Length==0||addresses.Any(a=>!Public(a)))throw new InvalidDataException("仅支持公网网页地址。");
                var req=(HttpWebRequest)WebRequest.Create(u);req.Proxy=null;req.AllowAutoRedirect=false;req.KeepAlive=false;req.UseDefaultCredentials=false;
                req.ServicePoint.BindIPEndPointDelegate=(point,address,n)=>{if(!Public(address.Address))throw new InvalidDataException("网页地址不可访问。");return new IPEndPoint(address.AddressFamily==AddressFamily.InterNetwork?IPAddress.Any:IPAddress.IPv6Any,0);};
                req.UserAgent="MeridianStudio/0.8.0-beta.1 (marketing research)";req.Accept="text/html, text/plain, application/json, application/xhtml+xml";
                req.AutomaticDecompression=DecompressionMethods.GZip|DecompressionMethods.Deflate;req.Timeout=25000;req.ReadWriteTimeout=25000;
                if(service=="brave")req.Headers.Add("X-Subscription-Token",key);
                if(service=="tavily")req.Headers[HttpRequestHeader.Authorization]="Bearer "+key;
                using(cancel.Register(req.Abort)){
                    if(body!=null){req.Method="POST";req.ContentType="application/json";var payload=Encoding.UTF8.GetBytes(body);req.ContentLength=payload.Length;using(var sink=await req.GetRequestStreamAsync().ConfigureAwait(false))await sink.WriteAsync(payload,0,payload.Length,cancel).ConfigureAwait(false);}
                    HttpWebResponse reply;
                    try{reply=(HttpWebResponse)await req.GetResponseAsync().ConfigureAwait(false);}
                    catch(WebException e){reply=e.Response as HttpWebResponse;if(reply==null)throw new InvalidDataException("联网请求失败，请检查网络或服务状态。");}
                    using(reply){
                        int status=(int)reply.StatusCode;string type=reply.ContentType??"";
                        if(service=="page"&&new[]{301,302,303,307,308}.Contains(status)&&!String.IsNullOrEmpty(reply.Headers["Location"])){
                            u=Target(new Uri(u,reply.Headers["Location"]).GetLeftPart(UriPartial.Query));continue;
                        }
                        if(!Regex.IsMatch(type,@"^(text/|application/(json|xhtml\+xml|xml))",RegexOptions.IgnoreCase)){
                            if(status<200||status>=300)return new{url=u.AbsoluteUri,type,status,body=""};
                            throw new InvalidDataException("该地址返回二进制文件，请下载后导入资料库。");
                        }
                        using(var input=reply.GetResponseStream())using(var buffer=new MemoryStream()){
                            var tmp=new byte[16384];int n;while((n=await input.ReadAsync(tmp,0,tmp.Length,cancel).ConfigureAwait(false))>0){
                                if(buffer.Length+n>2*1024*1024)throw new InvalidDataException("网页超过 2 MB 读取上限。");buffer.Write(tmp,0,n);}
                            byte[] bytes=buffer.ToArray();var charset=Regex.Match(type+" "+Encoding.ASCII.GetString(bytes,0,Math.Min(1800,bytes.Length)),@"charset\s*=\s*[""']?([A-Za-z0-9_-]+)",RegexOptions.IgnoreCase);
                            var encoding=Encoding.UTF8;try{if(charset.Success)encoding=Encoding.GetEncoding(charset.Groups[1].Value);}catch(ArgumentException){}
                            return new{url=u.AbsoluteUri,type,status,body=encoding.GetString(bytes)};
                        }
                    }
                }
            }
            throw new InvalidDataException("网页跳转次数过多。");
        }
    }
}
