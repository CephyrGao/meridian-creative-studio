using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("经纬创意 · 出海营销工作台")]
[assembly: AssemblyProduct("Meridian Creative Studio")]
[assembly: AssemblyDescription("多市场创意本地化、人工审核与投放实验分析")]
[assembly: AssemblyVersion("0.8.0.0")]
[assembly: AssemblyFileVersion("0.8.0.1")]
[assembly: AssemblyInformationalVersion("0.8.0-beta.1")]
[assembly: ComVisible(false)]

namespace MeridianStudio {
    internal static class Program {
        internal const string Title = "经纬创意 · 出海营销工作台";
        internal static string DataRoot;
        internal static string RuntimePath;
        internal static string TestReport;
        internal static bool ScheduleWake;
        static EventWaitHandle activate;
        internal static byte[] Resource(string name) {
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
            using (var copy = new MemoryStream()) {
                if (stream == null) throw new InvalidDataException(name);
                stream.CopyTo(copy);
                return copy.ToArray();
            }
        }
        static string Hash(byte[] data) {
            using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(data)).Replace("-", "").ToLowerInvariant();
        }
        static void Extract(string filename, byte[] data) {
            string path = Path.Combine(RuntimePath,filename);
            if (File.Exists(path) && Hash(File.ReadAllBytes(path)) == Hash(data)) return;
            string tmp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            File.WriteAllBytes(tmp,data);
            try {
                if (File.Exists(path)) File.Replace(tmp,path,null);
                else File.Move(tmp,path);
            } catch (IOException) {
                if (!File.Exists(path) || Hash(File.ReadAllBytes(path)) != Hash(data)) throw;
            } finally { if (File.Exists(tmp)) File.Delete(tmp); }
        }
        [STAThread]
        static int Main(string[] args) {
            if(args.Length==1 && args[0]=="--mcp-stdio")return McpProcess.Relay();
            ScheduleWake=args.Length==1&&args[0]=="--schedule-wake";
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try {
                if (args.Length == 2 && args[0] == "--self-test") TestReport = Path.GetFullPath(args[1]);
                DataRoot = TestReport == null ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"MeridianStudio")
                    : Path.Combine(Path.GetDirectoryName(TestReport),"Meridian-QA-" + Guid.NewGuid().ToString("N"));
                byte[] core = Resource("WebView.Core"), loader = Resource("WebView.Loader");
                RuntimePath = Path.Combine(DataRoot,"Runtime",Hash(core).Substring(0,12) + "-" + Hash(loader).Substring(0,12));
                Directory.CreateDirectory(RuntimePath);
                Extract("Microsoft.Web.WebView2.Core.dll",core);
                Extract("WebView2Loader.dll",loader);
                AppDomain.CurrentDomain.AssemblyResolve += (s,e) => new AssemblyName(e.Name).Name == "Microsoft.Web.WebView2.Core"
                    ? Assembly.LoadFrom(Path.Combine(RuntimePath,"Microsoft.Web.WebView2.Core.dll")) : null;
                if(TestReport!=null)return ShowWorkbench();
                using(activate=new EventWaitHandle(false,EventResetMode.AutoReset,@"Local\MeridianStudio.ShowMainWindow.v1")) {
                    bool first;
                    using(var single=new Mutex(false,@"Local\MeridianStudio.Workbench.v1",out first)) {
                        if(!first){if(!ScheduleWake)activate.Set();return 0;}
                        return ShowWorkbench();
                    }
                }
            } catch (Exception e) {
                if (TestReport != null) File.WriteAllText(TestReport,e.ToString(),Encoding.UTF8);
                else MessageBox.Show("工作台未能启动。\n\n" + e.GetBaseException().Message,Title,MessageBoxButtons.OK,MessageBoxIcon.Error);
                return 1;
            }
        }
        [MethodImpl(MethodImplOptions.NoInlining)]
        static int ShowWorkbench() {
            using (var form = new Workbench()) {
                RegisteredWaitHandle registration=null;
                if(activate!=null)form.Shown+=(s,e)=>{
                    registration=ThreadPool.RegisterWaitForSingleObject(activate,(state,timedOut)=>{
                        try{form.BeginInvoke((Action)(()=>{
                            if(form.WindowState==FormWindowState.Minimized)form.WindowState=FormWindowState.Normal;
                            form.Show();form.Activate();
                        }));}catch(InvalidOperationException){}
                    },null,Timeout.Infinite,false);
                };
                try {Application.Run(form);return form.ExitStatus;}
                finally {if(registration!=null)registration.Unregister(null);}
            }
        }
    }
}
