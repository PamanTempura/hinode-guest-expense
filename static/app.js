'use strict';
const APP_BASE=new URL('./',document.baseURI);
const $=id=>document.getElementById(id), rupiah=n=>'Rp '+Number(n).toLocaleString('id-ID'), uid=()=>crypto.randomUUID(), today=()=>{let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
let db, state={guests:[],records:[]}, selected='', photos=[],editing=null, busy=false, worker;
function openDB(){return new Promise((resolve,reject)=>{let r=indexedDB.open('hinode-expense-pages:'+APP_BASE.pathname,1);r.onupgradeneeded=()=>r.result.createObjectStore('data');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function read(){return new Promise((resolve,reject)=>{let r=db.transaction('data').objectStore('data').get('state');r.onsuccess=()=>resolve(r.result||{guests:[],records:[]});r.onerror=()=>reject(r.error)})}
function stateStamp(s){return JSON.stringify([s.revision||'',s.guests,s.records.map(r=>[r.id,r.guest,r.date,r.amount,r.description,r.category,r.created,r.photos.map(p=>p.hash)])])}
function persist(next){return new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite'),store=tx.objectStore('data'),req=store.get('state');let problem;const stamp=stateStamp(state);next={...next,revision:uid()};req.onsuccess=()=>{try{const latest=req.result||{guests:[],records:[]};if(stateStamp(latest)!==stamp)throw Error('Data berubah di tab lain. Backup jika perlu, kemudian muat ulang aplikasi.');store.put(next,'state')}catch(e){problem=e;tx.abort()}};tx.oncomplete=()=>{state=next;resolve()};tx.onerror=()=>reject(problem||tx.error);tx.onabort=()=>reject(problem||tx.error||Error('Penyimpanan dibatalkan.'))})}
const current=()=>state.records.filter(r=>r.guest===selected).sort((a,b)=>a.date.localeCompare(b.date));
const guestName=()=>state.guests.find(g=>g.id===selected)?.name||'Tamu';
function elem(tag,text,cls){let e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e}
function button(text,fn){let b=elem('button',text);b.type='button';b.onclick=()=>safe(fn);return b}
function showPhoto(p){let url=URL.createObjectURL(p.original);let a=document.createElement('a');a.href=url;a.download=p.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function render(){
 let sel=$('guest');sel.replaceChildren();const active=state.guests.filter(g=>!g.archived);
 if(!active.some(g=>g.id===selected))selected=active[0]?.id||'';
 for(const g of active){let o=elem('option',g.name);o.value=g.id;sel.append(o)}sel.value=selected;
 const rows=current();$('total').textContent=rupiah(rows.reduce((s,r)=>s+r.amount,0));
 $('count').textContent=`${rows.length} ${tr('transaksi')} · ${rows.reduce((s,r)=>s+r.photos.length,0)} ${tr('foto')} · ${rows.filter(r=>!r.photos.length).length} ${tr('Tanpa Bukti')}`;
 const history=$('history');history.replaceChildren();const filtered=rows.filter(matchesFilter);
 for(const r of filtered){let box=elem('div',undefined,'record');let im=receiptThumb(r,'thumb');let info=elem('div',undefined,'info');
  info.append(elem('strong',rupiah(r.amount)),elem('p',r.date.split('-').reverse().join('/')+' · '+(r.photos.length?r.photos.length+' '+tr('foto'):tr('Tanpa Bukti'))),elem('p',r.description||tr('Keterangan belum diisi')),elem('small',tr(recordCategory(r))));
  if(r.photos.length)info.append(button(tr('Lihat bukti'),()=>viewEvidence(r)));
  info.append(button(tr('Edit'),()=>openRecord(r,false)),button(tr('Duplikat'),()=>openRecord(r,true)),button(tr('Hapus'),async()=>{if(editing||batchTotal)throw Error(tr('Selesaikan transaksi terlebih dahulu.'));if(confirm(tr('Hapus transaksi dan foto?'))){await persist({...state,records:state.records.filter(x=>x.id!==r.id)});render()}}));box.append(im,info);history.append(box);
 }
 if(!filtered.length)history.append(elem('p',tr('Tidak ada transaksi yang cocok.'),'empty'));
 updateSave();renderModernUI();renderExtras();
}
function updateSave(){
 const amount=parseMoney($('amount').value),missing=[];
 if(!selected||!state.guests.some(g=>g.id===selected&&!g.archived))missing.push(tr('kunjungan tamu'));
 if(!$('date').value||!$('date').validity.valid)missing.push(tr('tanggal pembelian'));
 if(!Number.isSafeInteger(amount)||amount<=0||amount>1e12||!$('amount').validity.valid)missing.push(tr('nominal yang valid'));
 if(!$('description').value.trim()||!$('description').validity.valid)missing.push(tr('keterangan pembelian'));
 $('save').disabled=busy||missing.length>0;
 $('saveHint').textContent=busy?tr('Sedang memproses…'):missing.length?tr('Belum lengkap: ')+missing.join(', ')+'.':photos.length?tr('Semua data lengkap. Siap disimpan.'):tr('Siap disimpan — tanpa bukti foto.');
 for(const id of ['guest','scanGuest','scanAddGuest','scanGuestName','renameGuest','archiveGuest','deleteGuest'])$(id).disabled=busy||!!editing||!!batchTotal||(['renameGuest','archiveGuest','deleteGuest'].includes(id)&&!selected);
 for(const id of ['camera','gallery','batch','scan','cancel','skipBatch','calc','date','amount','description','category','autoScan'])$(id).disabled=busy;
 $('scan').disabled=busy||!photos.length;$('batch').disabled=busy||!!editing||!!batchTotal;$('guest').disabled=busy||!!editing||!!batchTotal;
}
function renderPhotos(){let el=$('photos');el.replaceChildren();photos.forEach((p,i)=>{let d=elem('div'),im=elem('img');im.src=p.jpeg;d.append(im,button(tr('Hapus'),()=>{photos.splice(i,1);renderPhotos()}));el.append(d)});updateSave()}
function reset(){editing=null;photos=[];$('date').value='';$('amount').value='';$('amount').setCustomValidity('');$('description').value='';$('category').value='Lainnya';$('suggestion').replaceChildren();$('camera').value='';$('gallery').value='';$('raw').textContent='';$('dateChoices').replaceChildren();$('scanStatus').textContent='';$('cancel').hidden=true;renderPhotos()}
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
function showDateChoices(dates){const el=$('dateChoices');el.replaceChildren();if(!dates.length)return;el.append(elem('small',dates.length>1?tr('Pilih tanggal yang sesuai dengan nota:'):tr('Tanggal terbaca — cocokkan dengan nota:')));for(const d of dates.slice(0,8))el.append(button(d.split('-').reverse().join('/'),()=>{$('date').value=d;updateSave()}));}
async function scan(){if(!photos.length)throw Error('Tambahkan foto dahulu');if(!window.Tesseract)throw Error('Aset OCR belum tersedia');$('scanStatus').textContent=tr('Menyiapkan OCR…');$('dateChoices').replaceChildren();const p=photos[0];if(!worker)worker=await Tesseract.createWorker('ind',1,{workerPath:new URL('static/vendor/worker.min.js',APP_BASE).href,corePath:new URL('static/vendor',APP_BASE).href,langPath:new URL('static/vendor',APP_BASE).href,workerBlobURL:false,logger:m=>{$('scanStatus').textContent=m.status+' '+Math.round((m.progress||0)*100)+'%'}});
 let texts=[], dates=[], amount=null;
 for(let pass=0;pass<3;pass++){
  if(pass===2&&dates.length)break;
  if(pass===1&&dates.length&&amount!==null)break;
  $('scanStatus').textContent='OCR percobaan '+(pass+1)+'…';
  let result=await worker.recognize(pass===0?p.jpeg:await enhancedImage(p,pass===2));let t=result.data.text;texts.push(t);
  dates=[...new Set([...dates,...dateCandidates(t)])];if(pass<2&&amount===null)amount=parseReceipt(t).amount;
 }
 if(!dates.length||amount===null){
  for(const angle of [0,90,270,180]){
    const img=await cropRotate(p,angle);if(!img)continue;
    $('scanStatus').textContent=tr('Mencoba perbaikan posisi foto…');
    const result=await worker.recognize(img);const t=result.data.text;texts.push(t);
    dates=[...new Set([...dates,...dateCandidates(t)])];if(amount===null)amount=parseReceipt(t).amount;
    if(dates.length&&amount!==null)break;
  }
 }
 $('raw').textContent=texts.join('\n--- Percobaan ulang ---\n');showDateChoices(dates);
 if(dates.length===1)$('date').value=dates[0];else if(dates.length>1)$('date').value='';
 if(amount!==null){$('amount').value=formatMoney(amount);$('amount').setCustomValidity('');}
 suggestDescription(texts.join('\n'));
 $('scanStatus').textContent=tr(dates.length>1?'Beberapa tanggal ditemukan. Pilih tanggal pembelian.':!dates.length?'Tanggal belum terbaca. Isi manual atau foto ulang.':'Tanggal ditemukan. Periksa tanggal dan nominal sebelum menyimpan.')+(amount===null?' '+tr('Nominal belum terbaca. Isi manual.'):'');
}
async function save(){
 if(!selected||!state.guests.some(g=>g.id===selected&&!g.archived))throw Error(tr('Pilih kunjungan tamu'));
 const date=$('date').value,amount=parseMoney($('amount').value),description=$('description').value.trim(),category=$('category').value;
 if(!description||description.length>200||!date||!$('date').validity.valid||!$('amount').validity.valid||!Number.isSafeInteger(amount)||amount<=0||amount>1e12)throw Error(tr('Tanggal, nominal atau keterangan tidak valid.'));
 const dup=state.records.some(r=>r.id!==editing&&(r.photos.some(p=>photos.some(q=>q.hash===p.hash))||(r.guest===selected&&r.date===date&&r.amount===amount)));
 if(dup&&!confirm(tr('Potensi nota ganda: foto sama atau tanggal dan nominal sama. Tetap simpan?')))return;
 const old=state.records.find(x=>x.id===editing),r={...old,id:editing||uid(),guest:selected,date,amount,description,category,photos:[...photos],created:old?.created||new Date().toISOString()};
 await persist({...state,records:[...state.records.filter(x=>x.id!==r.id),r]});reset();render();
 if(batchQueue.length){await nextBatch();}else{batchTotal=0;renderBatch();showView('history')}
}
function download(data,name,type){let blob=data instanceof Blob?data:new Blob([data],{type});let url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function requireRows(){let rows=$('reportScope').value==='all'?[...state.records]:current();if(!rows.length)throw Error(tr('Belum ada transaksi'));return rows}
async function excel(returnFile=false){
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
    sh.mergeCells('A3:E3');sh.getCell('A3').value=reportTitle();
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
    const desc=reportDescription(r);
    if(!r.photos.length){const rr=s.addRow([i+1,new Date(r.date+'T00:00:00Z'),desc,r.amount,'Tanpa Bukti']);formatRow(rr);rr.height=Math.max(32,Math.ceil(desc.length/24)*15+10);}
    for(const [j,p] of r.photos.entries()){ 
      const rr=s.addRow(j===0?[i+1,new Date(r.date+'T00:00:00Z'),desc,r.amount,'']:[`${i+1}.${j+1}`,null,null,'','']);
      formatRow(rr);const img=wb.addImage({base64:p.jpeg,extension:'jpeg'}),dim=fit(p);attach(s,rr,img,dim);
      const br=b.addRow([`${i+1}.${j+1}`,new Date(r.date+'T00:00:00Z'),desc,r.amount,'']);formatRow(br);attach(b,br,img,fit(p,280));
    }
  }
  if(b.lastRow.number===4){const empty=b.addRow(['','','Tidak ada bukti foto','','']);formatRow(empty);}
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
  const type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',name='Hinode-pengeluaran-v2.6.1-'+($('reportScope').value==='all'?'semua-':'')+today()+'.xlsx',blob=new Blob([await wb.xlsx.writeBuffer()],{type});if(returnFile)return {blob,name};download(blob,name,type);
}
function reportTitle(){return $('reportScope').value==='all'?'Semua kunjungan / 全訪問':guestName()}
function reportDescription(r){return ($('reportScope').value==='all'?'['+(state.guests.find(g=>g.id===r.guest)?.name||'Tamu')+'] ':'')+(r.description||'Belum diisi')+(r.category&&r.category!=='Lainnya'?' · '+r.category:'')}
async function pdf(){const result=buildPDF();download(result.blob,result.name,'application/pdf')}
function buildPDF(){
 const rows=[...requireRows()].sort((a,b)=>a.date.localeCompare(b.date)||String(a.created||'').localeCompare(String(b.created||'')));
 const orientation=$('orientation').value==='landscape'?'landscape':'portrait', doc=new jspdf.jsPDF({orientation,unit:'mm',format:'a4',compress:true}), W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(), M=10, T=W-2*M;
 const widths=[.065,.16,.30,.19,.285].map(x=>x*T), xs=[M];for(const w of widths)xs.push(xs.at(-1)+w);
 const navy=[23,51,78], fmt=d=>d.split('-').reverse().join('/'), period=fmt(rows[0].date)+' – '+fmt(rows.at(-1).date);let y;
 // Canvas fallback for non-Latin names/descriptions (jsPDF Helvetica is not Unicode).
 function textCell(text,x,top,w,h,{size=9,bold=false,align='center',white=false}={}){
   text=String(text??'');if(!text)return;
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(w*7));canvas.height=Math.max(1,Math.ceil(h*7));const ctx=canvas.getContext('2d');
   ctx.font=`${bold?'bold ':''}${size*2.47}px sans-serif`;ctx.fillStyle=white?'#fff':'#17334e';ctx.textAlign=align;ctx.textBaseline='middle';
   const lines=[];for(const paragraph of text.split('\n')){let line='';for(const char of paragraph){if(line&&ctx.measureText(line+char).width>canvas.width-8){lines.push(line);line=''}line+=char}lines.push(line)}
   const lineH=Math.min(size*3.05,(canvas.height-4)/Math.max(1,lines.length));const origin=canvas.height/2-(lines.length-1)*lineH/2;
   if(lineH<size*3.05)ctx.font=`${bold?'bold ':''}${Math.max(6,lineH*.78)}px sans-serif`;
   lines.forEach((line,i)=>ctx.fillText(line,align==='left'?4:align==='right'?canvas.width-4:canvas.width/2,origin+i*lineH,canvas.width-8));
   doc.addImage(canvas.toDataURL('image/png'),'PNG',x,top,w,h,undefined,'FAST');
 }
 function title(){textCell('LPK YAYASAN HINODE ABADI INDONESIA',M,7,T,8,{size:13,bold:true});textCell('LAPORAN PENGELUARAN TAMU（接待費精算書）',M,15,T,8,{size:11,bold:true});textCell(reportTitle(),M,23,T,7,{size:11,bold:true});textCell('Periode: '+period,M,30,T,6,{size:9});}
 function band(labels,top,height){doc.setFillColor(...navy);doc.rect(M,top,T,height,'F');labels.forEach((v,i)=>textCell(v,xs[i]+.5,top+.4,widths[i]-1,height-.8,{size:8.5,bold:true,white:true}));}
 function header(){title();band(['No','Tanggal','Keterangan pembelian','Pengeluaran (Rp)','Bukti kwitansi'],38,10);y=48;}
 function next(){doc.addPage('a4',orientation);header();}
 header();
 for(const [i,r] of rows.entries()){
  const proofs=r.photos.length?r.photos:[null];
  for(const [k,p] of proofs.entries()){
    const desc=k===0?reportDescription(r):'Foto tambahan';const maxImgH=orientation==='portrait'?70:48;const scale=p?Math.min((widths[4]-6)/p.width,maxImgH/p.height):0, iw=p?p.width*scale:0,ih=p?p.height*scale:0;
    const chars=Math.max(8,Math.floor((widths[2]-4)/2.05));const lines=desc.split('\n').reduce((a,b)=>a+Math.max(1,Math.ceil(b.length/chars)),0);
    const rh=Math.min(H-48-27,Math.max(17,ih+8,lines*4.2+8));if(y+rh+11>H-15)next();
    doc.setDrawColor(184,199,213);doc.setLineWidth(.2);widths.forEach((w,z)=>doc.rect(xs[z],y,w,rh));
    const vals=[k===0?String(i+1):`${i+1}.${k+1}`,fmt(r.date),desc,k===0?rupiah(r.amount):'',p?'':'Tanpa Bukti'];
    vals.forEach((v,z)=>textCell(v,xs[z]+1,y+2,widths[z]-2,rh-4,{align:z===2?'left':z===3?'right':'center',size:9}));
    if(p)doc.addImage(p.jpeg,'JPEG',xs[4]+(widths[4]-iw)/2,y+(rh-ih)/2,iw,ih);y+=rh;
  }
 }
 if(y+11>H-15)next();doc.setFillColor(...navy);doc.rect(M,y,T,11,'F');textCell('TOTAL',M,y,xs[3]-M,11,{size:10,bold:true,white:true});textCell(rupiah(rows.reduce((a,r)=>a+r.amount,0)),xs[3],y,widths[3],11,{size:9,bold:true,white:true,align:'right'});y+=11;
 if($('appendEvidence').checked)for(const [i,r] of rows.entries())for(const [k,p] of r.photos.entries()){
  doc.addPage('a4',orientation);title();textCell(`Bukti ${i+1}.${k+1} | ${fmt(r.date)} | ${rupiah(r.amount)}`,M,38,T,9,{size:10});textCell(reportDescription(r),M,47,T,10,{size:9});const scale=Math.min((T-6)/p.width,(H-75)/p.height);const iw=p.width*scale,ih=p.height*scale;doc.addImage(p.jpeg,'JPEG',(W-iw)/2,59+(H-75-ih)/2,iw,ih);
 }
 const pages=doc.getNumberOfPages();for(let n=1;n<=pages;n++){doc.setPage(n);doc.setFont('helvetica','normal');doc.setTextColor(...navy);doc.setFontSize(8);doc.text('HINODE',M,H-7);doc.text(`Halaman ${n} dari ${pages}`,W-M,H-7,{align:'right'});}
 return {blob:doc.output('blob'),name:'Hinode-pengeluaran-v2.6.1-'+($('reportScope').value==='all'?'semua-':'')+today()+'.pdf'};
}

async function backup(){let z=new JSZip(),data={version:1,guests:state.guests,records:[]};for(let r of state.records){let ps=[];for(let [i,p] of r.photos.entries()){let path=`photos/${r.id}/${i}.original`,preview=`photos/${r.id}/${i}.jpg`;z.file(path,await p.original.arrayBuffer());z.file(preview,p.jpeg.split(',')[1],{base64:true});ps.push({name:p.name,type:p.original.type,path,preview,width:p.width,height:p.height,hash:p.hash})}data.records.push({...r,photos:ps})}z.file('data.json',JSON.stringify(data,null,2));download(await z.generateAsync({type:'blob'}),'Hinode-backup-'+today()+'.zip','application/zip')}
async function restore(file){if(!file)return;let z=await JSZip.loadAsync(file),d=JSON.parse(await z.file('data.json').async('string'));if(d.version!==1||!Array.isArray(d.guests)||!Array.isArray(d.records))throw Error('Format backup tidak valid');let ids=new Set();for(let g of d.guests){if(typeof g.id!=='string'||typeof g.name!=='string'||ids.has(g.id)||(g.archived!=null&&typeof g.archived!=='boolean'))throw Error('Data tamu rusak');ids.add(g.id)}let records=[],rids=new Set();for(let r of d.records){if(typeof r.id!=='string'||rids.has(r.id)||!ids.has(r.guest)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isSafeInteger(r.amount)||r.amount<=0||r.amount>1e12||!Array.isArray(r.photos))throw Error('Data transaksi rusak');rids.add(r.id);let ps=[];for(let p of r.photos){let original=new File([await z.file(p.path).async('uint8array')],p.name,{type:p.type});let rebuilt=await photo(original);if(rebuilt.hash!==p.hash)throw Error('Bukti foto tidak sesuai checksum');ps.push(rebuilt)}records.push({...r,photos:ps})}if(confirm('Pulihkan backup? Seluruh data perangkat saat ini akan DIGANTI.')){await persist({guests:d.guests,records});selected='';reset();render()}}
async function safe(fn){if(busy)return;busy=true;updateSave();try{await fn()}catch(e){alert(tr(e.message||String(e)));$('scanStatus').textContent=tr('Periksa kembali jika proses gagal.');console.error(e)}finally{busy=false;updateSave()}}
async function init(){db=await openDB();state=await read();bindExtras();for(const id of ['date','amount','description']){$(id).addEventListener('input',updateSave);$(id).addEventListener('change',updateSave)}render();$('newGuest').onsubmit=e=>{e.preventDefault();safe(async()=>{if(editing||batchTotal)throw Error(tr('Selesaikan transaksi terlebih dahulu.'));if(hasDraft()&&!confirm(tr('Ganti kunjungan dan kosongkan form?')))return;let name=$('guestName').value.trim();if(!name)return;let g={id:uid(),name};await persist({...state,guests:[...state.guests,g]});selected=g.id;$('guestName').value='';reset();render()})};$('guest').onchange=()=>{if(busy||editing||batchTotal){$('guest').value=selected;return}if(hasDraft()&&!confirm(tr('Ganti kunjungan dan kosongkan form?'))){$('guest').value=selected;return}selected=$('guest').value;reset();render()};for(let id of ['camera','gallery'])$(id).onchange=e=>safe(async()=>{const first=photos.length===0;const files=[...e.target.files];e.target.value='';for(let f of files){let p=await photo(f);if(!photos.some(q=>q.hash===p.hash))photos.push(p)}renderPhotos();if(first&&photos.length&&$('autoScan').checked&&!editing&&!batchTotal)await scan()});$('scan').onclick=()=>safe(scan);$('entry').onsubmit=e=>{e.preventDefault();safe(save)};$('cancel').onclick=()=>{if(busy)return;reset();render()};$('excel').onclick=()=>safe(excel);$('pdf').onclick=()=>safe(pdf);$('backup').onclick=()=>safe(backup);$('restore').onchange=e=>safe(async()=>{if(batchTotal||editing)throw Error(tr('Selesaikan transaksi terlebih dahulu.'));await restore(e.target.files[0]);e.target.value=''});if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});if('serviceWorker' in navigator){try{await navigator.serviceWorker.register(new URL('sw.js',APP_BASE),{scope:APP_BASE.pathname});await navigator.serviceWorker.ready;$('offline').dataset.ready='1';$('offline').textContent=tr('Offline siap — tetap lakukan backup.')}catch(e){$('offline').textContent='Offline belum siap: '+e.message}}else $('offline').textContent='Butuh HTTPS untuk mode offline.'}
// V2.1: navigation and dashboard only; database and report logic unchanged.
function showView(name){
  if(!['home','scan','history','report','settings'].includes(name))return;
  document.querySelectorAll('[data-view]').forEach(el=>{el.hidden=el.dataset.view!==name});
  document.querySelectorAll('.nav-item').forEach(el=>{if(el.dataset.page===name)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});
  window.scrollTo(0,0);
}
function renderModernUI(){
  const active=selected?guestName():tr('Belum ada kunjungan');
  $('totalGuest').textContent=active;
  const scanGuest=$('scanGuest');scanGuest.replaceChildren();
  const placeholder=elem('option',tr('Pilih kunjungan tamu'));placeholder.value='';placeholder.disabled=true;scanGuest.append(placeholder);
  for(const g of state.guests.filter(g=>!g.archived)){const op=elem('option',g.name);op.value=g.id;scanGuest.append(op);}
  scanGuest.value=selected;
  if(!selected)$('scanGuestDetails').open=true;
  updateSave();
  document.querySelectorAll('[data-active-guest]').forEach(el=>{el.textContent=selected?tr('Kunjungan aktif')+': '+active:tr('Tambahkan kunjungan melalui Home terlebih dahulu.')});
  if(!selected){const op=elem('option',tr('Pilih / tambah kunjungan'));op.value='';$('guest').append(op);$('guestDetails').open=true;}
  const rows=[...current()].sort((a,b)=>b.date.localeCompare(a.date)||String(b.created||'').localeCompare(String(a.created||'')));
  const recent=$('recent');recent.replaceChildren();
  if(!rows.length){recent.append(elem('p',tr('Belum ada transaksi. Mulai dengan scan nota.'),'empty'));}
  for(const r of rows.slice(0,3)){
    const line=elem('div',undefined,'recent-row'), img=receiptThumb(r,'recent-thumb');
    const info=elem('div',undefined,'recent-copy');info.append(elem('strong',r.description||tr('Keterangan belum diisi')),elem('small',r.date.split('-').reverse().join('/')));
    line.append(img,info,elem('strong',rupiah(r.amount),'recent-amount'));recent.append(line);
  }
}
function bindModernUI(){
  $('deleteGuest').addEventListener('click',()=>safe(deleteActiveGuest));
  document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>showView(el.dataset.page)));
  $('newGuest').addEventListener('submit',()=>{if($('guestName').value.trim())$('guestDetails').open=false});
  $('scanGuest').addEventListener('change',()=>{
    const next=$('scanGuest').value;
    if(busy||editing||batchTotal||!state.guests.some(g=>g.id===next&&!g.archived)){$('scanGuest').value=selected;return;}
    selected=next;render(); // keep current receipt, date, amount and description
  });
  $('scanNewGuest').addEventListener('submit',e=>{
    e.preventDefault();if(busy||editing||batchTotal)return;
    safe(async()=>{
      const name=$('scanGuestName').value.trim();if(!name||name.length>150)throw Error('Nama tamu wajib diisi (maks. 150 karakter).');
      const g={id:uid(),name};await persist({...state,guests:[...state.guests,g]});selected=g.id;
      $('scanGuestName').value='';$('scanGuestDetails').open=false;render();
    });
  });
  const status=$('offline');const refresh=()=>status.parentElement.classList.toggle('ready',status.dataset.ready==='1');
  new MutationObserver(refresh).observe(status,{childList:true,characterData:true,subtree:true});refresh();
}


    // V2.4: remove only the confirmed visit and its associated receipts atomically.
    function guestDeletionSignature(data,id){
      const guest=data.guests.find(g=>g.id===id);
      return JSON.stringify([guest, data.records.filter(r=>r.guest===id).map(r=>[r.id,r.date,r.amount,r.description,r.category,r.created,r.photos.map(p=>p.hash)])]);
    }
    function persistGuestDeletion(id,signature){
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('data','readwrite'), store=tx.objectStore('data');
        let next, problem;
        const request=store.get('state');
        request.onsuccess=()=>{
          try{
            const latest=request.result||{guests:[],records:[]};
            if(!latest.guests.some(g=>g.id===id)||guestDeletionSignature(latest,id)!==signature){
              throw Error('Data kunjungan berubah di tab lain. Muat ulang aplikasi sebelum menghapus.');
            }
            next={...latest,revision:uid(),guests:latest.guests.filter(g=>g.id!==id),records:latest.records.filter(r=>r.guest!==id)};
            store.put(next,'state');
          }catch(e){problem=e;tx.abort();}
        };
        tx.oncomplete=()=>{state=next;resolve();};
        tx.onabort=()=>reject(problem||tx.error||Error('Penghapusan dibatalkan.'));
        tx.onerror=()=>reject(problem||tx.error||Error('Gagal menghapus kunjungan.'));
      });
    }
    async function deleteActiveGuest(){
      if(editing||batchTotal)throw Error(tr('Selesaikan transaksi terlebih dahulu.'));
      const id=selected, guest=state.guests.find(g=>g.id===id);
      if(!guest)return;
      const rows=state.records.filter(r=>r.guest===id), count=rows.reduce((n,r)=>n+r.photos.length,0), total=rows.reduce((n,r)=>n+r.amount,0);
      const signature=guestDeletionSignature(state,id);
      const draft=photos.length||$('date').value||$('amount').value||$('description').value.trim();
      const msg=`Hapus kunjungan "${guest.name}"?\n\n${rows.length} transaksi · ${count} foto\nTotal: ${rupiah(total)}\n\nSemua transaksi dan foto kunjungan ini akan dihapus permanen dari perangkat ini. Kunjungan lain tetap aman. Pastikan sudah membuat backup ZIP.${draft?'\nForm yang belum disimpan juga akan dikosongkan.':''}\n\nLanjutkan penghapusan?`;
      if(!confirm(lang==='ja'?`訪問「${guest.name}」を削除しますか？\n${rows.length}件・写真${count}枚\n合計 ${rupiah(total)}\n関連取引と写真は完全に削除されます。バックアップを確認してください。${draft?'\n未保存の入力も破棄します。':''}`:msg))return;
      await persistGuestDeletion(id,signature);
      selected=state.guests[0]?.id||'';
      reset();render();showView('home');
      $('deleteGuestStatus').textContent=lang==='ja'?guest.name+' を削除しました。':'Kunjungan '+guest.name+' berhasil dihapus.';
    }
    
