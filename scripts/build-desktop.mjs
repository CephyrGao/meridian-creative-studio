import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../',import.meta.url));
const out = join(root,'dist','desktop');
const src = join(root,'desktop');
const target = resolve(process.argv[2] || join(out,'Meridian-Studio.exe'));
const read = file => readFile(join(root,file),'utf8');
async function existing(candidates,label) {
  for(const candidate of candidates.filter(Boolean)){
    try { await access(candidate); return candidate; } catch {}
  }
  throw Error('Could not find '+label+'. Supply its path in the build environment.');
}
function run(program,args) {
  const p=spawnSync(program,args,{cwd:root,encoding:'utf8',windowsHide:true});
  if(p.stdout)process.stdout.write(p.stdout);
  if(p.stderr)process.stderr.write(p.stderr);
  if(p.error)throw p.error;
  if(p.status!==0)throw Error(program+' exited with '+p.status);
}

await mkdir(out,{recursive:true});
await mkdir(dirname(target),{recursive:true});
run(process.execPath,['scripts/build.mjs']);
run('python',['desktop/make-icon.py']);
const models=(await Promise.all(['src/providers.js','src/regions.js','src/catalog.js','src/trace-format.js','src/mcp-wire.js','src/mcp-stream.js','src/mcp-server.js','src/mcp-sessions.js','src/budget-server.js','src/chat-api.js','src/agent-model.js','src/model.mjs'].map(read))).join('\n');
const bridge=(await read('desktop/bridge.js')).replace('/*@MODEL@*/',()=>models);
const page=(await read('dist/local/preview.html')).replace('</head>',()=>'<script>'+bridge.replace(/<\/script/gi,'<\\/script')+'</script></head>');
await writeFile(join(out,'workbench.html'),page);

const fw=process.env.MERIDIAN_FRAMEWORK || join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319');
const x86=process.env['ProgramFiles(x86)'];
const csc=await existing([process.env.MERIDIAN_CSC,join(x86,'Microsoft Visual Studio','18','BuildTools','MSBuild','Current','Bin','Roslyn','csc.exe'),join(fw,'csc.exe')],'C# compiler');
const sdk=await existing([process.env.WEBVIEW2_SDK_CORE,join(process.env.ProgramFiles,'Microsoft Office','root','Office16','ADDINS','Microsoft Power Query for Excel Integrated','bin','Microsoft.Web.WebView2.Core.dll')],'Microsoft.Web.WebView2.Core.dll');
const loader=await existing([process.env.WEBVIEW2_SDK_LOADER,join(dirname(sdk),'WebView2Loader.dll')],'x64 WebView2Loader.dll');
const fixtureJson=await read('desktop/document-fixtures.json');
const smoke=(await read('desktop/smoke.js')).replace('/*@DOCUMENTS@*/{}',()=>fixtureJson.trim());
await writeFile(join(out,'smoke.js'),smoke);
run(process.execPath,['--check',join(out,'smoke.js')]);
const framework=['mscorlib','System','System.Core','System.Drawing','System.Windows.Forms','System.Web.Extensions','System.Net.Http','Microsoft.CSharp'];
const references=await Promise.all(framework.map(name=>existing([join(fw,name+'.dll')],name)));
run(csc,['/nologo','/utf8output','/codepage:65001','/noconfig','/nostdlib+','/optimize+','/target:winexe','/platform:x64',
  '/out:'+target,'/win32manifest:'+join(src,'desktop.manifest'),'/win32icon:'+join(out,'Meridian.ico'),
  ...[...references,sdk].map(f=>'/reference:'+f),
  '/resource:'+join(out,'workbench.html')+',Meridian.HTML','/resource:'+join(out,'smoke.js')+',Meridian.Test',
  '/resource:'+sdk+',WebView.Core','/resource:'+loader+',WebView.Loader',
  ...['Program.cs','McpProcess.cs','McpPipeServer.cs','Workbench.cs','LoopbackApi.cs','ModelTransport.cs','ResearchTransport.cs','AgentWake.cs','NativeChecks.cs','NativeExport.cs'].map(f=>join(src,f))]);
console.log(target);

