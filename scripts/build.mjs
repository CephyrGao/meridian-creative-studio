import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>readFile(join(root,name),'utf8');
const front=['providers','regions','catalog','core','sample','metrics','audit','trace-format','mcp-wire','mcp-stream','mcp-client','agent-skills','settings-ui','ui','target-picker','views','diagnostics','diagnostic-ui','task-budget','review-ui','mcp-ui','agent-execute','agent-runner','agent-ui','quality','quality-ui','document-readers','document-legacy','space-store','space-web','space-tools','space-schedule','space-ui','space-actions','project-backup','project-restore','actions'];
const [shell,css,scripts,chat,model]=await Promise.all([read('src/index.html'),read('src/styles.css'),Promise.all(front.map(n=>read('src/'+n+'.js'))),read('src/chat-api.js'),read('src/model.mjs')]);
const pdf=await read('vendor/pdf-engine.json');
const html=shell.replace('/*@PDF@*/',()=>pdf.replace(/</g,'\\u003c')).replace('/*@CSS@*/',()=>css).replace('/*@JS@*/',()=>scripts.join('\n').replace(/<\/script/gi,'<\\/script'));
const worker=[...['providers','regions','catalog','trace-format','mcp-wire','mcp-stream'].map(n=>scripts[front.indexOf(n)]),await read('src/mcp-server.js'),await read('src/mcp-sessions.js'),await read('src/budget-server.js'),chat,await read('src/agent-model.js'),model,'const APP_HTML='+JSON.stringify(html)+';','export default {fetch(request,env={}){return handleRequest(request,env,APP_HTML);}};',''].join('\n');
await Promise.all(['worker','dist/server','dist/local','dist/.openai'].map(dir=>mkdir(join(root,dir),{recursive:true})));
await writeFile(join(root,'worker/index.js'),worker);await writeFile(join(root,'dist/server/index.js'),worker);
await writeFile(join(root,'dist/local/preview.html'),html);
const manifestOutput=join(root,'dist/.openai/hosting.json');
try { await copyFile(join(root,'.openai/hosting.json'),manifestOutput); }
catch (error) {
  if (error.code!=='ENOENT') throw error;
  await writeFile(manifestOutput,'{}\n');
}
console.log('Built self-contained Worker and local preview ('+Buffer.byteLength(html)+' bytes).');

