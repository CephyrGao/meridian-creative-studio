using System;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Principal;
namespace MeridianStudio {
    internal static class AgentWake {
        const string Marker="Meridian Creative Studio local Agent schedule";
        internal static object Configure(string utc){
            DateTimeOffset next=default(DateTimeOffset);
            if(utc.Length>0&&!DateTimeOffset.TryParse(utc,CultureInfo.InvariantCulture,DateTimeStyles.None,out next))throw new InvalidDataException("定时唤起时间无效。");
            string path=Assembly.GetExecutingAssembly().Location;
            if(Program.TestReport!=null)return new{configured=utc.Length>0,at=utc,executable=path};
            string sid=WindowsIdentity.GetCurrent().User.Value,name="MeridianStudio-Agent-"+sid;
            dynamic service=Activator.CreateInstance(Type.GetTypeFromProgID("Schedule.Service",true));service.Connect();
            dynamic folder=service.GetFolder("\\"),old=null;
            try{old=folder.GetTask(name);}catch(Exception e){uint code=unchecked((uint)Marshal.GetHRForException(e));if(code!=0x80070002&&code!=0x80070003)throw;}
            if(old!=null&&old.Definition.RegistrationInfo.Description!=Marker)throw new InvalidDataException("已有同名系统计划任务，请先更名。");
            if(utc.Length==0){if(old!=null)folder.DeleteTask(name,0);return new{configured=false};}
            dynamic task=service.NewTask(0);task.RegistrationInfo.Description=Marker;task.RegistrationInfo.Author=WindowsIdentity.GetCurrent().Name;
            task.Principal.UserId=sid;task.Principal.LogonType=3;task.Principal.RunLevel=0;
            task.Settings.StartWhenAvailable=true;task.Settings.DisallowStartIfOnBatteries=false;task.Settings.StopIfGoingOnBatteries=false;task.Settings.ExecutionTimeLimit="PT0S";
            dynamic trigger=task.Triggers.Create(1);trigger.StartBoundary=(next<DateTimeOffset.Now.AddSeconds(4)?DateTimeOffset.Now.AddSeconds(4):next).ToString("yyyy-MM-dd'T'HH:mm:sszzz",CultureInfo.InvariantCulture);trigger.Enabled=true;
            dynamic action=task.Actions.Create(0);action.Path=path;action.Arguments="--schedule-wake";action.WorkingDirectory=Path.GetDirectoryName(path);
            folder.RegisterTaskDefinition(name,task,6,sid,null,3,null);return new{configured=true,at=utc};
        }
    }
}