// V2.6: additive metadata; the existing database name, store and backup schema are unchanged.
const categories=['Makan','BBM','Tol','Parkir','Hotel','Transportasi','Lainnya'];
let batchQueue=[],batchTotal=0,shareFile=null,lang='id';
const formatMoney=n=>String(n??'').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
function parseMoney(s){const v=String(s).trim().replace(/^Rp\s*/i,'');if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(v))return NaN;return Number(v.replace(/\./g,''))}
function normalizeMoney(){const el=$('amount'),before=el.value;const cursor=el.selectionStart??before.length;const count=before.slice(0,cursor).replace(/\D/g,'').length;if(/[^0-9.]/.test(before)){el.setCustomValidity(tr('Masukkan nominal Rupiah bulat tanpa koma.'));updateSave();return}el.setCustomValidity('');const raw=before.replace(/\D/g,'').replace(/^0+(?=\d)/,'');el.value=formatMoney(raw);let pos=0,n=0;while(pos<el.value.length&&n<count){if(/\d/.test(el.value[pos]))n++;pos++;}try{el.setSelectionRange(pos,pos)}catch{}updateSave()}
function hasDraft(){return !!(photos.length||$('date').value||$('amount').value||$('description').value.trim())}
function recordCategory(r){return categories.includes(r.category)?r.category:inferCategory(r.description||'')||'Lainnya'}
function inferCategory(text){const t=String(text).toLowerCase();const rules=[['BBM',/\b(pertamina|pertalite|pertamax|solar|spbu|shell|bensin|bbm|fuel)\b/],['Tol',/\b(tol|toll|gerbang tol|e-toll)\b/],['Parkir',/\b(parkir|parking)\b/],['Hotel',/\b(hotel|room charge|penginapan|akomodasi|lodging)\b/],['Transportasi',/\b(taksi|taxi|grabcar|gocar|kereta|travel|transportasi|tiket pesawat)\b/],['Makan',/\b(makan|restoran|restaurant|cafe|café|food|gofood|grabfood|dadar|nasi|kopi|minum|ayam|meal|lunch|dinner)\b/]];return rules.find(([k,re])=>re.test(t))?.[0]||''}
function suggestDescription(text){const k=inferCategory(text);$('suggestion').replaceChildren();if(!k)return;const suggestion={Makan:'Makan / minum',BBM:'Pembelian BBM',Tol:'Biaya tol',Parkir:'Biaya parkir',Hotel:'Biaya hotel',Transportasi:'Biaya transportasi'}[k];const b=button(tr('Gunakan saran: ')+tr(suggestion),()=>{$('category').value=k;$('description').value=suggestion;updateSave()});b.className='secondary';$('suggestion').append(b);if($('category').value==='Lainnya')$('category').value=k;}
function receiptThumb(r,cls){if(r.photos.length){const im=elem('img',undefined,cls);im.src=r.photos[0].jpeg;im.alt=tr('Bukti nota');return im;}return elem('div',tr('Tanpa Bukti'),cls+' no-proof')}
function viewEvidence(r){const d=elem('dialog');for(const p of r.photos){const im=elem('img');im.src=p.jpeg;d.append(im,button(tr('Simpan foto asli'),()=>showPhoto(p)))}d.append(button(tr('Tutup'),()=>{d.close();d.remove()}));document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal()}
function openRecord(r,duplicate){if(batchTotal)throw Error(tr('Selesaikan transaksi terlebih dahulu.'));if(hasDraft()&&!confirm(tr('Ganti kunjungan dan kosongkan form?')))return;reset();editing=duplicate?null:r.id;selected=r.guest;photos=duplicate?[]:[...r.photos];$('date').value=r.date;$('amount').value=formatMoney(r.amount);$('description').value=r.description||'';$('category').value=recordCategory(r);$('cancel').hidden=false;renderPhotos();render();showView('scan');if(duplicate)$('scanStatus').textContent=tr('Salinan transaksi — foto tidak disalin. Periksa sebelum menyimpan.');}
function matchesFilter(r){const q=$('search').value.trim().toLowerCase(), f=$('fromDate').value,t=$('toDate').value,k=$('filterCategory').value;return (!f||r.date>=f)&&(!t||r.date<=t)&&(!k||recordCategory(r)===k)&&(!q||[r.description,r.date,r.date.split('-').reverse().join('/'),String(r.amount),formatMoney(r.amount),rupiah(r.amount),recordCategory(r),tr(recordCategory(r))].some(v=>String(v||'').toLowerCase().includes(q)))}
async function changeGuest(delta){const g=state.guests.find(g=>g.id===selected&&!g.archived);if(!g||editing||batchTotal)throw Error(tr('Pilih kunjungan tamu'));await persist({...state,guests:state.guests.map(x=>x.id===g.id?{...x,...delta}:x)});render()}
function renderExtras(){
 const rows=current();
 const arc=$('archives');arc.replaceChildren();for(const g of state.guests.filter(x=>x.archived)){const item=elem('div',undefined,'archive-item');item.append(elem('strong',g.name),elem('small',rupiah(state.records.filter(r=>r.guest===g.id).reduce((a,r)=>a+r.amount,0))),button(tr('Aktifkan kembali'),async()=>{if(editing||batchTotal)throw Error(tr('Selesaikan transaksi terlebih dahulu.'));if(hasDraft()&&!confirm(tr('Ganti kunjungan dan kosongkan form?')))return;await persist({...state,guests:state.guests.map(x=>x.id===g.id?{...x,archived:false}:x)});selected=g.id;reset();render()}));arc.append(item)}if(!arc.children.length)arc.append(elem('p',tr('Belum ada arsip.')));
 const day=new Map(),cat=new Map();for(const r of rows){day.set(r.date,(day.get(r.date)||0)+r.amount);const k=recordCategory(r);cat.set(k,(cat.get(k)||0)+r.amount)}drawBars('dailyStats',[...day].sort());drawBars('categoryStats',[...cat].sort((a,b)=>b[1]-a[1]));renderBatch();translateStatic();invalidateShare();
}
function drawBars(id,entries){const e=$(id);e.replaceChildren();if(!entries.length){e.append(elem('p',tr('Belum ada transaksi')));return}const max=Math.max(1,...entries.map(x=>x[1]));for(const [k,v] of entries){const line=elem('div',undefined,'stat-line'), top=elem('div',undefined,'stat-label'),track=elem('div',undefined,'stat-track'),bar=elem('div',undefined,'stat-bar');top.append(elem('span',tr(k)),elem('strong',rupiah(v)));bar.style.width=(100*v/max)+'%';track.append(bar);line.append(top,track);e.append(line)}}
function renderBatch(){$('batchStatus').textContent=batchTotal?`${tr('Multi Scan')}: ${batchTotal-batchQueue.length}/${batchTotal} · ${batchQueue.length} ${tr('nota menunggu')}`:'';$('skipBatch').hidden=!batchTotal;}
async function nextBatch(){if(!batchQueue.length)return;reset();const file=batchQueue.shift();renderBatch();showView('scan');try{photos=[await photo(file)];renderPhotos();await scan()}catch(e){$('scanStatus').textContent=tr('OCR gagal. Isi manual atau foto ulang.')+' '+e.message;renderPhotos()}}
// Conservative crop: isolate bright paper only if edge samples support a dark surround. Rotate OCR copy only.
async function cropRotate(p,angle){const im=new Image();im.src=p.jpeg;await im.decode();let w=im.width,h=im.height, c= document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);let x0=0,y0=0,x1=w,y1=h;const d=ctx.getImageData(0,0,w,h).data;const lum=(x,y)=>{let k=(y*w+x)*4;return .299*d[k]+.587*d[k+1]+.114*d[k+2]};let edge=0,n=0;for(let x=0;x<w;x+=Math.max(1,Math.floor(w/40))){edge+=lum(x,0)+lum(x,h-1);n+=2}for(let y=0;y<h;y+=Math.max(1,Math.floor(h/40))){edge+=lum(0,y)+lum(w-1,y);n+=2}
 if(edge/n<120){let a=w,b=h,z=0,t=0,count=0;const step=Math.max(2,Math.floor(Math.max(w,h)/300));for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step)if(lum(x,y)>175){a=Math.min(a,x);b=Math.min(b,y);z=Math.max(z,x);t=Math.max(t,y);count++}if(count>100&&(z-a)>.22*w&&(t-b)>.22*h&&(z-a)*(t-b)<.90*w*h){x0=Math.max(0,a-20);y0=Math.max(0,b-20);x1=Math.min(w,z+20);y1=Math.min(h,t+20)}}
 if(angle===0&&x0===0&&y0===0&&x1===w&&y1===h)return null;const cw=x1-x0,ch=y1-y0;let out=document.createElement('canvas');out.width=angle%180?ch:cw;out.height=angle%180?cw:ch;const g=out.getContext('2d');g.translate(out.width/2,out.height/2);g.rotate(angle*Math.PI/180);g.drawImage(im,x0,y0,cw,ch,-cw/2,-ch/2,cw,ch);return out.toDataURL('image/png')}
