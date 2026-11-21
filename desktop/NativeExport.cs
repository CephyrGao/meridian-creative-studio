using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace MeridianStudio {
    internal static class NativeExport {
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
        static extern bool MoveFileEx(string source,string destination,uint flags);
        internal static string TestPath {get{return Path.Combine(Program.DataRoot,"review-export.md");}}
        internal static bool Save(IWin32Window owner,string name,string text) {
            string safe=Path.GetFileName(name);
            foreach(char ch in Path.GetInvalidFileNameChars())safe=safe.Replace(ch,'_');
            string ext=Path.GetExtension(safe).ToLowerInvariant();
            string filter=ext==".md"?"Markdown 文档 (*.md)|*.md":ext==".json"?"JSON 文件 (*.json)|*.json":ext==".csv"?"CSV 表格 (*.csv)|*.csv":"文本文件 (*.txt)|*.txt";
            string destination;
            if(Program.TestReport!=null)destination=ext==".json"?Path.Combine(Program.DataRoot,"project-backup.json"):TestPath;
            else using(var picker=new SaveFileDialog{Title="导出文件",FileName=safe,DefaultExt=ext.TrimStart('.'),AddExtension=true,
                Filter=filter,OverwritePrompt=true,RestoreDirectory=true,CheckPathExists=true}) {
                if(picker.ShowDialog(owner)!=DialogResult.OK)return false;
                destination=picker.FileName;
            }
            string pending=Path.Combine(Path.GetDirectoryName(destination),"meridian-"+Guid.NewGuid().ToString("N")+".tmp");
            try {
                using(var file=new FileStream(pending,FileMode.CreateNew,FileAccess.Write,FileShare.None))
                using(var writer=new StreamWriter(file,new UTF8Encoding(false))) {
                    writer.Write(text);writer.Flush();file.Flush(true);
                }
                const uint replaceExisting=1, writeThrough=8;
                if(!MoveFileEx(pending,destination,replaceExisting|writeThrough))throw new Win32Exception(Marshal.GetLastWin32Error());
                return true;
            } finally {if(File.Exists(pending))File.Delete(pending);}
        }
    }
}
