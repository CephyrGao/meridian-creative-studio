using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace MeridianStudio {
    internal sealed class McpPipeServer : IDisposable {
        internal readonly string Name="meridian-mcp-"+Guid.NewGuid().ToString("N");
        internal string Path {get{return available?@"\\.\pipe\"+Name:"";}}
        readonly Func<ApiInput,Task<ApiReply>> dispatch;
        readonly object gate=new object();
        readonly SemaphoreSlim clients=new SemaphoreSlim(12,12);
        NamedPipeServerStream next;
        bool closed;
        volatile bool available;
        internal McpPipeServer(Func<ApiInput,Task<ApiReply>> forward){dispatch=forward;Listen();}
        async void Listen(){
            try{
                while(true){
                    NamedPipeServerStream stream;
                    lock(gate){if(closed)return;next=stream=new NamedPipeServerStream(Name,PipeDirection.InOut,16,PipeTransmissionMode.Byte,PipeOptions.Asynchronous);available=true;}
                    await stream.WaitForConnectionAsync().ConfigureAwait(false);
                    lock(gate){if(closed){stream.Dispose();return;}next=null;}
                    if(clients.Wait(0))Serve(stream);else stream.Dispose();
                }
            }catch(Exception){lock(gate){available=false;if(next!=null)next.Dispose();next=null;}}
        }
        async void Serve(NamedPipeServerStream stream){
            var utf8=new UTF8Encoding(false);
            try{
                using(stream)using(var limit=new CancellationTokenSource(TimeSpan.FromSeconds(20)))
                using(limit.Token.Register(()=>stream.Dispose())){
                    var reader=new StreamReader(stream,utf8);var line=new StringBuilder();var chars=new char[4096];
                    while(true){
                        int n=await reader.ReadAsync(chars,0,chars.Length).ConfigureAwait(false);if(n==0)return;
                        int e=Array.IndexOf(chars,'\n',0,n);line.Append(chars,0,e>=0?e:n);
                        if(line.Length>190000)return;if(e>=0)break;
                    }
                    var data=Json.Read(line.ToString());object raw;var msg=data.TryGetValue("message",out raw)?raw as Dictionary<string,object>:null;
                    if(msg==null)return;
                    var headers=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase){{"host","127.0.0.1"},{"authorization","Bearer "+data.Str("token")},{"content-type","application/json"}};
                    var reply=await dispatch(new ApiInput{Method="POST",Path="/_meridian/stdio",Headers=headers,Body=Json.Write(msg),FromPipe=true}).ConfigureAwait(false);
                    string result=Encoding.UTF8.GetString(reply.Bytes);
                    if(result.Length==0)result="null";
                    else if(reply.Status>=400){
                        var rpc=Json.Read(result);object id;msg.TryGetValue("id",out id);rpc["id"]=id;result=Json.Write(rpc);
                    }
                    var output=utf8.GetBytes(result+"\n");await stream.WriteAsync(output,0,output.Length).ConfigureAwait(false);await stream.FlushAsync().ConfigureAwait(false);stream.WaitForPipeDrain();
                }
            }catch(Exception){}finally{clients.Release();}
        }
        public void Dispose(){lock(gate){closed=true;if(next!=null)next.Dispose();}}
    }
}