// Integer arithmetic calculator; no eval, no decimal or grouping ambiguity.
function calculate(s){const str=String(s).replace(/\s/g,'').replace(/[×x]/gi,'*').replace(/÷/g,'/');if(!/^[0-9+*/()-]+$/.test(str)||str.length>120)throw Error(tr('Rumus tidak valid'));let i=0;function factor(){if(str[i]==='('){i++;const n=expr();if(str[i++]!==')')throw Error(tr('Rumus tidak valid'));return n}const m=str.slice(i).match(/^\d+/);if(!m)throw Error(tr('Rumus tidak valid'));i+=m[0].length;return Number(m[0])}function term(){let v=factor();while(str[i]==='*'||str[i]==='/'){let op=str[i++],b=factor();v=op==='*'?v*b:v/b}return v}function expr(){let v=term();while(str[i]==='+'||str[i]==='-'){let op=str[i++],b=term();v=op==='+'?v+b:v-b}return v}const n=expr();if(i!==str.length||!Number.isSafeInteger(n)||n<=0||n>1e12)throw Error(tr('Hasil harus berupa Rupiah bulat positif.'));return n}
function invalidateShare(){shareFile=null;$('share').hidden=true;$('shareStatus').textContent=''}
function setTheme(v){localStorage.setItem('hinode-v26-theme',v);document.documentElement.dataset.theme=v;$('theme').value=v}
function bindExtras(){
 $('category').replaceChildren(...categories.map(k=>{let o=elem('option',tr(k));o.value=k;return o}));$('category').value='Lainnya';$('filterCategory').replaceChildren(...['',...categories].map(k=>{let o=elem('option',tr(k||'Semua kategori'));o.value=k;return o}));
 for(const k of categories){const b=button(tr(k),()=>{$('category').value=k;if(!$('description').value.trim()&&k!=='Lainnya')$('description').value=k;updateSave()});$('quickCategories').append(b)}
 $('amount').addEventListener('input',normalizeMoney);$('amount').addEventListener('paste',e=>{const v=e.clipboardData?.getData('text')?.trim();if(v&&Number.isNaN(parseMoney(v))&&!/^\d+$/.test(v)){e.preventDefault();alert(tr('Masukkan nominal Rupiah bulat tanpa koma.'))}});
 $('renameGuest').onclick=()=>safe(async()=>{const g=state.guests.find(x=>x.id===selected);if(!g)return;const n=prompt(tr('Nama kunjungan'),g.name);if(n===null)return;const name=n.trim();if(!name||name.length>150)throw Error(tr('Nama tamu wajib diisi (maks. 150 karakter).'));await changeGuest({name})});
 $('archiveGuest').onclick=()=>safe(async()=>{if(!selected)return;if(!confirm(tr('Arsipkan kunjungan? Data dan foto tetap tersimpan.')))return;if(hasDraft()&&!confirm(tr('Ganti kunjungan dan kosongkan form?')))return;await changeGuest({archived:true});reset();render()});
 for(const id of ['search','fromDate','toDate','filterCategory'])$(id).addEventListener('input',()=>render());$('clearFilter').onclick=()=>{for(const id of ['search','fromDate','toDate','filterCategory'])$(id).value='';render()};
 $('calc').onclick=()=>safe(()=>{const s=prompt(tr('Masukkan rumus, contoh 5000+27500'),String(parseMoney($('amount').value)||''));if(s!==null){$('amount').value=formatMoney(calculate(s));$('amount').setCustomValidity('');updateSave()}});
 $('batch').onchange=e=>{const files=[...e.target.files];e.target.value='';safe(async()=>{if(!files.length)return;if(!selected)throw Error(tr('Pilih kunjungan tamu'));if(editing||batchTotal)throw Error(tr('Selesaikan transaksi terlebih dahulu.'));if(hasDraft()&&!confirm(tr('Ganti kunjungan dan kosongkan form?')))return;if(files.length>30)throw Error(tr('Maksimal 30 nota per antrean.'));batchQueue=files;batchTotal=files.length;await nextBatch()})};
 $('skipBatch').onclick=()=>safe(()=>{if(confirm(tr('Batalkan antrean? Transaksi yang sudah disimpan tetap aman.'))){batchQueue=[];batchTotal=0;reset();render()}});
 for(const id of ['reportScope','orientation','appendEvidence'])$(id).addEventListener('change',invalidateShare);
 for(const [id,build] of [['prepareShare',()=>buildPDF()],['prepareShareExcel',()=>excel(true)]])$(id).onclick=()=>safe(async()=>{invalidateShare();const result=await build();shareFile=new File([result.blob],result.name,{type:result.blob.type});$('share').hidden=false;$('shareStatus').textContent=tr('File siap. Tekan Bagikan file.');});
 $('share').onclick=async()=>{const file=shareFile;if(!file)return;try{if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'HINODE Guest Expense'});else{download(file,file.name,file.type);$('shareStatus').textContent=tr('Bagikan file dari folder unduhan.')}}catch(e){if(e.name!=='AbortError'){$('shareStatus').textContent=tr('Bagikan file dari folder unduhan.');download(file,file.name,file.type)}}};
 $('theme').onchange=()=>setTheme($('theme').value);setTheme(localStorage.getItem('hinode-v26-theme')||'light');
 $('language').onchange=()=>{lang=$('language').value;if($('offline').dataset.ready==='1')$('offline').textContent=tr('Offline siap — tetap lakukan backup.');localStorage.setItem('hinode-v26-lang',lang);translateStatic();for(const id of ['category','filterCategory'])for(const o of $(id).options)o.textContent=tr(o.value||'Semua kategori');[...$('quickCategories').children].forEach((b,i)=>b.textContent=tr(categories[i]));render()};lang=localStorage.getItem('hinode-v26-lang')==='ja'?'ja':'id';$('language').value=lang;for(const id of ['category','filterCategory'])for(const o of $(id).options)o.textContent=tr(o.value||'Semua kategori');[...$('quickCategories').children].forEach((b,i)=>b.textContent=tr(categories[i]));translateStatic();
}
const JA={
'RINGKASAN':'概要','Dashboard':'ダッシュボード','Kelola biaya kunjungan dengan mudah.':'接待費を簡単に管理できます。','Total pengeluaran':'支出合計','Kunjungan aktif':'選択中の訪問','Belum ada kunjungan':'訪問がありません','Kunjungan tamu':'訪問先','Edit nama kunjungan':'訪問名を編集','Arsipkan kunjungan':'訪問をアーカイブ','Arsip kunjungan':'アーカイブ','Tambah kunjungan baru':'訪問を追加','+ Tambah kunjungan baru':'＋ 訪問を追加','Tambah kunjungan':'訪問を追加','Nama tamu / perusahaan':'来客名・会社名','Hapus kunjungan aktif':'選択中の訪問を削除','Statistik pengeluaran':'支出統計','Per hari':'日別','Per kategori':'項目別','Akses cepat':'クイックアクセス','Scan nota':'領収書スキャン','Catat pengeluaran':'支出を記録','Riwayat':'履歴','Lihat transaksi':'取引を見る','Laporan':'レポート','Excel dan PDF':'Excel・PDF','Transaksi terbaru':'最近の取引','Lihat semua':'すべて表示','INPUT NOTA':'領収書入力','Foto kwitansi':'領収書写真','Buka kamera':'カメラを開く','Pilih galeri':'写真を選択','Unggah foto':'写真を追加','Foto kwitansi opsional. Input manual tetap bisa disimpan.':'領収書写真は任意です。手入力でも保存できます。','OCR otomatis':'自動OCR','Multi Scan — satu foto per transaksi':'一括スキャン（1枚につき1取引）','Batalkan antrean':'スキャン待ちを取消','Baca tanggal & nominal (OCR)':'日付・金額を読み取る（OCR）','Teks hasil OCR':'OCR結果','Tanggal pembelian':'購入日','Jumlah pengeluaran (Rp)':'支出金額（Rp）','Kalkulator nominal':'電卓','Kategori':'費目','Keterangan pembelian':'購入内容','Contoh: Makan siang tamu, BBM':'例：昼食、燃料代','Lengkapi semua data untuk menyimpan.':'必要項目を入力してください。','Simpan transaksi':'取引を保存','Batal edit':'編集を取消','TRANSAKSI':'取引','Riwayat pengeluaran':'支出履歴','Cari transaksi':'取引を検索','Keterangan / nominal / tanggal':'内容・金額・日付','Dari tanggal':'開始日','Sampai tanggal':'終了日','Reset filter':'絞り込みを解除','DOKUMEN':'書類','Export laporan':'レポート出力','Cakupan laporan':'出力範囲','Semua kunjungan (termasuk arsip)':'全訪問（アーカイブ含む）','Orientasi PDF':'PDFの向き','A4 Portrait':'A4 縦','A4 Landscape':'A4 横','Lampiran bukti ukuran besar':'領収書の拡大添付','Laporan bilingual dengan foto bukti transaksi.':'領収書写真付きの二言語レポート。','Export Excel + foto':'Excel（写真付き）','Workbook .xlsx · A4 landscape':'Excelファイル・A4横','Download PDF + Bukti':'PDFダウンロード（証憑付き）','Laporan dan lampiran bukti':'レポートと証憑','Siapkan PDF untuk dibagikan':'共有用PDFを作成','Bagikan PDF':'PDFを共有','Siapkan Excel untuk dibagikan':'共有用Excelを作成','Bagikan file':'ファイルを共有','File siap. Tekan Bagikan file.':'ファイルができました。共有を押してください。','PENYIMPANAN':'保存','Pengaturan':'設定','Kelola dan amankan data perangkat.':'端末のデータ管理・保護。','Tampilan & bahasa':'表示と言語','Mode tampilan':'表示モード','Terang':'ライト','Gelap':'ダーク','Ikuti sistem':'システム設定','Bahasa':'言語','Indonesia':'インドネシア語','Backup & pemulihan':'バックアップと復元','Data tersimpan pada perangkat ini, tidak otomatis sinkron.':'端末に保存されます。自動同期はありません。','Backup ZIP semua kunjungan':'全訪問のZIPバックアップ','Pulihkan backup ZIP':'ZIPバックアップを復元','Pemulihan mengganti data yang ada. Simpan backup terlebih dahulu.':'復元は現在のデータを上書きします。先にバックアップしてください。','Tentang aplikasi':'アプリについて','OCR lokal · PWA offline':'ローカルOCR・オフラインPWA','Home':'ホーム','Scan':'スキャン','Makan':'食事','BBM':'燃料','Tol':'高速料金','Parkir':'駐車','Hotel':'宿泊','Transportasi':'交通','Lainnya':'その他','Semua kategori':'全費目','Tanpa Bukti':'証憑なし','transaksi':'件','foto':'枚','Keterangan belum diisi':'内容未入力','Lihat bukti':'証憑を見る','Edit':'編集','Duplikat':'複製','Hapus':'削除','Selesaikan transaksi terlebih dahulu.':'先に取引を完了してください。','Hapus transaksi dan foto?':'取引と写真を削除しますか？','Tidak ada transaksi yang cocok.':'該当する取引がありません。','kunjungan tamu':'訪問先','tanggal pembelian':'購入日','nominal yang valid':'有効な金額','keterangan pembelian':'購入内容','Sedang memproses…':'処理中…','Belum lengkap: ':'未入力：','Semua data lengkap. Siap disimpan.':'入力完了。保存できます。','Siap disimpan — tanpa bukti foto.':'保存できます（証憑なし）。','Pilih kunjungan tamu':'訪問先を選択','Tanggal, nominal atau keterangan tidak valid.':'日付・金額・内容を確認してください。','Potensi nota ganda: foto sama atau tanggal dan nominal sama. Tetap simpan?':'重複の可能性があります。保存しますか？','Belum ada transaksi':'取引がありません','Makan / minum':'飲食費','Pembelian BBM':'燃料費','Biaya tol':'高速料金','Biaya parkir':'駐車料金','Biaya hotel':'宿泊費','Biaya transportasi':'交通費','Gunakan saran: ':'候補を使用：','Bukti nota':'領収書','Simpan foto asli':'元の写真を保存','Tutup':'閉じる','Ganti kunjungan dan kosongkan form?':'入力中の内容を破棄しますか？','Salinan transaksi — foto tidak disalin. Periksa sebelum menyimpan.':'取引を複製しました。写真は含みません。保存前に確認してください。','Pengeluaran':'支出','Aktifkan kembali':'再開','Belum ada arsip.':'アーカイブはありません。','Multi Scan':'一括スキャン','nota menunggu':'件待機中','OCR gagal. Isi manual atau foto ulang.':'OCR失敗。手入力または再撮影してください。','Rumus tidak valid':'計算式が無効です','Hasil harus berupa Rupiah bulat positif.':'正の整数のルピアを入力してください。','Masukkan nominal Rupiah bulat tanpa koma.':'整数のルピアを入力してください。','Nama kunjungan':'訪問名','Nama tamu wajib diisi (maks. 150 karakter).':'訪問名を入力してください（150文字以内）。','Arsipkan kunjungan? Data dan foto tetap tersimpan.':'訪問をアーカイブしますか？データと写真は保持されます。','Nominal tidak valid':'金額が無効です','Masukkan rumus, contoh 5000+27500':'計算式を入力（例：5000+27500）','Maksimal 30 nota per antrean.':'1回につき最大30枚。','Batalkan antrean? Transaksi yang sudah disimpan tetap aman.':'待機中のスキャンを取消しますか？保存済み取引は保持されます。','PDF siap. Tekan Bagikan PDF.':'PDFができました。共有を押してください。','Bagikan file dari folder unduhan.':'ダウンロードフォルダから共有してください。','Mencoba perbaikan posisi foto…':'写真の向きを補正中…','Belum ada transaksi. Mulai dengan scan nota.':'取引がありません。領収書をスキャンしてください。','Pilih / tambah kunjungan':'訪問を選択・追加','Tambahkan kunjungan melalui Home terlebih dahulu.':'ホームから訪問を追加してください。','Menyiapkan mode offline…':'オフライン準備中…','Offline siap — tetap lakukan backup.':'オフライン準備完了。バックアップしてください。','Menyiapkan OCR…':'OCR準備中…','Nominal belum terbaca. Isi manual.':'金額が読めません。手入力してください。','Beberapa tanggal ditemukan. Pilih tanggal pembelian.':'複数の日付を検出しました。購入日を選択してください。','Tanggal belum terbaca. Isi manual atau foto ulang.':'日付が読めません。手入力または再撮影してください。','Tanggal ditemukan. Periksa tanggal dan nominal sebelum menyimpan.':'日付を検出しました。保存前に金額と日付を確認してください。','Pilih tanggal yang sesuai dengan nota:':'領収書と一致する日付を選択：','Tanggal terbaca — cocokkan dengan nota:':'検出日付 — 領収書と照合：','Periksa kembali jika proses gagal.':'処理に失敗しました。確認してください。','Foto terlalu besar (maks. 30 MB)':'画像が大きすぎます（最大30MB）','Tambahkan foto dahulu':'写真を追加してください','Aset OCR belum tersedia':'OCRデータがありません','Pulihkan backup? Seluruh data perangkat saat ini akan DIGANTI.':'バックアップを復元しますか？現在のデータは上書きされます。'};
function tr(s){return lang==='ja'?(JA[s]||s):s}
const translatedNodes=new WeakMap(),translatedAttrs=new WeakMap();
function translateStatic(){document.documentElement.lang=lang;const root=document.body;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){if(n.parentElement.closest('script,style,#raw,#history,#recent,#archives,#dailyStats,#categoryStats,#guest,#scanGuest,#totalGuest,#photos,#suggestion,#count,#saveHint,#scanStatus,#batchStatus,#shareStatus,#deleteGuestStatus,#category,#filterCategory,#quickCategories,[data-active-guest]'))continue;const raw=translatedNodes.get(n)||n.nodeValue;const key=raw.trim();if(JA[key]){translatedNodes.set(n,raw);const translated=raw.replace(key,tr(key));if(n.nodeValue!==translated)n.nodeValue=translated;}}for(const el of root.querySelectorAll('[placeholder],[aria-label]'))for(const a of ['placeholder','aria-label'])if(el.hasAttribute(a)){let prev=translatedAttrs.get(el)||{};let raw=prev[a]||el.getAttribute(a);if(JA[raw]){prev[a]=raw;translatedAttrs.set(el,prev);el.setAttribute(a,tr(raw))}}}

if(typeof document!=='undefined'){bindModernUI();init().catch(e=>alert('Gagal membuka aplikasi: '+e.message));}
