'use strict';
const APP_BASE=new URL('./',document.baseURI);
const $=id=>document.getElementById(id), rupiah=n=>'Rp'+Number(n).toLocaleString('id-ID'), uid=()=>crypto.randomUUID(), today=()=>{let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
let db, state={guests:[],records:[]}, selected='', photos=[],editing=null, busy=false, worker;
function openDB(){return new Promise((resolve,reject)=>{let r=indexedDB.open('hinode-expense-pages:'+APP_BASE.pathname,1);r.onupgradeneeded=()=>r.result.createObjectStore('data');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function read(){return new Promise((resolve,reject)=>{let r=db.transaction('data').objectStore('data').get('state');r.onsuccess=()=>resolve(r.result||{guests:[],records:[]});r.onerror=()=>reject(r.error)})}
function persist(next){return new Promise((resolve,reject)=>{let tx=db.transaction('data','readwrite');tx.objectStore('data').put(next,'state');tx.oncomplete=()=>{state=next;resolve()};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
const current=()=>state.records.filter(r=>r.guest===selected).sort((a,b)=>a.date.localeCompare(b.date));
const guestName=()=>state.guests.find(g=>g.id===selected)?.name||'Tamu';
function elem(tag,text,cls){let e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e}
function button(text,fn){let b=elem('button',text);b.type='button';b.onclick=()=>safe(fn);return b}
function showPhoto(p){let url=URL.createObjectURL(p.original);let a=document.createElement('a');a.href=url;a.download=p.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function render(){let sel=$('guest');sel.replaceChildren();for(let g of state.guests){let o=elem('option',g.name);o.value=g.id;sel.append(o)}if(!state.guests.some(g=>g.id===selected))selected=state.guests[0]?.id||'';sel.value=selected;let rows=current();$('total').textContent=rupiah(rows.reduce((s,r)=>s+r.amount,0));$('count').textContent=`${rows.length} transaksi · ${rows.reduce((s,r)=>s+r.photos.length,0)} foto`;let h=$('history');h.replaceChildren();for(let r of rows){let box=elem('div',undefined,'record');let img=elem('img',undefined,'thumb');img.src=r.photos[0].jpeg;img.alt='Bukti nota';let info=elem('div',undefined,'info');info.append(elem('strong',rupiah(r.amount)),elem('p',r.date+' · '+r.photos.length+' foto'),elem('p',r.description||'Keterangan belum diisi'),button('Lihat bukti',()=>{let d=document.createElement('dialog');for(let p of r.photos){let i=elem('img');i.src=p.jpeg;d.append(i,button('Simpan foto asli',()=>showPhoto(p)))}d.append(button('Tutup',()=>{d.close();d.remove()}));document.body.append(d);d.showModal()}),button('Edit',()=>{editing=r.id;photos=[...r.photos];$('date').value=r.date;$('amount').value=r.amount;$('description').value=r.description||'';$('cancel').hidden=false;renderPhotos();showView('scan');$('entry').scrollIntoView({behavior:'smooth'})}),button('Hapus',async()=>{if(confirm('Hapus transaksi dan foto?')){await persist({...state,records:state.records.filter(x=>x.id!==r.id)});if(editing===r.id)reset();render()}}));box.append(img,info);h.append(box)}updateSave();renderModernUI()}
function updateSave(){const amount=Number($('amount').value);const complete=!!(selected&&photos.length&&$('date').validity.valid&&$('date').value&&Number.isSafeInteger(amount)&&amount>0&&amount<=1e12&&$('description').value.trim()&&$('description').validity.valid);$('save').disabled=busy||!complete;$('saveHint').textContent=busy?'Sedang memproses…':complete?'Semua data lengkap. Siap disimpan.':'Wajib: kunjungan, foto, tanggal, nominal dan keterangan pembelian.';}
function renderPhotos(){let el=$('photos');el.replaceChildren();photos.forEach((p,i)=>{let d=elem('div'),im=elem('img');im.src=p.jpeg;d.append(im,button('Hapus',()=>{photos.splice(i,1);renderPhotos()}));el.append(d)});updateSave()}
function reset(){editing=null;photos=[];$('date').value='';$('amount').value='';$('description').value='';$('camera').value='';$('gallery').value='';$('raw').textContent='';$('dateChoices').replaceChildren();$('scanStatus').textContent='';$('cancel').hidden=true;renderPhotos()}
async function photo(file){if(file.size>30*1024*1024)throw Error('Foto terlalu besar (maks. 30 MB)');let url=URL.createObjectURL(file);try{let im=new Image();im.src=url;await im.decode();let scale=Math.min(1,2000/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*scale));c.height=Math.max(1,Math.round(im.height*scale));let ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(im,0,0,c.width,c.height);let hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');return {name:file.name,original:file,jpeg:c.toDataURL('image/jpeg',.86),width:c.width,height:c.height,hash}}finally{URL.revokeObjectURL(url)}}
function validDate(y,m,d){if(y<100)y+=2000;let s=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,v=new Date(s+'T00:00:00Z');return y>=2000&&y<=2100&&!isNaN(v)&&v.toISOString().slice(0,10)===s?s:''}
function dateCandidates(text){
 const months={jan:1,feb:2,mar:3,apr:4,mei:5,may:5,jun:6,jul:7,agu:8,ags:8,aug:8,sep:9,okt:10,oct:10,nov:11,des:12,dec:12};
 const results=new Map(); const lines=text.normalize('NFKC').split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
  const line=lines[i], context=(lines[i-1]||'')+' '+line;
  if(/\b(expiry|expired|exp date|kedaluwarsa|kadaluarsa|valid until|due date|jatuh tempo|tanggal lahir)\b/i.test(line))continue;
  const score= (/\b(tanggal|tgl|date|transaction|trx|order|receipt)\b/i.test(line)?30: /\b(tanggal|tgl|date)\b/i.test(lines[i-1]||'')?15:0) + Math.max(0,10-i/2);
  const add=(y,m,d,extra=0)=>{const v=validDate(+y,+m,+d);if(v&&(!results.has(v)||results.get(v)<score+extra))results.set(v,score+extra)};
  const clean=line.replace(/(?<=\d)[Oo](?=\d)/g,'0');
  for(const m of clean.matchAll(/\b(20\d{2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b/g))add(m[1],m[2],m[3],4);
  for(const m of clean.matchAll(/(?<![\d/.-])(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(20\d{2}|\d{2})(?![\d/.-])/g)){add(m[3],m[2],m[1],2);if(+m[2]>12)add(m[3],m[1],m[2]);else if(+m[1]<=12&&+m[2]<=12&&m[1]!==m[2])add(m[3],m[1],m[2],-3);}
  for(const m of clean.matchAll(/\b(\d{1,2})[\s.,/-]+([a-z]{3,10})[\s.,/-]+(20\d{2}|\d{2})\b/gi))add(m[3],months[m[2].toLowerCase().slice(0,3)],m[1],4);
  for(const m of clean.matchAll(/\b([a-z]{3,10})[\s.,/-]+(\d{1,2})[\s.,/-]+(20\d{2}|\d{2})\b/gi))add(m[3],months[m[1].toLowerCase().slice(0,3)],m[2],4);
  for(const m of clean.matchAll(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g))add(m[1],m[2],m[3],4);
 }
 return [...results].sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
}
function parseReceipt(text){let date=dateCandidates(text)[0]||'',amount=null;let lines=text.split(/\n/);let candidates=[];for(let i=0;i<lines.length;i++){let line=lines[i];if(/sub\s*total|kembali|change|tunai|cash|diskon|discount|pajak|tax|ppn|total\s*(item|qty|barang|poin)/i.test(line))continue;let k=line.match(/\b(grand\s*total|total\s*(?:bayar|pembayaran|akhir|tagihan)|jumlah\s*(?:bayar|tagihan)|total|amount\s*due)\b/i);if(!k)continue;let tail=line.slice(k.index+k[0].length);let nums=tail.match(/\d[\d.,]*\d|\d/g)||[];if(!nums.length&&/^\s*(?:rp\s*)?[\d.,]+\s*$/i.test(lines[i+1]||''))nums=(lines[i+1].match(/\d[\d.,]*\d|\d/g)||[]);for(let raw of nums){let n=Number(raw.replace(/[.,]\d{2}$/,'').replace(/[.,]/g,''));if(Number.isSafeInteger(n)&&n>0&&n<=1e12)candidates.push({n,score:/grand|bayar|akhir|tagihan|due/i.test(k[0])?2:1})}}candidates.sort((a,b)=>b.score-a.score);if(candidates.length&&new Set(candidates.filter(c=>c.score===candidates[0].score).map(c=>c.n)).size===1)amount=candidates[0].n;return {date,amount}}
async function enhancedImage(p,topOnly=false){
 const im=new Image();im.src=p.jpeg;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=Math.max(1,Math.round(im.height*(topOnly?.55:1)));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0,im.width,c.height,0,0,c.width,c.height);const data=ctx.getImageData(0,0,c.width,c.height),hist=new Uint32Array(256);
 for(let i=0;i<data.data.length;i+=4){let g=Math.round(.299*data.data[i]+.587*data.data[i+1]+.114*data.data[i+2]);hist[g]++;data.data[i]=data.data[i+1]=data.data[i+2]=g;}
 let lo=0,hi=255,n=c.width*c.height*.02,k=0;while(lo<255&&(k+=hist[lo])<n)lo++;k=0;while(hi>0&&(k+=hist[hi])<n)hi--;if(hi-lo>10)for(let i=0;i<data.data.length;i+=4){let g=Math.max(0,Math.min(255,(data.data[i]-lo)*255/(hi-lo)));data.data[i]=data.data[i+1]=data.data[i+2]=g;}ctx.putImageData(data,0,0);return c.toDataURL('image/png');
}
function showDateChoices(dates){const el=$('dateChoices');el.replaceChildren();if(!dates.length)return;el.append(elem('small',dates.length>1?'Pilih tanggal yang sesuai dengan nota:':'Tanggal terbaca — cocokkan dengan nota:'));for(const d of dates.slice(0,8))el.append(button(d.split('-').reverse().join('/'),()=>{$('date').value=d;updateSave()}));}
async function scan(){if(!photos.length)throw Error('Tambahkan foto dahulu');if(!window.Tesseract)throw Error('Aset OCR belum tersedia');$('scanStatus').textContent='Menyiapkan OCR…';$('dateChoices').replaceChildren();const p=photos[0];if(!worker)worker=await Tesseract.createWorker('ind',1,{workerPath:new URL('static/vendor/worker.min.js',APP_BASE).href,corePath:new URL('static/vendor',APP_BASE).href,langPath:new URL('static/vendor',APP_BASE).href,workerBlobURL:false,logger:m=>{$('scanStatus').textContent=m.status+' '+Math.round((m.progress||0)*100)+'%'}});
 let texts=[], dates=[], amount=null;
 for(let pass=0;pass<3;pass++){
  if(pass===2&&dates.length)break;
  if(pass===1&&dates.length&&amount!==null)break;
  $('scanStatus').textContent='OCR percobaan '+(pass+1)+'…';
  let result=await worker.recognize(pass===0?p.jpeg:await enhancedImage(p,pass===2));let t=result.data.text;texts.push(t);
  dates=[...new Set([...dates,...dateCandidates(t)])];if(pass<2&&amount===null)amount=parseReceipt(t).amount;
 }
 $('raw').textContent=texts.join('\n--- Percobaan ulang ---\n');showDateChoices(dates);
 if(dates.length===1)$('date').value=dates[0];else if(dates.length>1)$('date').value='';
 if(amount!==null)$('amount').value=amount;
 $('scanStatus').textContent=dates.length>1?'Beberapa tanggal ditemukan. Pilih tanggal pembelian.':!dates.length?'Tanggal belum terbaca. Isi manual atau foto ulang.':'Tanggal ditemukan. Periksa tanggal dan nominal sebelum menyimpan.';
}
async function save(){if(!selected||!photos.length)throw Error('Pilih kunjungan dan lampirkan foto wajib');let date=$('date').value,amount=Number($('amount').value),description=$('description').value.trim();if(!description||description.length>200)throw Error('Keterangan pembelian wajib diisi (maks. 200 karakter)');if(!date||!Number.isSafeInteger(amount)||amount<=0||amount>1e12)throw Error('Tanggal atau nominal tidak valid');let dup=state.records.some(r=>r.id!==editing&&(r.photos.some(p=>photos.some(q=>q.hash===p.hash))||(r.guest===selected&&r.date===date&&r.amount===amount)));if(dup&&!confirm('Potensi nota ganda: foto sama atau tanggal dan nominal sama. Tetap simpan?'))return;let r={id:editing||uid(),guest:selected,date,amount,description,photos:[...photos],created:new Date().toISOString()};await persist({...state,records:[...state.records.filter(x=>x.id!==r.id),r]});reset();render();showView('history')}
function download(data,name,type){let blob=data instanceof Blob?data:new Blob([data],{type});let url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function requireRows(){let rows=current();if(!rows.length)throw Error('Belum ada transaksi');return rows}
async function excel(){
  const rows=[...requireRows()].sort((a,b)=>a.date.localeCompare(b.date)||String(a.created||'').localeCompare(String(b.created||''))), wb=new ExcelJS.Workbook();
  const pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,horizontalCentered:true,margins:{left:0.3,right:0.3,top:0.4,bottom:0.4,header:0.15,footer:0.15}};
  const s=wb.addWorksheet('Rekap',{pageSetup:{...pageSetup,printTitlesRow:'1:4'}}), b=wb.addWorksheet('Bukti Nota',{pageSetup:{...pageSetup,printTitlesRow:'1:4'}});
  const navy='FF17334E', white='FFFFFFFF', borderColor='FFB8C7D5', money='[$Rp-421] #,##0';
  const edge={style:'thin',color:{argb:borderColor}};
  const border={top:edge,bottom:edge,left:edge,right:edge};
  for(const sh of [s,b]){sh.columns=[{width:6},{width:14},{width:30},{width:19},{width:28}];sh.properties.defaultRowHeight=20;sh.headerFooter.oddFooter="&LHINODE&C&RHalaman &P dari &N";}
  for(const sh of [s,b]){
    sh.mergeCells('A1:E1');sh.getCell('A1').value='LPK YAYASAN HINODE ABADI INDONESIA';
    sh.mergeCells('A2:E2');sh.getCell('A2').value='LAPORAN PENGELUARAN TAMU（接待費精算書）';
    sh.mergeCells('A3:E3');sh.getCell('A3').value=guestName();
    for(let n=1;n<=3;n++){let cell=sh.getCell('A'+n);cell.font={name:'Calibri',size:n===1?16:n===2?14:12,bold:n!==3,color:{argb:navy}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};sh.getRow(n).height=n===3?24:28;}
    sh.addRow(['No','Tanggal','Keterangan pembelian','Pengeluaran (Rp)','Bukti kwitansi']);
  }
  function band(row){row.height=28;for(let c=1;c<=5;c++){const cell=row.getCell(c);cell.border=border;cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:navy}};cell.font={name:'Calibri',bold:true,color:{argb:white}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};}}
  band(s.getRow(4));band(b.getRow(4));
  const fit=(p,maxH=190)=>{const scale=Math.min(1,168/p.width,maxH/p.height);return {width:Math.max(1,Math.round(p.width*scale)),height:Math.max(1,Math.round(p.height*scale))}};
  function formatRow(row){for(let c=1;c<=5;c++){const cell=row.getCell(c);cell.border=border;cell.font={name:'Calibri',size:11,color:{argb:navy}};cell.alignment={vertical:'middle',horizontal:c===3?'left':c===4?'right':'center',wrapText:true};}row.getCell(2).numFmt='dd/mm/yyyy';row.getCell(4).numFmt=money;}
  function attach(sheet,row,img,dim){
    const textHeight=Math.ceil(String(row.getCell(3).value||'').length/24)*15+10;
    row.height=Math.max(52,textHeight,(dim.height+40)*0.75);
    // Excel drawing offsets are EMUs (9525 per CSS pixel), not fractional cell widths.
    const colPx=sheet.getColumn(5).width*7+5,rowPx=row.height/0.75;
    const nativeColOff=Math.round(Math.max(0,(colPx-dim.width)/2)*9525);
    const nativeRowOff=Math.round(Math.max(0,(rowPx-dim.height)/2)*9525);
    sheet.addImage(img,{tl:{nativeCol:4,nativeColOff,nativeRow:row.number-1,nativeRowOff},ext:dim,editAs:'oneCell'});
  }
  for(const [i,r] of rows.entries()){
    for(const [j,p] of r.photos.entries()){
      const rr=s.addRow(j===0?[i+1,new Date(r.date+'T00:00:00Z'),r.description||'Belum diisi',r.amount,'']:[`${i+1}.${j+1}`,null,null,'','']);
      formatRow(rr);const img=wb.addImage({base64:p.jpeg,extension:'jpeg'}),dim=fit(p);attach(s,rr,img,dim);
      const br=b.addRow([`${i+1}.${j+1}`,new Date(r.date+'T00:00:00Z'),r.description||'Belum diisi',r.amount,'']);formatRow(br);attach(b,br,img,fit(p,280));
    }
  }
  const last=s.lastRow.number;
  const total=s.addRow(['TOTAL','','',{formula:`SUM(D5:D${last})`,result:rows.reduce((a,r)=>a+r.amount,0)},'']);
  s.mergeCells(`A${total.number}:C${total.number}`);band(total);total.getCell(4).numFmt=money;total.getCell(4).alignment={horizontal:'right',vertical:'middle'};
  s.views=[{state:'frozen',ySplit:4,showGridLines:false}];b.views=[{state:'frozen',ySplit:4,showGridLines:false}];
  s.pageSetup.printArea=`A1:E${total.number}`;b.pageSetup.printArea=`A1:E${b.lastRow.number}`;
  for(const sh of [s,b]){
    Object.assign(sh.pageSetup,pageSetup,{printTitlesRow:'1:4',scale:undefined});
    let used=0;const available=400;
    for(let n=5;n<=sh.lastRow.number;n++){let h=sh.getRow(n).height||20;if(used&&used+h>available){sh.getRow(n-1).addPageBreak();used=0;}used+=h;}
  }
  download(await wb.xlsx.writeBuffer(),'Hinode-pengeluaran-v1.6.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
async function pdf(){
  const rows=[...requireRows()].sort((a,b)=>a.date.localeCompare(b.date)||String(a.created||'').localeCompare(String(b.created||'')));
  const doc=new jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'}), W=297,H=210,M=12, widths=[12,30,98,42,91], navy=[23,51,78];
  let y=0;
  function rasterText(text,x,top,w,h,size=36,bold=false,align='center'){
    const c=document.createElement('canvas');c.width=Math.ceil(w*8);c.height=Math.ceil(h*8);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#17334e';ctx.font=`${bold?'bold ':''}${size}px sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(text,align==='center'?c.width/2:4,c.height/2,c.width-8);doc.addImage(c.toDataURL('image/png'),'PNG',x,top,w,h);
  }
  function title(){rasterText('LPK YAYASAN HINODE ABADI INDONESIA',M,7,W-2*M,9,45,true);rasterText('LAPORAN PENGELUARAN TAMU（接待費精算書）',M,17,W-2*M,8,38,true);rasterText(guestName(),M,26,W-2*M,7,32);}
  function band(labels,top,height){let x=M;doc.setFillColor(...navy);doc.rect(M,top,W-2*M,height,'F');doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(10);labels.forEach((v,i)=>{doc.text(String(v),x+widths[i]/2,top+height/2+1.2,{align:'center'});x+=widths[i]});doc.setTextColor(...navy);doc.setFont('helvetica','normal');}
  function header(){title();band(['No','Tanggal','Keterangan pembelian','Pengeluaran (Rp)','Bukti kwitansi'],35,9);y=44;}
  function next(){doc.addPage('a4','landscape');header();}
  const dateText=d=>d.split('-').reverse().join('/');
  header();
  for(const [i,r] of rows.entries())for(const [j,p] of r.photos.entries()){
    doc.setFontSize(10);const desc=j===0?(r.description||'Belum diisi'):'Foto tambahan';const lines=doc.splitTextToSize(desc,widths[2]-8);const scale=Math.min((widths[4]-12)/p.width,44/p.height);const iw=p.width*scale,ih=p.height*scale;const rh=Math.max(22,ih+12,lines.length*5+10);
    if(y+rh+11>H-17)next();
    let x=M;doc.setDrawColor(184,199,213);doc.setLineWidth(.2);for(const w of widths){doc.rect(x,y,w,rh);x+=w;}
    doc.setTextColor(...navy);doc.setFontSize(10);let mid=y+rh/2+1;doc.text(j===0?String(i+1):`${i+1}.${j+1}`,M+widths[0]/2,mid,{align:'center'});doc.text(dateText(r.date),M+widths[0]+widths[1]/2,mid,{align:'center'});doc.text(lines,M+widths[0]+widths[1]+4,y+(rh-lines.length*5)/2+4);if(j===0)doc.text(rupiah(r.amount),M+widths.slice(0,4).reduce((a,b)=>a+b,0)-4,mid,{align:'right'});
    const ix=M+widths.slice(0,4).reduce((a,b)=>a+b,0)+(widths[4]-iw)/2;doc.addImage(p.jpeg,'JPEG',ix,y+(rh-ih)/2,iw,ih);y+=rh;
  }
  if(y+11>H-17)next();band(['','','TOTAL',rupiah(rows.reduce((a,r)=>a+r.amount,0)),''],y,11);
  // Full-size evidence pages retain the original report's attachments.
  for(const [i,r] of rows.entries())for(const [j,p] of r.photos.entries()){
    doc.addPage('a4','landscape');title();doc.setFontSize(11);doc.setTextColor(...navy);doc.text(`Bukti ${i+1}.${j+1} | ${dateText(r.date)} | ${rupiah(r.amount)}`,M,41);const scale=Math.min((W-2*M-8)/p.width,143/p.height);const iw=p.width*scale,ih=p.height*scale;doc.addImage(p.jpeg,'JPEG',(W-iw)/2,47+(143-ih)/2,iw,ih);
  }
  const count=doc.getNumberOfPages();for(let n=1;n<=count;n++){doc.setPage(n);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(...navy);doc.text('HINODE',M,H-7);doc.text(`Halaman ${n} dari ${count}`,W-M,H-7,{align:'right'});}
  download(doc.output('blob'),'Hinode-pengeluaran-v1.6.pdf','application/pdf');
}
async function backup(){let z=new JSZip(),data={version:1,guests:state.guests,records:[]};for(let r of state.records){let ps=[];for(let [i,p] of r.photos.entries()){let path=`photos/${r.id}/${i}.original`,preview=`photos/${r.id}/${i}.jpg`;z.file(path,await p.original.arrayBuffer());z.file(preview,p.jpeg.split(',')[1],{base64:true});ps.push({name:p.name,type:p.original.type,path,preview,width:p.width,height:p.height,hash:p.hash})}data.records.push({...r,photos:ps})}z.file('data.json',JSON.stringify(data,null,2));download(await z.generateAsync({type:'blob'}),'Hinode-backup-'+today()+'.zip','application/zip')}
async function restore(file){if(!file)return;let z=await JSZip.loadAsync(file),d=JSON.parse(await z.file('data.json').async('string'));if(d.version!==1||!Array.isArray(d.guests)||!Array.isArray(d.records))throw Error('Format backup tidak valid');let ids=new Set();for(let g of d.guests){if(typeof g.id!=='string'||typeof g.name!=='string'||ids.has(g.id))throw Error('Data tamu rusak');ids.add(g.id)}let records=[],rids=new Set();for(let r of d.records){if(typeof r.id!=='string'||rids.has(r.id)||!ids.has(r.guest)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isSafeInteger(r.amount)||r.amount<=0||!Array.isArray(r.photos)||!r.photos.length)throw Error('Data transaksi rusak');rids.add(r.id);let ps=[];for(let p of r.photos){let original=new File([await z.file(p.path).async('uint8array')],p.name,{type:p.type});let rebuilt=await photo(original);if(rebuilt.hash!==p.hash)throw Error('Bukti foto tidak sesuai checksum');ps.push(rebuilt)}records.push({...r,photos:ps})}if(confirm('Pulihkan backup? Seluruh data perangkat saat ini akan DIGANTI.')){await persist({guests:d.guests,records});selected='';reset();render()}}
async function safe(fn){if(busy)return;busy=true;updateSave();try{await fn()}catch(e){alert(e.message||String(e));$('scanStatus').textContent='Periksa kembali jika proses gagal.';console.error(e)}finally{busy=false;updateSave()}}
async function init(){db=await openDB();state=await read();for(const id of ['date','amount','description']){$(id).addEventListener('input',updateSave);$(id).addEventListener('change',updateSave)}render();$('newGuest').onsubmit=e=>{e.preventDefault();safe(async()=>{let name=$('guestName').value.trim();if(!name)return;let g={id:uid(),name};await persist({...state,guests:[...state.guests,g]});selected=g.id;$('guestName').value='';reset();render()})};$('guest').onchange=()=>{if(busy){$('guest').value=selected;return}selected=$('guest').value;reset();render()};for(let id of ['camera','gallery'])$(id).onchange=e=>safe(async()=>{for(let f of e.target.files){let p=await photo(f);if(!photos.some(q=>q.hash===p.hash))photos.push(p)}e.target.value='';renderPhotos();if(photos.length===1)await scan()});$('scan').onclick=()=>safe(scan);$('entry').onsubmit=e=>{e.preventDefault();safe(save)};$('cancel').onclick=reset;$('excel').onclick=()=>safe(excel);$('pdf').onclick=()=>safe(pdf);$('backup').onclick=()=>safe(backup);$('restore').onchange=e=>safe(async()=>{await restore(e.target.files[0]);e.target.value=''});if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});if('serviceWorker' in navigator){try{await navigator.serviceWorker.register(new URL('sw.js',APP_BASE),{scope:APP_BASE.pathname});await navigator.serviceWorker.ready;$('offline').textContent='Offline siap — tetap lakukan backup.'}catch(e){$('offline').textContent='Offline belum siap: '+e.message}}else $('offline').textContent='Butuh HTTPS untuk mode offline.'}
// V2.1: navigation and dashboard only; database and report logic unchanged.
function showView(name){
  if(!['home','scan','history','report','settings'].includes(name))return;
  document.querySelectorAll('[data-view]').forEach(el=>{el.hidden=el.dataset.view!==name});
  document.querySelectorAll('.nav-item').forEach(el=>{if(el.dataset.page===name)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});
  window.scrollTo(0,0);
}
function renderModernUI(){
  const active=selected?guestName():'Belum ada kunjungan';
  $('totalGuest').textContent=active;
  document.querySelectorAll('[data-active-guest]').forEach(el=>{el.textContent=selected?'Kunjungan aktif: '+active:'Tambahkan kunjungan melalui Home terlebih dahulu.'});
  if(!selected){const op=elem('option','Pilih / tambah kunjungan');op.value='';$('guest').append(op);$('guestDetails').open=true;}
  const rows=[...current()].sort((a,b)=>b.date.localeCompare(a.date)||String(b.created||'').localeCompare(String(a.created||'')));
  const recent=$('recent');recent.replaceChildren();
  if(!rows.length){recent.append(elem('p','Belum ada transaksi. Mulai dengan scan nota.','empty'));$('history').append(elem('p','Belum ada pengeluaran untuk kunjungan ini.','empty'));}
  for(const r of rows.slice(0,3)){
    const line=elem('div',undefined,'recent-row'), img=elem('img');img.src=r.photos[0].jpeg;img.alt='Bukti nota';
    const info=elem('div',undefined,'recent-copy');info.append(elem('strong',r.description||'Keterangan belum diisi'),elem('small',r.date.split('-').reverse().join('/')));
    line.append(img,info,elem('strong',rupiah(r.amount),'recent-amount'));recent.append(line);
  }
}
function bindModernUI(){
  document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>showView(el.dataset.page)));
  $('newGuest').addEventListener('submit',()=>{if($('guestName').value.trim())$('guestDetails').open=false});
  const status=$('offline');const refresh=()=>status.parentElement.classList.toggle('ready',status.textContent.startsWith('Offline siap'));
  new MutationObserver(refresh).observe(status,{childList:true,characterData:true,subtree:true});refresh();
}

if(typeof document!=='undefined'){bindModernUI();init().catch(e=>alert('Gagal membuka aplikasi: '+e.message));}
