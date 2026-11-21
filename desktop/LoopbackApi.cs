using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace MeridianStudio {
    internal sealed class ApiInput {
        internal string Path, Method, Body;
        internal bool FromPipe;
        internal Dictionary<string,string> Headers;
    }
    internal sealed class ApiEventStream {
        readonly Queue<byte[]> chunks=new Queue<byte[]>();
        readonly SemaphoreSlim ready=new SemaphoreSlim(0);
        readonly Action disconnect;
        int size;bool ended;
        internal ApiEventStream(Action disconnected){disconnect=disconnected;}
        internal bool Offer(byte[] chunk){
            lock(chunks){if(ended||size+chunk.Length>8*1024*1024)return false;chunks.Enqueue(chunk);size+=chunk.Length;ready.Release();return true;}
        }
        internal void End(){lock(chunks){if(!ended){ended=true;ready.Release();}}}
        bool disconnected;
        internal void Disconnect(){End();lock(chunks){if(disconnected)return;disconnected=true;}disconnect();}
        internal async Task<byte[]> Next(){
            lock(chunks){if(ended&&chunks.Count==0)return null;}
            await ready.WaitAsync().ConfigureAwait(false);
            lock(chunks){if(chunks.Count==0)return null;var chunk=chunks.Dequeue();size-=chunk.Length;return chunk;}
        }
        internal async Task WriteTo(Stream stream){
            try{
                while(true){
                    var next=await Next().ConfigureAwait(false);if(next==null)break;
                    await stream.WriteAsync(next,0,next.Length).ConfigureAwait(false);
                    await stream.FlushAsync().ConfigureAwait(false);
                }
            }finally{Disconnect();}
        }
    }
    internal sealed class ApiReply {
        internal int Status;
        internal byte[] Bytes;
        internal ApiEventStream Events;
        internal string Type;
        internal string ExtraHeaders="";
        internal ApiReply(int status, string json) : this(status,Encoding.UTF8.GetBytes(json),"application/json; charset=utf-8") {}
        internal ApiReply(int status,byte[] bytes,string type) { Status=status; Bytes=bytes; Type=type; }
    }
    internal sealed class LoopbackApi : IDisposable {
        const int MaxBody=2100000;
        readonly TcpListener listener;
        readonly Func<ApiInput,Task<ApiReply>> dispatch;
        readonly SemaphoreSlim clients=new SemaphoreSlim(24,24);
        volatile bool closed;
        internal string Origin {get;private set;}
        internal LoopbackApi(Func<ApiInput,Task<ApiReply>> handler) {
            dispatch=handler;
            int port;
            if (!Int32.TryParse(Environment.GetEnvironmentVariable("MERIDIAN_PORT"),out port) || port<0 || port>65535) port=8764;
            listener=new TcpListener(IPAddress.Loopback,port);
            listener.Server.ExclusiveAddressUse=true;
            try {listener.Start();}
            catch (SocketException e) {
                if(e.SocketErrorCode!=SocketError.AddressAlreadyInUse && e.SocketErrorCode!=SocketError.AccessDenied) throw;
                listener.Stop();
                listener=new TcpListener(IPAddress.Loopback,0);
                listener.Server.ExclusiveAddressUse=true;
                listener.Start();
            }
            Origin="http://127.0.0.1:"+((IPEndPoint)listener.LocalEndpoint).Port;
            Task.Run((Func<Task>)Accept);
        }
        async Task Accept() {
            while(!closed) {
                TcpClient client;
                try {client=await listener.AcceptTcpClientAsync().ConfigureAwait(false);}
                catch(Exception) {if(closed)return; return;}
                if(!clients.Wait(0)) {client.Close();continue;}
                ServeClient(client);
            }
        }
        async void ServeClient(TcpClient client) {
            try {
                using(client) using(var stream=client.GetStream()) using(var input=new BufferedStream(stream,8192)) {
                    client.ReceiveTimeout=12000; client.SendTimeout=12000;
                    ApiReply reply;
                    try {
                        var request=await Task.Run(()=>ReadRequest(input,stream)).ConfigureAwait(false);
                        reply=await dispatch(request).ConfigureAwait(false);
                    } catch(ProtocolError e) {reply=new ApiReply(e.Status,Json.Write(new {error=new {message=e.Message}}));}
                      catch(Exception) {reply=new ApiReply(503,"{\"error\":{\"message\":\"Local API unavailable\"}}");}
                    string header="HTTP/1.1 "+reply.Status+" "+Reason(reply.Status)+"\r\nContent-Type: "+reply.Type+
                        "\r\n"+reply.ExtraHeaders+"Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n"+(reply.Events==null?"Content-Length: "+reply.Bytes.Length+"\r\n":"")+"\r\n";
                    var bytes=Encoding.ASCII.GetBytes(header);
                    try{
                        await stream.WriteAsync(bytes,0,bytes.Length).ConfigureAwait(false);
                        if(reply.Events!=null)await reply.Events.WriteTo(stream).ConfigureAwait(false);
                        else await stream.WriteAsync(reply.Bytes,0,reply.Bytes.Length).ConfigureAwait(false);
                    }finally{if(reply.Events!=null)reply.Events.Disconnect();}
                }
            } catch(Exception) { } finally {clients.Release();}
        }
        sealed class ProtocolError : Exception {
            internal readonly int Status;
            internal ProtocolError(int status,string text):base(text){Status=status;}
        }
        static string Line(Stream input,ref int remaining) {
            var s=new StringBuilder();
            while(remaining-->0 && s.Length<8192) {
                int b=input.ReadByte();
                if(b<0)throw new EndOfStreamException();
                if(b==13) {if(input.ReadByte()!=10)throw new ProtocolError(400,"Malformed HTTP line");remaining--;return s.ToString();}
                if(b<32 && b!=9)throw new ProtocolError(400,"Malformed HTTP header");
                s.Append((char)b);
            }
            throw new ProtocolError(413,"HTTP headers too large");
        }
        static void CopyBytes(Stream input,Stream output,int length) {
            var buffer=new byte[Math.Min(8192,length)];
            while(length>0) {
                int n=input.Read(buffer,0,Math.Min(buffer.Length,length));
                if(n==0)throw new EndOfStreamException();
                output.Write(buffer,0,n);length-=n;
            }
        }
        internal ApiInput ReadRequest(Stream input,Stream output) {
            int budget=32768;
            var requestLine=Line(input,ref budget).Split(' ');
            if(requestLine.Length!=3 || !requestLine[2].StartsWith("HTTP/1.") || !requestLine[1].StartsWith("/") ||
               requestLine[1].StartsWith("//") || requestLine[1].Contains("\\")) throw new ProtocolError(400,"Invalid local request");
            string method=requestLine[0],path=requestLine[1];
            if(method!="GET" && method!="POST")throw new ProtocolError(405,"Use GET or POST");
            var headers=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
            string line;
            while((line=Line(input,ref budget)).Length>0) {
                int colon=line.IndexOf(':'); if(colon<1)throw new ProtocolError(400,"Malformed header");
                string name=line.Substring(0,colon).Trim().ToLowerInvariant();
                if(headers.ContainsKey(name))throw new ProtocolError(400,"Duplicate HTTP header");
                headers[name]=line.Substring(colon+1).Trim();
            }
            string host; int port=((IPEndPoint)listener.LocalEndpoint).Port;
            if(!headers.TryGetValue("host",out host) || !(host=="127.0.0.1:"+port || String.Equals(host,"localhost:"+port,StringComparison.OrdinalIgnoreCase)))throw new ProtocolError(403,"Invalid loopback host");
            string origin;
            if(headers.TryGetValue("origin",out origin) && origin!="http://"+host)throw new ProtocolError(403,"Invalid request origin");
            string len,transfer;
            bool chunked=headers.TryGetValue("transfer-encoding",out transfer),sized=headers.TryGetValue("content-length",out len);
            int length=0;
            if(chunked && (sized || !String.Equals(transfer,"chunked",StringComparison.OrdinalIgnoreCase)))throw new ProtocolError(400,"Invalid transfer encoding");
            if(sized && (!Int32.TryParse(len,NumberStyles.None,CultureInfo.InvariantCulture,out length) || length<0))throw new ProtocolError(400,"Invalid content length");
            if(length>MaxBody)throw new ProtocolError(413,"Request too large");
            string expect;
            if(headers.TryGetValue("expect",out expect) && expect.Equals("100-continue",StringComparison.OrdinalIgnoreCase)) {
                var cont=Encoding.ASCII.GetBytes("HTTP/1.1 100 Continue\r\n\r\n"); output.Write(cont,0,cont.Length);output.Flush();
            }
            using(var body=new MemoryStream()) {
                if(chunked) {
                    while(true) {
                        string size=Line(input,ref budget).Split(';')[0];
                        if(!Int32.TryParse(size,NumberStyles.AllowHexSpecifier,CultureInfo.InvariantCulture,out length) || length<0)throw new ProtocolError(400,"Invalid chunk");
                        if(length==0) {while(Line(input,ref budget).Length>0){} break;}
                        if(body.Length+length>MaxBody)throw new ProtocolError(413,"Request too large");
                        CopyBytes(input,body,length);
                        if(input.ReadByte()!=13 || input.ReadByte()!=10)throw new ProtocolError(400,"Invalid chunk terminator");
                    }
                } else CopyBytes(input,body,length);
                return new ApiInput{Method=method,Path=path,Headers=headers,Body=Encoding.UTF8.GetString(body.ToArray())};
            }
        }
        static string Reason(int status) {
            switch(status) {case 200:return "OK";case 202:return "Accepted";case 204:return "No Content";case 400:return "Bad Request";case 401:return "Unauthorized";
                case 403:return "Forbidden";case 404:return "Not Found";case 405:return "Method Not Allowed";case 413:return "Payload Too Large";case 429:return "Too Many Requests";case 503:return "Service Unavailable";default:return "Response";}
        }
        public void Dispose() {closed=true;listener.Stop();}
    }
}
