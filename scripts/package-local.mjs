import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {webcrypto} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
const dest=resolve(process.argv[2]),root=new URL('../',import.meta.url);
await mkdir(dest,{recursive:true});
const asPath=p=>new URL(p,root);
for(const [src,out] of [['worker/index.js','workbench.mjs'],['scripts/local.mjs','local.mjs'],['scripts/mcp-host.mjs','mcp-host.mjs'],['scripts/research-host.mjs','research-host.mjs'],['scripts/使用说明.md','使用说明.md'],['dist/local/preview.html','preview.html']])await copyFile(asPath(src),join(dest,out));
const launcher=(await readFile(asPath('scripts/Start-Workbench.cmd'),'utf8')).replace(/\r?\n/g,'\r\n');
await writeFile(join(dest,'Start-Workbench.cmd'),launcher);
const context=createContext({crypto:webcrypto,Intl});
for(const n of ['regions','catalog','core','sample','metrics'])runInContext(await readFile(asPath('src/'+n+'.js'),'utf8'),context);
await writeFile(join(dest,'folda-demo.csv'),runInContext('dataCsv(makeSample().data,"USD")',context));
await writeFile(join(dest,'folda-brief.json'),runInContext('JSON.stringify(SAMPLE_BRIEF,null,2)',context));
console.log('Local runtime ready.');

