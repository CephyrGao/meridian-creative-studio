using Microsoft.Web.WebView2.Core;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace MeridianStudio {
    internal sealed class Workbench : Form {
        internal int ExitStatus {get;private set;}
        const string Home="https://meridian-workbench.invalid/";
        const string RuntimeHelp="https://developer.microsoft.com/microsoft-edge/webview2/";
        readonly byte[] html=Program.Resource("Meridian.HTML");
        readonly ModelTransport models;
        readonly Dictionary<string,CancellationTokenSource> posts=new Dictionary<string,CancellationTokenSource>();
        readonly Dictionary<string,TaskCompletionSource<ApiReply>> requests=new Dictionary<string,TaskCompletionSource<ApiReply>>();
        readonly Dictionary<string,McpProcess> pipes=new Dictionary<string,McpProcess>();
        readonly Dictionary<string,ApiEventStream> eventStreams=new Dictionary<string,ApiEventStream>();
        readonly Label loading;
        CoreWebView2Controller controller;
        CoreWebView2 browser;
        LoopbackApi api;
        McpPipeServer sharedPipe;
        bool ready,closing;
        System.Windows.Forms.Timer watchdog,agentClock;
        NotifyIcon tray;
        internal Workbench() {
            ServicePointManager.SecurityProtocol=SecurityProtocolType.SystemDefault;
            models=new ModelTransport(Program.TestReport==null?null:new NativeChecks.Fixture(Forward));
            Text=Program.Title;
            Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            AutoScaleMode=AutoScaleMode.Dpi;
            StartPosition=FormStartPosition.CenterScreen;
            var area=Screen.FromPoint(Cursor.Position).WorkingArea;
            MinimumSize=new Size(Math.Min(870,area.Width),Math.Min(580,area.Height));
            Size=new Size(Math.Min(1390,(int)(area.Width*.94)),Math.Min(910,(int)(area.Height*.92)));
            BackColor=Color.FromArgb(245,247,244);
            loading=new Label {Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleCenter,ForeColor=Color.FromArgb(31,75,66),
                Font=new Font("Microsoft YaHei UI",13),Text="经纬创意\n正在打开工作台…"};
            Controls.Add(loading);
            Shown+=async (s,e)=>await Initialize();
            ClientSizeChanged+=(s,e)=>{if(controller!=null && !closing)controller.Bounds=ClientRectangle;};
            Move+=(s,e)=>{if(controller!=null && !closing)controller.NotifyParentWindowPositionChanged();};
            Activated+=(s,e)=>{if(controller!=null && ready && !closing)controller.MoveFocus(CoreWebView2MoveFocusReason.Programmatic);};
            FormClosing+=(s,e)=>Shutdown();
        }
        async Task Initialize() {
            if(Program.TestReport!=null) {
                watchdog=new System.Windows.Forms.Timer {Interval=50000};
                watchdog.Tick+=(s,e)=>FinishTest(false,"Desktop initialization or self-test timed out");
                watchdog.Start();
            }
            try {
                CoreWebView2Environment.SetLoaderDllFolderPath(Program.RuntimePath);
                var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(Program.DataRoot,"WebView"),null);
                if(closing)return;
                controller=await env.CreateCoreWebView2ControllerAsync(Handle);
                if(closing)return;
                browser=controller.CoreWebView2;
                browser.Settings.AreDevToolsEnabled=false;
                browser.Settings.AreDefaultContextMenusEnabled=false;
                browser.Settings.IsStatusBarEnabled=false;
                browser.Settings.AreHostObjectsAllowed=false;
                browser.Settings.IsPasswordAutosaveEnabled=false;
                browser.Settings.IsGeneralAutofillEnabled=false;
                browser.Settings.IsWebMessageEnabled=true;
                browser.Settings.IsZoomControlEnabled=true;
                browser.AddWebResourceRequestedFilter(Home+"*",CoreWebView2WebResourceContext.All);
                browser.WebResourceRequested+=(s,e)=>{
                    var path=new Uri(e.Request.Uri).AbsolutePath;
                    bool root=path=="/" || path=="/index.html";
                    e.Response=env.CreateWebResourceResponse(root?new MemoryStream(html,false):new MemoryStream(),root?200:404,root?"OK":"Not Found",
                        "Content-Type: "+(root?"text/html; charset=utf-8":"text/plain")+"\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff");
                };
                browser.NavigationStarting+=(s,e)=>{
                    Uri uri; if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out uri) || !IsHome(uri))e.Cancel=true;
                };
                browser.NewWindowRequested+=(s,e)=>{
                    e.Handled=true;Uri uri;
                    if(e.IsUserInitiated && Uri.TryCreate(e.Uri,UriKind.Absolute,out uri) && uri.Scheme=="https")OpenWebPage(uri.AbsoluteUri);
                };
                browser.PermissionRequested+=(s,e)=>e.State=e.PermissionKind.ToString()=="FileReadWrite"?CoreWebView2PermissionState.Default:CoreWebView2PermissionState.Deny;
                browser.WebMessageReceived+=OnMessage;
                browser.ProcessFailed+=(s,e)=>{
                    if(!closing&&(e.ProcessFailedKind==CoreWebView2ProcessFailedKind.BrowserProcessExited || e.ProcessFailedKind==CoreWebView2ProcessFailedKind.RenderProcessExited))
                        Fail("界面进程已结束。请重新打开应用以恢复本机项目。",false);
                };
                try {api=new LoopbackApi(Forward);} catch(System.Net.Sockets.SocketException) {api=null;}
                sharedPipe=new McpPipeServer(Forward);
                controller.Bounds=ClientRectangle;
                controller.IsVisible=true;
                browser.Navigate(Home);
            } catch(Exception e) {
                if(closing)return;
                bool missing=e is WebView2RuntimeNotFoundException;
                Fail(missing?"启动工作台需要 Microsoft Edge WebView2 运行时。是否打开微软官方下载页？":"桌面工作台未能初始化。\n"+e.GetBaseException().Message,missing);
            }
        }
        static bool IsHome(Uri uri) {return uri.Scheme=="https" && uri.Authority=="meridian-workbench.invalid" && (uri.AbsolutePath=="/"||uri.AbsolutePath=="/index.html");}
        static void OpenWebPage(string url) {try{Process.Start(new ProcessStartInfo(url){UseShellExecute=true});}catch(System.ComponentModel.Win32Exception){}}
        void Fail(string message,bool runtime) {
            if(Program.TestReport!=null){FinishTest(false,message);return;}
            if(runtime) {if(MessageBox.Show(this,message,Program.Title,MessageBoxButtons.YesNo,MessageBoxIcon.Information)==DialogResult.Yes)OpenWebPage(RuntimeHelp);}
            else MessageBox.Show(this,message,Program.Title,MessageBoxButtons.OK,MessageBoxIcon.Error);
            ExitStatus=1;Close();
        }
        void Post(object data) {if(!closing && browser!=null)browser.PostWebMessageAsJson(Json.Write(data));}
        async void OnMessage(object sender,CoreWebView2WebMessageReceivedEventArgs e) {
            Uri source;
            if(closing || !Uri.TryCreate(e.Source,UriKind.Absolute,out source)||!IsHome(source))return;
            string id="";
            try {
                var data=Json.Read(e.WebMessageAsJson,Int32.MaxValue);
                id=data.Str("id");string op=data.Str("op");
                if(op=="ready") {
                    ready=true;loading.Visible=false;
                    agentClock=new System.Windows.Forms.Timer{Interval=15000};agentClock.Tick+=(a,b)=>Post(new{op="scheduleTick"});agentClock.Start();
                    if(Program.ScheduleWake){tray=new NotifyIcon{Icon=Icon,Text=Program.Title,Visible=true};tray.DoubleClick+=(a,b)=>{Show();WindowState=FormWindowState.Normal;Activate();};
                        var menu=new ContextMenuStrip();menu.Items.Add("打开工作台",null,(a,b)=>{Show();WindowState=FormWindowState.Normal;Activate();});menu.Items.Add("退出",null,(a,b)=>Close());tray.ContextMenuStrip=menu;Hide();}
                    controller.MoveFocus(CoreWebView2MoveFocusReason.Programmatic);
                    if(Program.TestReport!=null)await browser.ExecuteScriptAsync(Encoding.UTF8.GetString(Program.Resource("Meridian.Test")));
                    return;
                }
                if(op=="testResult" && Program.TestReport!=null) {
                    bool ok=data.ContainsKey("ok") && Object.Equals(data["ok"],true);
                    if(ok) {
                        try {
                            using(var preview=File.Create(Path.ChangeExtension(Program.TestReport,".png")))
                                await browser.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,preview);
                            string exported=File.ReadAllText(NativeExport.TestPath,Encoding.UTF8);
                            if(!exported.Contains("桌面验收") || !exported.Contains("12–15s"))throw new IOException("Export was missing the approval or shot list");
                            data["export"]="Verified native Markdown file with recorded approval and storyboard";
                            var backup=Json.Read(File.ReadAllText(Path.Combine(Program.DataRoot,"project-backup.json"),Encoding.UTF8),Int32.MaxValue);
                            if(backup.Str("format")!="meridian-project-backup")throw new IOException("Project backup export missing");
                            await NativeChecks.VerifyInProcess(api,Forward);
                            string mcpToken=data.Str("mcpTestToken");data.Remove("mcpTestToken");
                            await NativeChecks.VerifyMcp(api,Forward,mcpToken);
                            data["mcp"]="Both directions verified through the native bridge and HTTP request parser";
                            data["nativeApi"]="HTTP parsing, native bridge, SDK response, provider probe, creative generation and audit passed with an in-memory provider";
                            try {
                                await NativeChecks.VerifyLoopback(api==null?"":api.Origin);
                                data["tcp"]="Local SDK and provider socket round trip passed";
                            } catch(Exception egress) {
                                var socket=egress.GetBaseException() as System.Net.Sockets.SocketException;
                                if(socket==null || socket.SocketErrorCode!=System.Net.Sockets.SocketError.AccessDenied)throw;
                                data["tcp"]="Not verified: loopback client connections are denied by this execution environment";
                            }
                        } catch(Exception failure) {ok=false;data["ok"]=false;data["nativeApi"]=failure.GetBaseException().Message;}
                    }
                    FinishTest(ok,Json.Write(data));return;
                }
                if(id.Length==0 || id.Length>100)return;
                if(op=="apiStream"){
                    ApiEventStream output;
                    if(eventStreams.TryGetValue(id,out output)){
                        if(data.ContainsKey("end"))output.End();
                        else if(!output.Offer(Convert.FromBase64String(data.Str("bytes"))))output.End();
                    }
                    return;
                }
                if(op=="apiResult") {
                    TaskCompletionSource<ApiReply> tcs;
                    if(requests.TryGetValue(id,out tcs)) {
                        int status=Convert.ToInt32(data["status"]);
                        var reply=new ApiReply(status>=200&&status<=599?status:500,data.Str("body"));
                        if(data.ContainsKey("streaming")&&Object.Equals(data["streaming"],true)){
                            var stream=new ApiEventStream(()=>{if(!closing)try{BeginInvoke((Action)(()=>{eventStreams.Remove(id);Post(new{op="abortApi",id});}));}catch(InvalidOperationException){}});
                            eventStreams[id]=stream;reply.Events=stream;reply.Type="text/event-stream; charset=utf-8";
                        }
                        if(data.Str("allow")=="GET")reply.ExtraHeaders+="Allow: GET\r\n";
                        if(data.Str("allow")=="POST")reply.ExtraHeaders+="Allow: POST\r\n";
                        if(data.Str("challenge")=="Bearer realm=\"Meridian Studio\"")reply.ExtraHeaders+="WWW-Authenticate: Bearer realm=\"Meridian Studio\"\r\n";
                        tcs.TrySetResult(reply);
                    }
                } else if(op=="saveText") {
                    try {bool saved=NativeExport.Save(this,data.Str("name"),data.Str("text"));Post(new{op="reply",id,value=new{saved}});}
                    catch(Exception) {Post(new{op="reply",id,error="文件未能保存，请检查目标目录权限、可用空间及文件占用情况。"});}
                } else if(op=="cancel") {CancellationTokenSource c;if(posts.TryGetValue(id,out c))c.Cancel();}
                else if(op=="config") {
                    var env=await models.Configuration(data.ContainsKey("local")&&Object.Equals(data["local"],true),api==null?"":api.Origin,sharedPipe==null?"":sharedPipe.Path);
                    Post(new{op="reply",id,value=env});
                } else if(op=="scheduleWake"){
                    try{var value=await Task.Run(()=>AgentWake.Configure(data.Str("at")));Post(new{op="reply",id,value});}
                    catch(Exception ex){Post(new{op="reply",id,error=ex is InvalidDataException?ex.Message:"Windows 未能更新任务计划。请检查任务计划程序服务与当前账户权限。"});}
                } else if(op=="research"){
                    using(var cancel=new CancellationTokenSource(TimeSpan.FromSeconds(27))){
                        posts[id]=cancel;try{var result=await ResearchTransport.Read((Dictionary<string,object>)data["spec"],cancel.Token);Post(new{op="reply",id,value=result});}
                        catch(Exception failure){Post(new{op="reply",id,error=failure is InvalidDataException?failure.Message:"联网请求未完成，请检查网络和地址。"});}
                        finally{posts.Remove(id);}
                    }
                } else if(op=="mcpStdio"){
                    var args=(Dictionary<string,object>)data["args"];string action=data.Str("action");
                    using(var cancel=new CancellationTokenSource(TimeSpan.FromMinutes(3))){
                        posts[id]=cancel;
                        try{
                            object value;McpProcess pipe;
                            if(action=="open"){
                                if(pipes.Count>=16)throw new InvalidDataException("stdio 连接已满。");
                                string key=Guid.NewGuid().ToString("N");
                                var opened=await Task.Run(()=>new McpProcess(args));if(closing||cancel.IsCancellationRequested){opened.Dispose();return;}
                                pipes[key]=opened;value=new{id=key};
                            }else if(action=="close"){
                                if(pipes.TryGetValue(args.Str("id"),out pipe)){pipes.Remove(args.Str("id"));pipe.Dispose();}value=new{};
                            }else if(action=="send"&&pipes.TryGetValue(args.Str("id"),out pipe))value=await pipe.Send((Dictionary<string,object>)args["message"],cancel.Token);
                            else throw new InvalidDataException("stdio 连接已失效，请重新连接。");
                            Post(new{op="reply",id,value});
                        }catch(Exception failure){Post(new{op="reply",id,error=failure is InvalidDataException?failure.Message:"stdio 连接中断，请核对程序和启动参数。"});}
                        finally{posts.Remove(id);}
                    }
                } else if(op=="post" || op=="mcpHttp") {
                    using(var cancel=op=="mcpHttp"&&data.Str("method")=="GET"?new CancellationTokenSource():new CancellationTokenSource(TimeSpan.FromMinutes(8.5))) {
                        if(posts.ContainsKey(id))return;
                        posts[id]=cancel;
                        try{var value=op=="mcpHttp"?await models.McpHttp(data,Post,cancel.Token):await models.Post(data,cancel.Token);Post(new{op="reply",id,value});}
                        catch(Exception failure) when(op=="mcpHttp"){Post(new{op="reply",id,error=failure is InvalidDataException?failure.Message:"MCP 连接中断，请检查服务地址和网络。"});}
                        finally{posts.Remove(id);}
                    }
                }
            } catch(Exception) {
                if(!closing)Post(new{op="reply",id,error="模型连接未完成，请核对服务地址和网络。"});
            }
        }
        Task<ApiReply> Forward(ApiInput request) {
            var tcs=new TaskCompletionSource<ApiReply>(TaskCreationOptions.RunContinuationsAsynchronously);
            if(closing || !IsHandleCreated)return Task.FromResult(new ApiReply(503,"{\"error\":\"App closing\"}"));
            try {BeginInvoke((Action)(async()=>{
                if(!ready || closing) {tcs.TrySetResult(new ApiReply(503,"{\"error\":\"App starting\"}"));return;}
                string path=request.Path.Split('?')[0];
                if(request.Method=="GET" && (path=="/" || path=="/index.html")){tcs.TrySetResult(new ApiReply(200,html,"text/html; charset=utf-8"));return;}
                string id="api-"+Guid.NewGuid().ToString("N");
                requests[id]=tcs;
                try {
                    var pass=new Dictionary<string,string>();
                    foreach(string name in new[]{"content-type","authorization","origin","accept","x-session-model-key","x-model-provider","x-model-base-url","mcp-protocol-version","mcp-method","mcp-name","mcp-session-id","x-meridian-ui","x-meridian-mcp-token"})
                        if(request.Headers.ContainsKey(name))pass[name]=request.Headers[name];
                    string origin="http://"+request.Headers["host"];
                    Post(new{op="api",id,url=origin+request.Path,method=request.Method,headers=pass,body=request.Body,pipe=request.FromPipe});
                    using(var timer=new CancellationTokenSource()) {
                        var delay=Task.Delay(TimeSpan.FromMinutes(8.6),timer.Token);
                        if(await Task.WhenAny(tcs.Task,delay)==delay) {
                            tcs.TrySetResult(new ApiReply(504,"{\"error\":{\"message\":\"Local API timed out\"}}"));Post(new{op="abortApi",id});
                        } else timer.Cancel();
                    }
                } catch(Exception) {tcs.TrySetResult(new ApiReply(503,"{\"error\":\"App unavailable\"}"));}
                finally {requests.Remove(id);}
            }));}
            catch(InvalidOperationException){tcs.TrySetResult(new ApiReply(503,"{\"error\":\"App closing\"}"));}
            return tcs.Task;
        }
        void FinishTest(bool ok,string message) {
            if(closing)return;
            if(watchdog!=null)watchdog.Stop();
            File.WriteAllText(Program.TestReport,message,new UTF8Encoding(false));
            ExitStatus=ok?0:1;BeginInvoke((Action)Close);
        }
        void Shutdown() {
            if(closing)return;
            closing=true;
            if(watchdog!=null)watchdog.Dispose();
            if(agentClock!=null)agentClock.Dispose();if(tray!=null)tray.Dispose();
            if(api!=null)api.Dispose();
            if(sharedPipe!=null)sharedPipe.Dispose();
            foreach(var c in new List<CancellationTokenSource>(posts.Values))c.Cancel();
            foreach(var t in new List<TaskCompletionSource<ApiReply>>(requests.Values))t.TrySetResult(new ApiReply(503,"{\"error\":\"App closing\"}"));
            foreach(var p in pipes.Values)p.Dispose();pipes.Clear();
            foreach(var s in eventStreams.Values)s.End();eventStreams.Clear();
            if(controller!=null)controller.Close();
            models.Dispose();
        }
    }
}
