function officeCompound(bytes){
  const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength),head=view(bytes);
  if(bytes.length<512||head.getUint32(0,false)!==0xd0cf11e0||head.getUint32(4,false)!==0xa1b11ae1)throw Error('请使用标准 Word 97–2003 或 Excel 97–2003 文件，或另存为新版格式。');
  const u=(n)=>head.getUint32(n,true),size=2**head.getUint16(30,true),mini=2**head.getUint16(32,true),cut=u(56),end=0xfffffffa;
  if(![512,4096].includes(size)||mini!==64)throw Error('旧版 Office 文件头无效。');
  const sector=n=>{const pos=(n+1)*size;if(n>=end||pos+size>bytes.length)throw Error('旧版文档的块地址无效。');return bytes.subarray(pos,pos+size);};
  const fats=[];for(let i=0;i<109;i++)if(u(76+4*i)<end)fats.push(u(76+4*i));
  const visited=new Set();let d=u(68);
  while(d<end){if(visited.has(d))throw Error('Office 目录循环。');visited.add(d);const v=view(sector(d));for(let i=0;i<size-4;i+=4){const a=v.getUint32(i,true);if(a<end)fats.push(a);}d=v.getUint32(size-4,true);}
  if(fats.length!==u(44))throw Error('Office 分配表不完整。');
  const fat=[];for(const a of fats){const v=view(sector(a));for(let i=0;i<size;i+=4)fat.push(v.getUint32(i,true));}
  function chain(first,table,read,max=bytes.length){
    const seen=new Set(),pieces=[];let total=0,n=first;
    while(n<end&&total<max){
      if(n>=table.length||seen.has(n))throw Error('Office 数据链无效。');seen.add(n);
      const b=read(n);if(!b.length)throw Error('Office 数据块缺失。');pieces.push(b);total+=b.length;n=table[n];
      if(total>bytes.length+size)throw Error('Office 数据超大。');
    }
    const out=new Uint8Array(Math.min(max,total));let pos=0;for(const b of pieces){const n=Math.min(b.length,out.length-pos);out.set(b.subarray(0,n),pos);pos+=n;}return out;
  }
  const dir=chain(u(48),fat,sector),entries=new Map();let root;
  for(let i=0;i+128<=dir.length;i+=128){const v=view(dir.subarray(i,i+128)),len=v.getUint16(64,true),type=v.getUint8(66);
    if(![2,5].includes(type)||len<2||len>64)continue;
    const entry={start:v.getUint32(116,true),size:v.getUint32(120,true)},name=new TextDecoder('utf-16le').decode(dir.subarray(i,i+len-2));
    if(type===5)root=entry;else entries.set(name,entry);
  }
  if(entries.has('EncryptedPackage')||entries.has('EncryptionInfo'))throw Error('文档已加密，请先解锁。');
  const minifat=[],mf=chain(u(60),fat,sector,Math.min(bytes.length,u(64)*size)),mv=view(mf);for(let i=0;i+4<=mf.length;i+=4)minifat.push(mv.getUint32(i,true));
  let small;
  return name=>{const e=entries.get(name);if(!e)return null;if(e.size>bytes.length)throw Error('Office 流大小无效。');
    if(e.size>=cut)return chain(e.start,fat,sector,e.size);
    if(!root)throw Error('Office 根目录缺失。');small??=chain(root.start,fat,sector,root.size);
    return chain(e.start,minifat,n=>small.subarray(n*mini,(n+1)*mini),e.size);
  };
}
function docLegacy(bytes,ext,out){
  const stream=officeCompound(bytes);
  if(ext==='xls')return docBiff(stream('Workbook')||stream('Book'),out);
  const word=stream('WordDocument');if(!word||word.length<426)throw Error('请将此旧版 Word 文档另存为 .docx。');
  const v=new DataView(word.buffer,word.byteOffset,word.byteLength),flags=v.getUint16(10,true);
  if(flags&0x8100)throw Error('Word 文件已加密，请先解锁。');
  const table=stream(flags&0x200?'1Table':'0Table'),from=v.getUint32(0x1a2,true),length=v.getUint32(0x1a6,true),max=v.getUint32(76,true);
  if(!table||!length||from+length>table.length)throw Error('此 Word 版本无法读取，请另存为 .docx。');
  const t=new DataView(table.buffer,table.byteOffset,table.byteLength);let a=from;
  while(a<from+length&&table[a]===1)a+=3+t.getUint16(a+1,true);
  if(table[a]!==2)throw Error('Word 正文分段表无效。');
  const n=(t.getUint32(a+1,true)-4)/12,b=a+5;let text='';
  if(!Number.isInteger(n)||n<1||b+12*n+4>from+length)throw Error('Word 正文分段表损坏。');
  for(let i=0;i<n;i++){
    const lo=t.getUint32(b+i*4,true),hi=Math.min(max,t.getUint32(b+(i+1)*4,true));if(hi<=lo)continue;
    const f=t.getUint32(b+4*(n+1)+8*i+2,true),compressed=!!(f&0x40000000),off=(f&0x3fffffff)/(compressed?2:1),size=(hi-lo)*(compressed?1:2);
    if(off+size>word.length)throw Error('Word 正文数据不完整。');
    text+=new TextDecoder(compressed?'windows-1252':'utf-16le').decode(word.subarray(off,off+size));if(text.length>450000){out.partial=true;break;}
  }
  text=text.replace(/\x13[^\x14\x15]*(?:\x14([^\x15]*))?\x15/g,'$1').replace(/[\r\x0b\x0c]/g,'\n').replace(/\x07/g,'\t').replace(/[\x00-\x06\x08\x0e-\x1f]/g,'');
  out.add('Word 正文',text);
}
function docBiff(bytes,out){
  if(!bytes)throw Error('未找到 Excel 工作簿。');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),sheets=new Map(),sst=[],blocks=[];let name='',cells=[],first=0,last=0;
  const column=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
  const flush=()=>{if(cells.length)out.add(name+' · 行 '+first+'–'+last,cells.join('\n'));cells=[];};
  const cell=(row,col,value)=>{if(value===undefined||value==='')return;row++;if(!cells.length)first=row;last=row;cells.push(column(col)+row+'='+value);if(cells.length>=48)flush();};
  const rk=value=>{let x;if(value&2)x=value>>2;else{const b=new DataView(new ArrayBuffer(8));b.setInt32(4,value&~3,true);x=b.getFloat64(0,true);}return value&1?x/100:x;};
  function readSst(){
    let k=0,pos=8;
    function next(){while(k<blocks.length&&pos>=blocks[k].length){k++;pos=0;}if(k>=blocks.length)throw Error('Excel 字符串表不完整。');return blocks[k][pos++];}
    function num(n){let value=0;for(let i=0;i<n;i++)value+=next()*256**i;return value;}
    const total=new DataView(blocks[0].buffer,blocks[0].byteOffset,blocks[0].byteLength).getUint32(4,true);if(total>1200000)throw Error('Excel 字符串过多。');
    for(let i=0;i<total;i++){
      const count=num(2),flag=next(),rich=flag&8?num(2):0,extra=flag&4?num(4):0;let wide=!!(flag&1),s='';
      for(let j=0;j<count;j++){if(pos>=blocks[k].length){k++;pos=0;if(!blocks[k])throw Error('Excel 字符串缺少续块。');wide=!!(next()&1);}s+=String.fromCharCode(num(wide?2:1));}
      for(let j=0;j<rich*4+extra;j++)next();sst.push(s);
    }
    blocks.length=0;
  }
  for(let off=0;off+4<=bytes.length;){
    const type=v.getUint16(off,true),size=v.getUint16(off+2,true),a=off+4,end=a+size;if(end>bytes.length)throw Error('Excel 记录不完整。');
    if(type===0x2f)throw Error('Excel 文件已加密，请先解锁。');
    if(type!==0x3c&&blocks.length)readSst();
    if(type===0xfc||type===0x3c&&blocks.length)blocks.push(bytes.subarray(a,end));
    if(type===0x85&&size>=8&&bytes[a+5]===0){const n=bytes[a+6],wide=!!(bytes[a+7]&1);sheets.set(v.getUint32(a,true),wide?new TextDecoder('utf-16le').decode(bytes.subarray(a+8,a+8+2*n)):String.fromCharCode(...bytes.subarray(a+8,a+8+n)));}
    if(type===0x809){flush();name=sheets.get(off)||'';}
    if(name&&size>=6){
      const row=v.getUint16(a,true),col=v.getUint16(a+2,true);
      if(type===0xfd)cell(row,col,sst[v.getUint32(a+6,true)]);
      else if(type===0x203)cell(row,col,v.getFloat64(a+6,true));else if(type===0x27e)cell(row,col,rk(v.getInt32(a+6,true)));
      else if(type===0xbd){for(let j=a+4,c=col;j+6<=end-2;j+=6,c++)cell(row,c,rk(v.getInt32(j+2,true)));}
      else if(type===0x205)cell(row,col,bytes[a+7]?'#ERROR':bytes[a+6]?'TRUE':'FALSE');
      else if(type===6&&v.getUint16(a+12,true)!==65535)cell(row,col,v.getFloat64(a+6,true));
    }
    if(out.partial)break;off=end;
  }
  flush();if(!sheets.size)throw Error('请将此 Excel 版本另存为 .xlsx。');
}
