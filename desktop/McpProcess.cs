using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using Microsoft.Win32.SafeHandles;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace MeridianStudio {
    internal sealed class McpProcess : IDisposable {
        readonly Process child;
        readonly Stream input;
        readonly object write=new object(),gate=new object();
        readonly Dictionary<string,TaskCompletionSource<object>> pending=new Dictionary<string,TaskCompletionSource<object>>();
        bool closed;
        static readonly Encoding Utf8=new UTF8Encoding(false);
        static string Quote(string value) {
            var word=new StringBuilder("\"");int backslashes=0;
            foreach(char c in value) {
                if(c=='\\'){backslashes++;continue;}
                if(c=='"')word.Append('\\',backslashes*2+1);
                else word.Append('\\',backslashes);
                word.Append(c);backslashes=0;
            }
            return word.Append('\\',backslashes*2).Append('"').ToString();
        }
        static string[] Args(Dictionary<string,object> config) {
            object raw;
            if(!config.TryGetValue("args",out raw)||!(raw is IList))throw new InvalidDataException("启动参数须为字符串数组。");
            var list=((IList)raw).Cast<object>().Select(v=>v as string).ToArray();
            if(list.Length>128||list.Any(v=>v==null||v.Length>8192||v.IndexOf('\0')>=0))throw new InvalidDataException("启动参数无效。");
            return list;
        }
        internal McpProcess(Dictionary<string,object> config) {
            string command=config.Str("command");var args=Args(config);
            if(String.IsNullOrWhiteSpace(command)||command.Length>1024||command.IndexOfAny(new[]{'\r','\n','\0'})>=0)throw new InvalidDataException("启动命令无效。");
            object raw;var env=config.TryGetValue("env",out raw)?raw as Dictionary<string,object>:null;
            if(env==null||env.Count>100)throw new InvalidDataException("环境变量须为 JSON 对象。");
            if(Regex.IsMatch(command,@"^(npx|npm)(\.cmd)?$",RegexOptions.IgnoreCase)){
                string node=(Environment.GetEnvironmentVariable("PATH")??"").Split(Path.PathSeparator).Select(dir=>Path.Combine(dir.Trim('"'),"node.exe")).FirstOrDefault(File.Exists);
                string script=node==null?null:Path.Combine(Path.GetDirectoryName(node),"node_modules","npm","bin",command.StartsWith("npx",StringComparison.OrdinalIgnoreCase)?"npx-cli.js":"npm-cli.js");
                if(script==null||!File.Exists(script))throw new InvalidDataException("未找到 npm，请安装 Node.js 或填写程序的完整路径。");
                command=node;args=new[]{script}.Concat(args).ToArray();
            }
            var start=new ProcessStartInfo(command,String.Join(" ",args.Select(Quote))) {UseShellExecute=false,CreateNoWindow=true,
                RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Utf8,StandardErrorEncoding=Utf8};
            var allow=new HashSet<string>(new[]{"PATH","SYSTEMROOT","WINDIR","COMSPEC","PATHEXT","HOME","USERPROFILE","APPDATA","LOCALAPPDATA","TEMP","TMP","PROGRAMFILES","PROGRAMFILES(X86)","PROGRAMDATA","HOMEDRIVE","HOMEPATH","LANG"},StringComparer.OrdinalIgnoreCase);
            foreach(string key in start.EnvironmentVariables.Keys.Cast<string>().ToArray())if(!allow.Contains(key))start.EnvironmentVariables.Remove(key);
            foreach(var e in env){
                var value=e.Value as string;
                if(!Regex.IsMatch(e.Key,@"^[A-Za-z_]\w*$")||value==null||value.Length>8192||value.IndexOf('\0')>=0)throw new InvalidDataException("环境变量名称或值无效。");
                start.EnvironmentVariables[e.Key]=value;
            }
            child=new Process{StartInfo=start};
            try{child.Start();}catch(Exception){child.Dispose();throw new InvalidDataException("无法启动本地 MCP 程序，请核对命令、安装位置和 PATH。");}
            input=child.StandardInput.BaseStream;
            Task.Run(async()=>{try{await child.StandardError.BaseStream.CopyToAsync(Stream.Null).ConfigureAwait(false);}catch{}});
            Task.Run((Func<Task>)ReadOutput);
        }
        async Task ReadOutput() {
            var buffer=new char[8192];var line=new StringBuilder();
            try{
                int count;
                while((count=await child.StandardOutput.ReadAsync(buffer,0,buffer.Length).ConfigureAwait(false))>0){
                    for(int i=0;i<count;i++){
                        if(buffer[i]!='\n'){if(line.Length>=4194304)throw new InvalidDataException();line.Append(buffer[i]);continue;}
                        string raw=line.ToString().Trim();line.Clear();if(raw.Length==0)continue;
                        var reply=Json.Read(raw);object id;TaskCompletionSource<object> completion;
                        if(reply.Str("jsonrpc")!="2.0")throw new InvalidDataException();
                        if(reply.TryGetValue("id",out id)&&(reply.ContainsKey("result")||reply.ContainsKey("error"))){
                            lock(gate)pending.TryGetValue(Json.Write(id),out completion);
                            if(completion!=null)completion.TrySetResult(reply);
                        }
                    }
                }
            }catch(Exception){}finally{Dispose();}
        }
        internal async Task<object> Send(Dictionary<string,object> message,CancellationToken cancel) {
            object id;bool expects=message.TryGetValue("id",out id);
            string key=expects?Json.Write(id):"";var tcs=new TaskCompletionSource<object>(TaskCreationOptions.RunContinuationsAsynchronously);
            lock(gate){if(closed)throw new InvalidDataException("stdio 子进程已退出，请重新连接。");if(expects)pending.Add(key,tcs);}
            using(cancel.Register(()=>{
                tcs.TrySetCanceled();
                if(expects)Task.Run(()=>{try{var bytes=Utf8.GetBytes(Json.Write(new{jsonrpc="2.0",method="notifications/cancelled",@params=new{requestId=id}})+"\n");
                    lock(write){input.Write(bytes,0,bytes.Length);input.Flush();}}catch{}});
            }))try{
                cancel.ThrowIfCancellationRequested();
                byte[] bytes=Utf8.GetBytes(Json.Write(message)+"\n");
                await Task.Run(()=>{lock(write){input.Write(bytes,0,bytes.Length);input.Flush();}},cancel).ConfigureAwait(false);
                return new {status=expects?200:202,rpc=expects?await tcs.Task.ConfigureAwait(false):null};
            }finally{if(expects)lock(gate)pending.Remove(key);}
        }
        public void Dispose(){
            lock(gate){if(closed)return;closed=true;foreach(var t in pending.Values)t.TrySetException(new InvalidDataException("stdio 子进程已退出。"));pending.Clear();}
            try{input.Close();}catch{}
            Task.Run(()=>{try{if(!child.WaitForExit(500))child.Kill();}catch{}finally{child.Dispose();}});
        }
        [DllImport("kernel32.dll",EntryPoint="CreateFileW",CharSet=CharSet.Unicode,SetLastError=true)]
        static extern SafeFileHandle OpenLocalPipe(string path,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
        static FileStream ConnectPipe(string path){
            var timer=Stopwatch.StartNew();
            while(true){
                var handle=OpenLocalPipe(path,0xC0000000,0,IntPtr.Zero,3,0x00110000,IntPtr.Zero);
                if(!handle.IsInvalid)return new FileStream(handle,FileAccess.ReadWrite,4096,false);
                int code=Marshal.GetLastWin32Error();handle.Dispose();
                if(code!=2&&code!=231)throw new System.ComponentModel.Win32Exception(code);
                if(timer.ElapsedMilliseconds>=3500)throw new TimeoutException();
                Thread.Sleep(30);
            }
        }
        internal static int Relay() {
            try{
                string name=Environment.GetEnvironmentVariable("MERIDIAN_MCP_PIPE")??"",token=Environment.GetEnvironmentVariable("MERIDIAN_MCP_TOKEN");
                const string prefix=@"\\.\pipe\";
                if(!name.StartsWith(prefix,StringComparison.OrdinalIgnoreCase)||!Regex.IsMatch(name.Substring(prefix.Length),@"^meridian-mcp-[0-9a-f]+$")||String.IsNullOrWhiteSpace(token))throw new InvalidDataException();
                using(var stdin=new StreamReader(Console.OpenStandardInput(),Utf8))
                using(var stdout=new StreamWriter(Console.OpenStandardOutput(),Utf8){AutoFlush=true,NewLine="\n"}){
                    string line;
                    while((line=stdin.ReadLine())!=null){
                        if(String.IsNullOrWhiteSpace(line))continue;
                        object id=null;bool expects=true;string stage="读取请求";Dictionary<string,object> reply=null;
                        try{
                            if(line.Length>160000)throw new InvalidDataException();
                            var message=Json.Read(line);expects=message.TryGetValue("id",out id);
                            stage="连接工作台进程";using(var pipe=ConnectPipe(name)){
                                stage="发送请求";
                                var bytes=Utf8.GetBytes(Json.Write(new{token,message})+"\n");pipe.Write(bytes,0,bytes.Length);pipe.Flush();
                                stage="读取共享结果";var text=new StreamReader(pipe,Utf8).ReadLine();if(String.IsNullOrEmpty(text))throw new EndOfStreamException();if(text!="null")reply=Json.Read(text);
                            }
                        }catch(Exception e){reply=new Dictionary<string,object>{{"jsonrpc","2.0"},{"id",id},{"error",new{code=-32000,message=stage+"失败（"+e.GetType().Name+"），请检查工作台是否仍在共享项目。"}}};}
                        if(expects&&reply!=null)stdout.WriteLine(Json.Write(reply));
                    }
                }
                return 0;
            }catch{Console.Error.WriteLine("请从经纬创意工作台复制 stdio 配置，并保持项目共享开启。");return 1;}
        }
    }
}
