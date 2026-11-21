const spaceFileAccept='.docx,.doc,.xlsx,.xls,.pdf,.csv,.tsv,.txt,.md,.json';
const docSupported=name=>/\.(docx?|xlsx?|pdf|csv|tsv|txt|md|json)$/i.test(name);
const docLimit=32*1024*1024;
let localPdfPromise;
function docBytes64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function docExpand(bytes,format,max){
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)).getReader(),chunks=[];let count=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>max)throw Error('文件解压后超过读取上限。');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  const out=new Uint8Array(count);let pos=0;for(const chunk of chunks){out.set(chunk,pos);pos+=chunk.length;}return out;
}
async function docPdfEngine(){
  if(!localPdfPromise)localPdfPromise=(async()=>{
    const bundle=JSON.parse(document.getElementById('workspace-pdf-engine').textContent);
    const unpack=s=>docExpand(docBytes64(s),'gzip',5*1024*1024);
    const moduleUrl=async s=>URL.createObjectURL(new Blob([await unpack(s)],{type:'text/javascript'}));
    const [main,worker]=await Promise.all([moduleUrl(bundle.main),moduleUrl(bundle.worker)]);
    const pdf=await import(main);pdf.GlobalWorkerOptions.workerSrc=worker;
    class Assets{async fetch({kind,filename}){const s=bundle.assets[kind+'/'+filename];if(!s)throw Error('PDF 资源不存在。');return unpack(s);}}
    return {pdf,Assets};
  })().catch(e=>{localPdfPromise=null;throw e;});
  return localPdfPromise;
}
class SpaceDocument {
  constructor(){this.parts=[];this.chars=0;this.partial=false;this.notes=[];}
  add(label,value){
    const text=String(value||'').replace(/\u0000/g,'').trim();if(!text)return;
    let i=0;
    while(i<text.length){
      if(this.chars>=400000||this.parts.length>=2200){this.partial=true;return;}
      let end=Math.min(i+3200,text.length,i+400000-this.chars);
      const line=text.lastIndexOf('\n',end-1);if(end<text.length&&line>i+1200)end=line+1;
      const chunk=text.slice(i,end);this.parts.push({label:label+(i?'（续）':''),text:chunk});this.chars+=chunk.length;i=end;
    }
  }
}
function docZip(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),len=bytes.length;
  const u16=n=>view.getUint16(n,true),u32=n=>view.getUint32(n,true);
  let end=len-22;for(;end>=Math.max(0,len-65557);end--)if(u32(end)===0x06054b50&&end+22+u16(end+20)===len)break;
  if(end<0||u32(end)!==0x06054b50)throw Error('Office 文件包损坏或已加密。');
  const count=u16(end+10),items=new Map();let at=u32(end+16),expanded=0;
  if(count>14000)throw Error('Office 文件包含过多部件。');
  const decoder=new TextDecoder();
  for(let i=0;i<count;i++){
    if(at+46>len||u32(at)!==0x02014b50)throw Error('Office 文件目录无效。');
    const nameSize=u16(at+28),name=decoder.decode(bytes.subarray(at+46,at+46+nameSize));
    items.set(name,{flags:u16(at+8),method:u16(at+10),size:u32(at+20),raw:u32(at+24),start:u32(at+42)});
    at+=46+nameSize+u16(at+30)+u16(at+32);
  }
  return {items,async xml(name){
    const e=items.get(name);if(!e)return null;
    if(e.flags&1)throw Error('请先解锁 Office 文件再导入。');
    const start=e.start;
    if(start+30>len||u32(start)!==0x04034b50||e.raw>32*1024*1024||(expanded+=e.raw)>96*1024*1024)throw Error('Office 部件无效或过大。');
    const a=start+30+u16(start+26)+u16(start+28);if(a+e.size>len)throw Error('Office 部件不完整。');
    let data=bytes.subarray(a,a+e.size);
    if(e.method===8)data=await docExpand(data,'deflate-raw',e.raw);
    else if(e.method!==0)throw Error('该 Office 压缩方式不受支持。');
    if(data.length!==e.raw)throw Error('Office 文件内容不完整。');
    const encoding=data[0]===255&&data[1]===254?'utf-16le':data[0]===254&&data[1]===255?'utf-16be':'utf-8';
    const text=new TextDecoder(encoding).decode(data);
    if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('无法处理含外部实体的 Office 文件。');
    const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('Office XML 部件格式无效。');return doc;
  }};
}
const docNodes=(root,name)=>Array.from(root?.getElementsByTagNameNS('*',name)||[]);
const docJoined=(node,name)=>docNodes(node,name).map(x=>x.textContent).join('');
async function docWord(zip,out){
  const main=await zip.xml('word/document.xml');if(!main)throw Error('未找到 Word 正文。');
  function paragraphs(root,area){
    let paragraph=0,table=0,buffer=[],first=1;
    const flush=()=>{if(buffer.length)out.add(`${area} · 段落 ${first}–${paragraph}`,buffer.join('\n'));buffer=[];};
    const words=n=>Array.from(n.getElementsByTagName('*')).map(e=>e.localName==='t'?e.textContent:e.localName==='tab'?'\t':e.localName==='br'?'\n':'').join('');
    function walk(n){
      if(out.partial)return;
      if(n.localName==='p'){
        const t=words(n).trim();if(t){if(!buffer.length)first=paragraph+1;paragraph++;buffer.push(t);if(buffer.length>=12||buffer.join('').length>=2600)flush();}return;
      }
      if(n.localName==='tbl'){flush();table++;let row=0;
        for(const tr of docNodes(n,'tr')){row++;const cells=Array.from(tr.children).filter(c=>c.localName==='tc').map(c=>docNodes(c,'p').map(words).join(' '));out.add(`${area} · 表 ${table} 第 ${row} 行`,cells.join('\t'));if(out.partial)break;}return;
      }
      for(const c of n.children||[])walk(c);
    }
    walk(root.documentElement);flush();
  }
  paragraphs(main,'正文');
  for(const path of zip.items.keys())if(/^word\/(header|footer)\d+\.xml$/.test(path)&&!out.partial)paragraphs(await zip.xml(path),path.includes('header')?'页眉':'页脚');
}
function docExcelDate(serial,mode){
  const ms=(serial-(mode?24107:serial<60?25568:25569))*86400000;
  const d=new Date(Math.round(ms/1000)*1000);return Number.isFinite(d.getTime())?d.toISOString().replace('T',' ').replace(' 00:00:00.000Z','').replace('.000Z',''):String(serial);
}
async function docExcel(zip,out){
  const book=await zip.xml('xl/workbook.xml'),rels=await zip.xml('xl/_rels/workbook.xml.rels');
  if(!book||!rels)throw Error('缺少 Excel 工作簿目录。');
  const paths=new Map(docNodes(rels,'Relationship').filter(n=>n.getAttribute('TargetMode')!=='External').map(n=>[n.getAttribute('Id'),new URL(n.getAttribute('Target'),'https://office.invalid/xl/workbook.xml').pathname.slice(1)]));
  const shared=docNodes(await zip.xml('xl/sharedStrings.xml'),'si').map(n=>docJoined(n,'t'));
  const styles=await zip.xml('xl/styles.xml'),formats=new Map(docNodes(styles,'numFmt').map(n=>[+n.getAttribute('numFmtId'),n.getAttribute('formatCode')]));
  const xfs=docNodes(styles,'cellXfs')[0],dates=Array.from(xfs?.children||[]).map(x=>{const k=+x.getAttribute('numFmtId');return k>=14&&k<=22||k>=45&&k<=47||/[ymdhis]/i.test((formats.get(k)||'').replace(/"[^"]*"|\\.|(\[[^\]]+\])/g,''));});
  const mode=['1','true'].includes(docNodes(book,'workbookPr')[0]?.getAttribute('date1904'));
  for(const sheet of docNodes(book,'sheet')){
    const rel=Array.from(sheet.attributes).find(a=>a.localName==='id')?.value,name=sheet.getAttribute('name')||'工作表',path=paths.get(rel);
    if(!path||!zip.items.has(path))continue;
    const xml=await zip.xml(path);let lines=[],first='',last='';
    const flush=()=>{if(lines.length)out.add(`${name} · 行 ${first}–${last}`,lines.join('\n'));lines=[];};
    for(const row of docNodes(xml,'row')){
      const cells=[];
      for(const c of Array.from(row.children).filter(n=>n.localName==='c')){
        const address=c.getAttribute('r')||'',type=c.getAttribute('t'),v=docNodes(c,'v')[0]?.textContent;
        let s=type==='inlineStr'?docJoined(c,'t'):type==='s'?shared[+v]:type==='b'?(v==='1'?'TRUE':'FALSE'):v;
        if(type!=='s'&&v!=null&&(!type||type==='n')&&dates[+c.getAttribute('s')])s=docExcelDate(Number(v),mode);
        if(s==null){const formula=docNodes(c,'f')[0];if(formula)s='='+formula.textContent;}
        if(s!==undefined&&s!==null&&s!=='')cells.push(address+'='+s);
      }
      if(cells.length){last=row.getAttribute('r')||String(+last+1);if(!lines.length)first=last;lines.push(cells.join('\t'));if(lines.length>=16||lines.join('').length>2600)flush();}
      if(out.partial)break;
    }
    flush();if(out.partial)break;
  }
}
async function docPdf(data,out){
  const {pdf,Assets}=await docPdfEngine();const task=pdf.getDocument({data,BinaryDataFactory:Assets,useWorkerFetch:false,useSystemFonts:false,isEvalSupported:false,useWasm:false,disableFontFace:true,verbosity:0});
  try{
    const doc=await task.promise;let empty=0;
    for(let n=1;n<=Math.min(doc.numPages,600);n++){
      const page=await doc.getPage(n);try{const layer=await page.getTextContent();const text=layer.items.map(i=>i.str===undefined?'':i.str+(i.hasEOL?'\n':' ')).join('').trim();
        if(text)out.add('第 '+n+' 页',text);else empty++;}finally{page.cleanup();}
      if(out.partial)break;
    }
    if(doc.numPages>600)out.partial=true;
    if(empty)out.notes.push(empty+' 页没有可提取的文字，可能为扫描图。');
  }catch(e){if(e.name==='PasswordException')throw Error('PDF 已加密，请解锁后再导入。');throw e;}finally{await task.destroy();}
}
async function readSpaceDocument(file){
  if(!docSupported(file.name))throw Error('暂不支持此文件扩展名。');
  if(!file.size||file.size>docLimit)throw Error('请选择非空且不超过 32 MB 的文档。');
  const ext=file.name.split('.').pop().toLowerCase(),bytes=new Uint8Array(await file.arrayBuffer()),out=new SpaceDocument();
  if(ext==='pdf')await docPdf(bytes,out);
  else if(ext==='docx')await docWord(docZip(bytes),out);
  else if(ext==='xlsx')await docExcel(docZip(bytes),out);
  else if(ext==='doc'||ext==='xls')docLegacy(bytes,ext,out);
  else{
    const utf16=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':null;
    let t;try{t=new TextDecoder(utf16||'utf-8',{fatal:true}).decode(bytes);}catch{t=new TextDecoder('gb18030').decode(bytes);}
    let n=1;for(const block of t.matchAll(/(?:[^\n]*\n|[^\n]+$){1,24}/g)){if(!block[0])continue;const count=block[0].trimEnd().split('\n').length;out.add('行 '+n+'–'+(n+count-1),block[0]);n+=(block[0].match(/\n/g)||[]).length;if(out.partial)break;}
  }
  if(!out.parts.length)throw Error(ext==='pdf'?'PDF 没有可读取的文字层。扫描件请先 OCR 后再导入。':'文件中未找到可读取的正文或单元格。');
  return out;
}
