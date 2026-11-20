function pdfSafe(value){
 return String(value??'').replace(/[^\x20-\x7EÀ-ÿ]/g,' ');
}
function hexToRgb(hex,fallback=[91,33,182]){
 const clean=String(hex||'').replace('#','').trim();
 if(!/^[0-9a-f]{6}$/i.test(clean))return fallback;
 return [parseInt(clean.slice(0,2),16),parseInt(clean.slice(2,4),16),parseInt(clean.slice(4,6),16)];
}
function mixRgb(a,b,t){
 return a.map((v,i)=>Math.round(v+(b[i]-v)*t));
}
function pdfBrand(){
 const primary=hexToRgb(appSettings.primary_color,[91,33,182]);
 const header=hexToRgb(appSettings.header_color,[53,16,111]);
 const issuer=appSettings.organization_name||appSettings.app_name||appSettings.doc_issuer_name||'K9 Academy';
 return{
  primary,header,
  pale:mixRgb(primary,[255,255,255],.90),
  pale2:mixRgb(primary,[255,255,255],.965),
  dark:mixRgb(header,[0,0,0],.18),
  issuer,
  subtitle:appSettings.app_subtitle||'',
  footer:appSettings.footer_text||'',
  place:appSettings.doc_issue_place||'',
  signer:appSettings.doc_signer_name||'',
  signerRole:appSettings.doc_signer_role||''
 };
}
async function blobToDataUrl(blob){
 return await new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(reader.result);
  reader.onerror=()=>reject(new Error('Impossibile leggere il logo.'));
  reader.readAsDataURL(blob);
 });
}
async function pdfLogoData(){
 try{
  const source=await resolveOfficialLogoSource();
  if(!source)return null;
  const response=await fetch(source,{cache:'no-store'});
  if(!response.ok)throw new Error('Logo non raggiungibile');
  const blob=await response.blob();
  const dataUrl=await blobToDataUrl(blob);
  const format=(blob.type||'').includes('jpeg')?'JPEG':'PNG';
  return{dataUrl,format};
 }catch(e){
  console.warn('Logo PDF non disponibile:',e);
  return null;
 }
}
function pdfAddLogo(doc,logo,x,y,maxW,maxH){
 if(!logo)return false;
 try{
  const props=doc.getImageProperties(logo.dataUrl);
  const ratio=Math.min(maxW/props.width,maxH/props.height);
  const w=props.width*ratio,h=props.height*ratio;
  doc.addImage(logo.dataUrl,logo.format,x+(maxW-w)/2,y+(maxH-h)/2,w,h,undefined,'FAST');
  return true;
 }catch(e){
  console.warn('Inserimento logo PDF fallito:',e);return false;
 }
}

async function trimTransparentLogoData(logo){
 if(!logo?.dataUrl)return logo;
 try{
  const img=new Image();
  img.src=logo.dataUrl;
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});
  const canvas=document.createElement('canvas');
  canvas.width=img.naturalWidth||img.width;
  canvas.height=img.naturalHeight||img.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0);
  const data=ctx.getImageData(0,0,canvas.width,canvas.height);
  let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
  const alphaThreshold=8;
  for(let y=0;y<canvas.height;y++){
   for(let x=0;x<canvas.width;x++){
    const a=data.data[(y*canvas.width+x)*4+3];
    if(a>alphaThreshold){
     if(x<minX)minX=x;if(x>maxX)maxX=x;
     if(y<minY)minY=y;if(y>maxY)maxY=y;
    }
   }
  }
  if(maxX<minX||maxY<minY)return logo;
  const w=maxX-minX+1,h=maxY-minY+1;
  const out=document.createElement('canvas');
  out.width=w;out.height=h;
  out.getContext('2d').drawImage(canvas,minX,minY,w,h,0,0,w,h);
  return{dataUrl:out.toDataURL('image/png'),format:'PNG'};
 }catch(e){
  console.warn('Ritaglio automatico logo non disponibile:',e);
  return logo;
 }
}
async function pdfAddWatermarkLogo(doc,logo,cx,cy,targetDiameter=210,opacity=.11){
 if(!logo)return false;
 try{
  const trimmed=await trimTransparentLogoData(logo);
  const props=doc.getImageProperties(trimmed.dataUrl);
  const ratio=Math.min(targetDiameter/props.width,targetDiameter/props.height);
  const w=props.width*ratio,h=props.height*ratio;
  const x=cx-w/2,y=cy-h/2;
  const g=doc.GState?new doc.GState({opacity}):null;
  if(g)doc.setGState(g);
  doc.addImage(trimmed.dataUrl,trimmed.format||'PNG',x,y,w,h,undefined,'FAST');
  if(g)doc.setGState(new doc.GState({opacity:1}));
  return true;
 }catch(e){
  console.warn('Filigrana PDF fallita:',e);return false;
 }
}
function pdfRoundRectFill(doc,x,y,w,h,r,rgb){
 doc.setFillColor(...rgb);doc.roundedRect(x,y,w,h,r,r,'F');
}
function pdfText(doc,text,x,y,size=10,style='normal',rgb=[35,35,45],options={}){
 doc.setFont('helvetica',style);
 doc.setFontSize(size);
 doc.setTextColor(...rgb);
 // jsPDF accetta anche array di righe. Non convertirli con String(), altrimenti
 // le righe vengono unite da virgole e il testo esce dai riquadri.
 const safeText=Array.isArray(text)?text.map(line=>pdfSafe(line)):pdfSafe(text);
 doc.text(safeText,x,y,options);
}
function pdfSectionTitle(doc,title,y,brand){
 pdfRoundRectFill(doc,15,y,180,9,2,brand.pale);
 pdfText(doc,title.toUpperCase(),20,y+6.2,10,'bold',brand.primary);
 return y+14;
}
function pdfField(doc,label,value,x,y,w,brand,opts={}){
 const h=opts.h||18;
 pdfRoundRectFill(doc,x,y,w,h,2,opts.fill||brand.pale2);
 pdfText(doc,label.toUpperCase(),x+4,y+5,7.5,'bold',[105,100,115]);
 const lines=doc.splitTextToSize(pdfSafe(value||'—'),w-8);
 pdfText(doc,lines,x+4,y+10.5,opts.valueSize||11,opts.bold===false?'normal':'bold',[32,28,38]);
 return y+h;
}
function pdfStatusPill(doc,label,x,y,w,brand,type='ok'){
 const fill=type==='ok'?[220,252,231]:type==='bad'?[254,226,226]:[254,249,195];
 const text=type==='ok'?[22,101,52]:type==='bad'?[153,27,27]:[146,64,14];
 pdfRoundRectFill(doc,x,y,w,10,5,fill);
 pdfText(doc,label,x+w/2,y+6.7,9.5,'bold',text,{align:'center'});
}
function pdfFooter(doc,code,brand){
 const h=doc.internal.pageSize.height;
 doc.setDrawColor(...brand.pale);doc.line(15,h-17,195,h-17);
 pdfText(doc,brand.issuer,15,h-10,7.5,'bold',[100,96,108]);
 pdfText(doc,`Codice documento: ${code}`,195,h-10,7.5,'normal',[100,96,108],{align:'right'});
}
function theoryHumanStatus(x){
 if(x.passed===true)return 'SUPERATA';
 if(x.passed===false)return 'NON SUPERATA';
 return ['submitted','expired'].includes(x.status)?'CONCLUSA':'DA SVOLGERE';
}

function examSignatures(x,brand){
 const teacher=x.teacher_name||x.assigned_by_name||x.creator_name||x.created_by_name||'';
 const evaluator=x.evaluator_name||x.evaluator_email||'';
 const responsible=brand.signer||'';
 return{
  teacher,
  evaluator,
  responsible,
  responsibleRole:brand.signerRole||'Responsabile'
 };
}
function examDateHuman(x){
 return new Date(x.practical_completed_at||x.submitted_at||x.assigned_at||Date.now()).toLocaleDateString('it-IT');
}
function examComponentsText(x){
 return normalizePracticalComponents(x.practical_components).map((c,i)=>`Componente ${i+1}: ${c.name} — ${componentStatusLabel(c.status)}`).join('\n')||'Non generate';
}
function documentCode(x,type='report'){
 const existing=documentArchiveData.find(d=>d.assignment_id===(x.id||x.assignment_id)&&d.document_type===type);if(existing)return existing.document_code;
 const year=new Intl.DateTimeFormat('it-IT',{year:'numeric',timeZone:'Europe/Rome'}).format(new Date(x.assigned_at||Date.now()));
 const disc=String(x.discipline||'exam').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5);
 const short=String(x.id||x.assignment_id||'00000000').replace(/-/g,'').toUpperCase();
 return `${type==='certificate'?'ATT':type==='candidate_report'?'RPT':'VER'}-${year}-${disc}-${short}`;
}

function normalizeDocumentCode(value){
 return String(value||'')
  .trim()
  .toUpperCase()
  .replace(/^N\.?\s*/,'')
  .replace(/\s+/g,'');
}
function documentGroupCodeFromCode(value){
 return normalizeDocumentCode(value).replace(/^(ATT|VER|RPT)-/,'');
}
function associatedDocumentCode(value){
 const code=normalizeDocumentCode(value);
 if(code.startsWith('ATT-'))return 'VER-'+code.slice(4);
 if(code.startsWith('VER-'))return 'ATT-'+code.slice(4);
 return '';
}
async function pdfFingerprint(doc,fileName){
 if(!window.crypto?.subtle)throw new Error('Verifica integrità PDF non disponibile su questo dispositivo.');
 const buffer=doc.output('arraybuffer');
 const digest=await crypto.subtle.digest('SHA-256',buffer);
 const sha256=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
 return {buffer,file_name:fileName,file_sha256:sha256,file_size_bytes:buffer.byteLength};
}
function downloadExactPdfBuffer(buffer,fileName){
 const blob=new Blob([buffer],{type:'application/pdf'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');
 a.href=url;a.download=fileName;a.rel='noopener';
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function k9BytesToBase64(buffer){const bytes=new Uint8Array(buffer);let result='';for(let i=0;i<bytes.length;i+=32768)result+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(result);}
async function registerAndDownloadExamPdf(doc,x,type,code){
 const fileName=`${code}.pdf`,trace=await pdfFingerprint(doc,fileName);
 const previous=documentArchiveData.find(d=>d.assignment_id===(x.id||x.assignment_id)&&d.document_type===type);
 let reason=null;
 if(previous){
  if(profile?.role!=='super_admin')throw new Error('Documento già emesso. Scarica l’originale dall’archivio.');
  reason=prompt('Motivo della riemissione (annulla per non emettere una nuova versione):');if(!reason?.trim())throw new Error('Riemissione annullata.');
 }
 const metadata={discipline:x.discipline||null,final_status:finalExamStatus(x).label,organization_name:pdfBrand().issuer,score_percentage:x.score_percentage??null,correct_answers:x.correct_answers??null,question_count:x.question_count??null,practical_score:x.practical_score??null,professional_score:x.professional_score??null,reissue_reason:reason};
 const{data,error}=await sb.rpc('k9_save_pdf',{p_assignment_id:x.id||x.assignment_id,p_document_type:type,p_document_code:code,p_metadata:metadata,p_file_name:fileName,p_pdf_base64:k9BytesToBase64(trace.buffer)});
 if(error)throw new Error('Registrazione documento non riuscita: '+error.message);
 if(data?.sha256!==trace.file_sha256)throw new Error('Impronta PDF non coincidente.');
 downloadExactPdfBuffer(trace.buffer,fileName);await loadDocumentArchive(true,true);return trace;
}
async function k9DownloadOriginal(id,generation=null){try{const{data,error}=await sb.rpc('k9_download_pdf',{p_document:id,p_generation:generation});if(error)throw error;if((data.status==='revoked'||data.status==='superseded')&&!confirm('Documento revocato o superato: scaricare solo per archivio?'))return;const bytes=Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0));downloadExactPdfBuffer(bytes.buffer,data.file_name);}catch(e){note(e.message,true)}}
async function k9RevokeDocument(id){const reason=prompt('Motivo della revoca:');if(!reason?.trim())return;const{error}=await sb.rpc('k9_revoke_document',{p_document:id,p_reason:reason.trim()});if(error)return note(error.message,true);note('Documento revocato.');await loadDocumentArchive(false,true);}
function documentTypeHuman(type){
 return type==='certificate'?'Attestato':type==='candidate_report'?'Report completo':'Verbale';
}
async function verifyPdfFileIntegrity(){
 if(!requirePermission('verify_documents','Verifica documenti non abilitata per questo ruolo.'))return null;
 const input=$('documentVerifyFile'),box=$('documentVerifyFileResult'),btn=$('documentVerifyFileBtn');
 if(!input||!box)return null;
 const file=input.files?.[0];
 box.classList.remove('hidden','valid','invalid');
 if(!file){box.classList.add('invalid');box.innerHTML='<b>Seleziona prima un file PDF.</b>';return null}
 if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf'){box.classList.add('invalid');box.innerHTML='<b>Il file selezionato non è un PDF.</b>';return null}
 try{
   if(btn){btn.disabled=true;btn.textContent='Verifica in corso...'}
   const buffer=await file.arrayBuffer();
   const digest=await crypto.subtle.digest('SHA-256',buffer);
   const sha=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
   await loadDocumentArchive(true,true);
   let match=null,gen=null;
   for(const row of (documentArchiveData||[])){
     const history=Array.isArray(row.generation_history)?row.generation_history:[];
     const found=history.find(g=>String(g.file_sha256||'').toLowerCase()===sha);
     if(found){match=row;gen=found;break}
   }
   if(!match){
     box.classList.add('invalid');
     box.innerHTML=`<div class="bar"><b>PDF non corrispondente</b><span class="spacer"></span><span class="result-state bad">NON VERIFICATO</span></div><p class="status">L’impronta digitale di <strong>${htmlSafe(file.name)}</strong> non corrisponde a nessuna generazione PDF registrata nell’archivio accessibile. Il file potrebbe essere stato modificato, provenire da un’altra installazione oppure essere precedente alla tracciabilità PDF.</p>`;
     return null;
   }
   const superseded=Number(gen.generation_number)!==Number(match.generation_count);
   const revoked=match.status==='revoked'||superseded;
   const sameSize=Number(gen.file_size_bytes||0)===Number(file.size||0);
   box.classList.add(revoked?'invalid':'valid');
   box.innerHTML=`<div class="bar"><b>${superseded?'Impronta corrispondente, versione superata':revoked?'Impronta corrispondente, documento revocato':'PDF corrispondente al registro'}</b><span class="spacer"></span><span class="result-state ${revoked?'bad':'ok'}">${superseded?'SUPERATO':revoked?'REVOCATO':'VERIFICATO'}</span></div><div class="document-verify-grid"><div class="document-verify-item"><span class="meta">Documento</span><b>${htmlSafe(match.document_code||'—')}</b></div><div class="document-verify-item"><span class="meta">Tipo</span><b>${documentTypeHuman(match.document_type)}</b></div><div class="document-verify-item"><span class="meta">Corsista</span><b>${htmlSafe(match.student_name||'—')}</b></div><div class="document-verify-item"><span class="meta">Generazione verificata</span><b>${Number(gen.generation_number||0)}</b></div><div class="document-verify-item"><span class="meta">Registrata il</span><b>${gen.generated_at?new Date(gen.generated_at).toLocaleString('it-IT'):'—'}</b></div><div class="document-verify-item"><span class="meta">Dimensione</span><b>${humanFileSize(file.size)}${sameSize?'':' · non coerente'}</b></div><div class="document-verify-item"><span class="meta">Integrità digitale</span><b>Impronta corrispondente al registro</b></div><div class="document-verify-item"><span class="meta">Stato registro</span><b>${superseded?'SUPERATO':revoked?'REVOCATO':'VALIDO'}</b></div></div><p class="status">Il confronto è stato eseguito localmente sul contenuto effettivo del PDF selezionato. Il codice tecnico dell’impronta non viene mostrato nell’interfaccia.</p>`;
   return {document:match,generation:gen};
 }catch(e){box.classList.add('invalid');box.innerHTML=`<b>Verifica PDF non riuscita</b><p class="status">${htmlSafe(String(e.message||e))}</p>`;return null}
 finally{if(btn){btn.disabled=false;btn.textContent='Verifica PDF'}}
}

async function verifyDocumentCode(){
 if(!requirePermission('verify_documents','Verifica documenti non abilitata per questo ruolo.'))return null;
 const input=$('documentVerifyCode'),box=$('documentVerifyResult'),btn=$('documentVerifyBtn');
 if(!input||!box)return null;
 const code=normalizeDocumentCode(input.value);
 input.value=code;
 box.classList.remove('hidden','valid','invalid');
 if(!code){
   box.classList.add('invalid');
   box.innerHTML='<b>Inserisci un codice documento.</b>';
   return null;
 }
 try{
   if(btn){btn.disabled=true;btn.textContent='Verifica...'}
   const {data,error}=await sb.rpc('verify_exam_document',{p_document_code:code});
   if(error)throw error;
   const row=Array.isArray(data)?data[0]:data;
   if(!row){
     box.classList.add('invalid');
     box.innerHTML=`<b>Documento non trovato</b><p class="status">Nessun documento registrato con il codice <strong>${k9EscapeHtml(code)}</strong>.</p>`;
     return null;
   }
   const issued=row.issued_at?new Date(row.issued_at).toLocaleString('it-IT'):'—';
   const last=row.last_generated_at?new Date(row.last_generated_at).toLocaleString('it-IT'):'—';
   const revoked=row.status==='revoked';
   box.classList.add(revoked?'invalid':'valid');
   box.innerHTML=`
     <div class="bar"><b>${revoked?'Documento registrato ma revocato':'Documento valido e registrato'}</b><span class="spacer"></span><span class="result-state ${revoked?'bad':'ok'}">${revoked?'REVOCATO':'VALIDO'}</span></div>
     <div class="document-verify-grid">
       <div class="document-verify-item"><span class="meta">Codice</span><b>${k9EscapeHtml(row.document_code)}</b></div>
       <div class="document-verify-item"><span class="meta">Tipo</span><b>${documentTypeHuman(row.document_type)}</b></div>
       <div class="document-verify-item"><span class="meta">Corsista</span><b>${k9EscapeHtml(row.student_name||'—')}</b></div>
       <div class="document-verify-item"><span class="meta">Disciplina</span><b>${labels[row.discipline]||row.discipline||'—'}</b></div>
       <div class="document-verify-item"><span class="meta">Esito</span><b>${k9EscapeHtml(row.final_status||'—')}</b></div>
       <div class="document-verify-item"><span class="meta">Prima emissione</span><b>${issued}</b></div>
       <div class="document-verify-item"><span class="meta">Ultima generazione</span><b>${last}</b></div>
       <div class="document-verify-item"><span class="meta">Generazioni</span><b>${row.generation_count??1}</b></div>
       <div class="document-verify-item"><span class="meta">Stato registro</span><b>${revoked?'REVOCATO':'VALIDO'}</b></div>
       ${row.associated_document_code?`<div class="document-verify-item"><span class="meta">Documento associato</span><b>${k9EscapeHtml(row.associated_document_code)}</b></div>`:''}
     </div>`;
   return row;
 }catch(e){
   box.classList.add('invalid');
   box.innerHTML=`<b>Verifica non riuscita</b><p class="status">${String(e.message||e)}</p>`;
   return null;
 }finally{
   if(btn){btn.disabled=false;btn.textContent='Verifica codice'}
 }
}

function certificateEligible(x){
 return x?.passed===true && x?.practical_outcome==='idoneo' && !!x?.practical_completed_at && mantrailingComponentsComplete(x);
}
function selectedDocumentExam(){
 const id=$('documentExamSelect')?.value;
 return (examArchiveData||[]).find(x=>String(x.id)===String(id))||null;
}
function refreshDocumentSelector(){
 const sel=$('documentExamSelect');
 if(!sel)return;
 const previous=sel.value;
 const rows=examArchiveData||[];
 sel.innerHTML=rows.length?rows.map(x=>`<option value="${x.id}">${k9EscapeHtml(x.student_name||x.student_email||'Corsista')} — ${k9EscapeHtml(labels[x.discipline]||x.discipline)} — ${new Date(x.assigned_at).toLocaleDateString('it-IT')}</option>`).join(''):'<option value="">Nessun esame disponibile</option>';
 if(rows.length)sel.value=rows.some(x=>String(x.id)===String(previous))?previous:String(rows[0].id);
 updateDocumentEligibility();
}
function updateDocumentEligibility(){
 const x=selectedDocumentExam(),type=$('documentTypeSelect')?.value||'report',box=$('documentEligibility'),btn=$('generateDocumentBtn');
 if(!box||!btn)return;
 const required=type==='certificate'?'generate_certificate':'generate_report';
 if(!can(required)){
   box.textContent=type==='certificate'?'Generazione attestato non abilitata per questo ruolo.':type==='candidate_report'?'Generazione report completo non abilitata per questo ruolo.':'Generazione verbale non abilitata per questo ruolo.';
   btn.disabled=true;
   btn.classList.add('permission-hidden');
   return;
 }
 btn.classList.remove('permission-hidden');
 if(!x){box.textContent='Nessun esame disponibile.';btn.disabled=true;return}
 if(type==='certificate'&&!certificateEligible(x)){
   box.textContent='Attestato non disponibile: servono teoria superata, pratica IDONEA e componenti previste completate.';
   btn.disabled=true;
 }else{
   box.textContent=type==='certificate'?'Attestato disponibile.':type==='candidate_report'?'Report completo disponibile.':'Verbale disponibile.';
   btn.disabled=false;
 }
}
async function generateExamReportPdf(x){
 if(!requirePermission('generate_report','Generazione verbale non abilitata per questo ruolo.'))return;
 if(!window.jspdf?.jsPDF)throw new Error('Modulo PDF non disponibile. Ricarica la pagina.');
 let theoryDetail=null;
 try{theoryDetail=await fetchCandidateExamReportData(x)}catch(e){console.warn('Riepilogo tentativi teoria non disponibile:',e)}
 const firstAttemptErrors=Number(theoryDetail?.initial_error_count??0);
 const retryUsed=Number(theoryDetail?.retry_used??0);
 const {jsPDF}=window.jspdf;
 const doc=new jsPDF({unit:'mm',format:'a4'});
 const code=documentCode(x,'report');
 const brand=pdfBrand(),logo=await pdfLogoData(),sig=examSignatures(x,brand);
 const W=210,H=297, ink=[28,28,31], muted=[82,82,88], hair=[205,202,212];
 const discipline=labels[x.discipline]||x.discipline||'—';
 const candidate=x.student_name||x.student_email||'Corsista';
 const candidateFiscalCode=x.student_fiscal_code||'—';
 const candidateBirthDate=x.student_birth_date?new Date(x.student_birth_date+'T00:00:00').toLocaleDateString('it-IT'):'—';
 const candidateBirthPlace=x.student_birth_place||'—';
 const evaluator=x.evaluator_name||x.evaluator_email||'Non assegnato';
 const final=finalExamStatus(x), ftype=final.code==='complete'?'ok':final.code==='failed'?'bad':'warn';
 const comps=normalizePracticalComponents(x.practical_components);

 doc.setFillColor(255,255,255);doc.rect(0,0,W,H,'F');
 await pdfAddWatermarkLogo(doc,logo,W/2,H/2,170,.028);
 doc.setDrawColor(...brand.header);doc.setLineWidth(.7);doc.rect(9,9,W-18,H-18,'S');

 // Testata più leggibile.
 doc.setFillColor(...brand.header);doc.rect(9,9,W-18,27,'F');
 doc.setFillColor(...brand.primary);doc.rect(9,36,W-18,1.5,'F');
 if(!pdfAddLogo(doc,logo,15,13,20,18))pdfText(doc,'K9',25,25,11,'bold',[255,255,255],{align:'center'});
 pdfText(doc,brand.issuer,40,18,14.5,'bold',[255,255,255]);
 if(brand.subtitle)pdfText(doc,brand.subtitle,40,24.8,7.6,'normal',[238,238,242]);
 pdfText(doc,'VERBALE DI VALUTAZIONE TEORICO-PRATICA',40,31,9.2,'bold',[248,248,250]);
 pdfText(doc,`N. ${code}`,191,18,5.8,'bold',[242,242,246],{align:'right'});
 pdfText(doc,examDateHuman(x),174,26,7.2,'normal',[242,242,246],{align:'right'});

 let y=42;
 const section=(title)=>{
   pdfText(doc,title.toUpperCase(),15,y,9.5,'bold',brand.primary);
   doc.setDrawColor(...brand.primary);doc.setLineWidth(.28);doc.line(15,y+2.1,195,y+2.1);
   y+=5.5;
 };
 const item=(label,value,x0,w,opts={})=>{
   pdfText(doc,label.toUpperCase(),x0,y,7.4,'bold',muted);
   const lines=doc.splitTextToSize(pdfSafe(value||'—'),w).slice(0,opts.lines||2);
   pdfText(doc,lines,x0,y+5.1,opts.size||9.5,opts.bold===false?'normal':'bold',ink,{lineHeightFactor:1.12});
 };

 section('Identificazione della prova');
 item('Corsista',candidate,15,79,{size:10.2}); item('Disciplina',discipline,108,79,{size:10.2}); y+=10;
 item('Codice fiscale',candidateFiscalCode,15,55,{size:8.8}); item('Data di nascita',candidateBirthDate,78,42,{size:8.8}); item('Luogo di nascita',candidateBirthPlace,128,59,{size:8.8}); y+=10;
 item('Data assegnazione',new Date(x.assigned_at).toLocaleString('it-IT'),15,79,{size:8.8});
 item('Esaminatore / valutatore',evaluator,108,79,{size:8.8}); y+=12.3;

 section('Valutazione teorica');
 item('Risultato finale',`${x.correct_answers||0}/${x.question_count||0} · ${x.score_percentage||0}%`,15,39,{size:9.3});
 item('Errori 1° tentativo',String(firstAttemptErrors),58,34,{size:9.3});
 item('Ripetizioni usate',`${retryUsed}/3`,98,31,{size:9.3});
 item('Soglia',`${x.pass_percentage||0}%`,134,22,{size:9.3});
 pdfStatusPill(doc,theoryHumanStatus(x),158,y-4.8,29,brand,x.passed===true?'ok':x.passed===false?'bad':'warn');
 y+=10.7;

 section('Valutazione pratica');
 item('Punteggio tecnico',x.practical_score==null?'Non compilato':`${x.practical_score}/50`,15,40,{size:9.5});
 item('Professionalità',x.professional_score==null?'Non compilata':`${x.professional_score}/20`,65,40,{size:9.5});
 item('Esito deciso dal valutatore',displayedPracticeOutcome(x),115,72,{size:9.5});
 y+=11.0;

 if(x.discipline==='mantrailing'){
   section('Componenti tecniche valutate');
   if(comps.length){
     comps.slice(0,2).forEach((c,i)=>{
       const nameLines=doc.splitTextToSize(pdfSafe(`${i+1}. ${c.name}`),135).slice(0,2);
       pdfText(doc,nameLines,15,y,8.7,'bold',ink,{lineHeightFactor:1.1});
       pdfText(doc,componentStatusLabel(c.status),195,y,8.1,'bold',c.status==='superata'?[22,101,52]:c.status==='non_superata'?[153,27,27]:[146,64,14],{align:'right'});
       const rowH=nameLines.length>1?8:6.1;
       doc.setDrawColor(...hair);doc.line(15,y+rowH-4.8,195,y+rowH-4.8);
       y+=rowH;
     });
   }else{pdfText(doc,'Nessuna componente registrata.',15,y,8.5,'normal',muted);y+=6.1;}
 }

 section('Indicazione orientativa del sistema');
 const advisory=examAdvisoryRecommendation(x,Number(x.practical_score||0),Number(x.professional_score||0),x.discipline,comps,x.practical_score!==null,x.professional_score!==null);
 const advisoryType=advisory.code==='ok'?'ok':advisory.code==='bad'?'bad':'warn';
 const adviceLines=doc.splitTextToSize(pdfSafe(advisory.reason),170).slice(0,3);
 const adviceH=Math.max(18,11.5+adviceLines.length*3.7);
 doc.setFillColor(...brand.pale2);doc.setDrawColor(...hair);doc.roundedRect(15,y-3.2,180,adviceH,1.8,1.8,'FD');
 pdfStatusPill(doc,advisory.label,19,y,58,brand,advisoryType);
 pdfText(doc,'SUPPORTO NON VINCOLANTE',81,y+1.4,7.2,'bold',brand.primary);
 pdfText(doc,'La decisione finale resta al valutatore.',81,y+5.1,7.3,'normal',muted);
 pdfText(doc,adviceLines,19,y+10.4,7.7,'normal',ink,{lineHeightFactor:1.15});
 y+=adviceH+3.5;

 section('Esito conclusivo registrato');
 pdfStatusPill(doc,final.label,15,y-4.7,52,brand,ftype);
 pdfText(doc,'DECISIONE DEL VALUTATORE',78,y-1.2,6.9,'bold',muted);
 pdfText(doc,displayedPracticeOutcome(x),78,y+3.8,8.8,'bold',ink);
 pdfText(doc,'DATA DI COMPLETAMENTO',136,y-1.2,6.9,'bold',muted);
 pdfText(doc,x.practical_completed_at?new Date(x.practical_completed_at).toLocaleString('it-IT'):'Non finalizzata',136,y+3.8,8.2,'bold',ink);
 y+=11.0;

 section('Osservazioni dell’esaminatore');
 const observationText=pdfSafe(x.practical_notes||'Nessuna osservazione registrata.');
 const maxObsWidth=170;
 // 1.88.2: il verbale resta su una pagina, ma le osservazioni non vengono più troncate.
 // La dimensione viene adattata al testo reale lasciando una fascia protetta per validazione e footer.
 const validationReserve=43;
 const obsBottomLimit=H-20-validationReserve;
 const obsTop=y-3;
 const obsAvailable=Math.max(24,obsBottomLimit-obsTop);
 let obsSize=8.6,obs=[],obsLineHeight=0,obsHeight=0;
 const minObsSize=6.4;
 while(obsSize>=minObsSize){
   obs=doc.splitTextToSize(observationText,maxObsWidth);
   obsLineHeight=obsSize*0.38*1.18;
   obsHeight=Math.max(24,9+(obs.length*obsLineHeight));
   if(obsHeight<=obsAvailable)break;
   obsSize-=0.2;
 }
 // Ultima protezione: se il testo è eccezionalmente lungo, usa tutta l'area disponibile senza invadere le firme.
 if(obsHeight>obsAvailable){
   obsSize=minObsSize;
   obs=doc.splitTextToSize(observationText,maxObsWidth);
   obsLineHeight=obsSize*0.38*1.12;
   obsHeight=Math.min(obsAvailable,Math.max(24,9+(obs.length*obsLineHeight)));
 }
 doc.setFillColor(255,255,255);doc.setDrawColor(...hair);doc.roundedRect(15,obsTop,180,obsHeight,1.5,1.5,'FD');
 pdfText(doc,obs,19,y+3.8,obsSize,'normal',ink,{lineHeightFactor:1.18,maxWidth:maxObsWidth});
 y=obsTop+obsHeight+4.0;

 // Verbale vincolato a una sola pagina A4: la sezione di validazione resta sempre sulla prima pagina.
 section('Validazione');
 const colX=[15,77,139],colW=56;
 const labelsSig=[
  ['DOCENTE / FORMATORE',sig.teacher,'Firma del docente / formatore'],
  ['VALUTATORE / ESAMINATORE',sig.evaluator,'Firma del valutatore / esaminatore'],
  ['RESPONSABILE',sig.responsible,'Firma del responsabile']
 ];
 labelsSig.forEach((r,i)=>{
   const x0=colX[i];
   pdfText(doc,r[0],x0,y,7.3,'bold',brand.primary);
   if(r[1])pdfText(doc,doc.splitTextToSize(pdfSafe(r[1]),colW).slice(0,1),x0,y+5.4,7.8,'normal',ink);
   doc.setDrawColor(105,105,110);doc.line(x0,y+14,x0+colW,y+14);
   pdfText(doc,r[2],x0,y+18.5,7.0,'normal',muted);
 });
 y+=22.5;
 const placeDate=[brand.place,examDateHuman(x)].filter(Boolean).join(', ')||examDateHuman(x);
 pdfText(doc,`Luogo e data: ${placeDate}`,15,y,7.3,'normal',muted);
 pdfText(doc,'Documento generato dalla piattaforma di gestione esami.',195,y,6.7,'normal',muted,{align:'right'});

 // Footer sull'ultima pagina.
 doc.setDrawColor(...brand.primary);doc.line(15,H-20,195,H-20);
 pdfText(doc,brand.issuer,15,H-14,7.2,'bold',brand.dark);
 if(brand.footer)pdfText(doc,doc.splitTextToSize(pdfSafe(brand.footer),80).slice(0,1),W/2,H-14,6.4,'normal',muted,{align:'center'});
 pdfText(doc,code,195,H-14,7,'normal',muted,{align:'right'});
 await registerAndDownloadExamPdf(doc,x,'report',code);
}

async function fetchCandidateExamReportData(x){
 const assignmentId=x?.id||x?.assignment_id;
 if(!isUuid(assignmentId))throw new Error('Esame non valido.');
 const {data,error}=await sb.rpc('get_exam_candidate_report',{p_assignment_id:assignmentId});
 if(error)throw new Error('Impossibile recuperare il dettaglio dell’esame: '+error.message);
 if(!data)throw new Error('Nessun dettaglio disponibile per questo esame.');
 return data;
}

// RELEASE 1.83 — report professionale rifinito + composizione casuale/diversificata delle prove
async function generateCandidateExamReportPdf(x){
 if(!requirePermission('generate_report','Generazione report completo non abilitata per questo ruolo.'))return;
 if(!window.jspdf?.jsPDF)throw new Error('Modulo PDF non disponibile. Ricarica la pagina.');
 const detail=await fetchCandidateExamReportData(x);
 const {jsPDF}=window.jspdf;
 const doc=new jsPDF({unit:'mm',format:'a4'});
 const code=documentCode(x,'candidate_report');
 const brand=pdfBrand(),logo=await pdfLogoData();
 const W=210,H=297, ink=[28,28,31],muted=[92,92,98],hair=[215,213,219];
 const candidate=detail.student_name||x.student_name||x.student_email||'Corsista';
 const discipline=labels[detail.discipline||x.discipline]||detail.discipline||x.discipline||'—';
 const evaluator=detail.evaluator_name||x.evaluator_name||x.evaluator_email||'Non assegnato';
 const assignedBy=detail.assigned_by_name||x.assigned_by_name||'—';
 const questions=Array.isArray(detail.questions)?detail.questions:[];
 const practiceRows=Array.isArray(detail.practical_criteria)?detail.practical_criteria:[];
 const professionalRows=Array.isArray(detail.professional_criteria)?detail.professional_criteria:[];
 const components=normalizePracticalComponents(detail.practical_components||x.practical_components);
 let pageNo=0,y=0;

 const addPage=async(title='REPORT COMPLETO CORSISTA / ESAME')=>{
   if(pageNo)doc.addPage();
   pageNo++;
   doc.setFillColor(255,255,255);doc.rect(0,0,W,H,'F');
   await pdfAddWatermarkLogo(doc,logo,W/2,H/2,165,.025);
   doc.setDrawColor(...brand.header);doc.setLineWidth(.55);doc.rect(9,9,W-18,H-18,'S');
   doc.setFillColor(...brand.header);doc.rect(9,9,W-18,25,'F');
   if(!pdfAddLogo(doc,logo,15,12,18,17))pdfText(doc,'K9',24,23,10,'bold',[255,255,255],{align:'center'});
   pdfText(doc,brand.issuer,38,17,12.5,'bold',[255,255,255]);
   pdfText(doc,title,38,26,8.2,'bold',[245,245,248]);
   pdfText(doc,`N. ${code}`,191,17,5.8,'bold',[245,245,248],{align:'right'});
   pdfText(doc,`Pagina ${pageNo}`,174,25,6.2,'normal',[245,245,248],{align:'right'});
   y=41;
 };
 const ensure=async(h=18)=>{if(y+h>273)await addPage()};
 const heading=async title=>{
   await ensure(13);
   pdfText(doc,String(title).toUpperCase(),15,y,8.3,'bold',brand.primary);
   doc.setDrawColor(...brand.primary);doc.setLineWidth(.25);doc.line(15,y+2,195,y+2);
   y+=7;
 };
 const line=async(label,value)=>{
   // 1.88.2: due colonne reali. Anche etichette lunghe non possono più invadere il valore.
   const labelLines=doc.splitTextToSize(pdfSafe(String(label).toUpperCase()),42);
   const valueLines=doc.splitTextToSize(pdfSafe(value??'—'),130);
   const labelH=labelLines.length*3.5;
   const valueH=valueLines.length*4.0;
   const h=Math.max(7,labelH,valueH)+3;
   await ensure(h);
   pdfText(doc,labelLines,15,y,6.2,'bold',muted,{lineHeightFactor:1.08});
   pdfText(doc,valueLines,63,y,7.5,'normal',ink,{lineHeightFactor:1.12});
   y+=h;
 };
 const separator=()=>{
   doc.setDrawColor(...hair);doc.setLineWidth(.16);doc.line(15,y,195,y);y+=3;
 };
 const criterionRow=async(label,value,isLast=false)=>{
   const labelLines=doc.splitTextToSize(pdfSafe(label??'Criterio'),138);
   const h=Math.max(8,labelLines.length*3.8+4);
   await ensure(h+(isLast?0:3));
   pdfText(doc,labelLines,15,y,6.6,'bold',muted);
   pdfText(doc,pdfSafe(value??'—'),195,y,7.3,'bold',ink,{align:'right'});
   y+=h;
   if(!isLast)separator();
 };
 const criterionRows=async(rows,title)=>{
   await heading(title);
   if(!rows.length){await line('Valutazione','Non compilata');return}
   for(let i=0;i<rows.length;i++){
     const r=rows[i]||{};
     await criterionRow(`${i+1}. ${r.label||'Criterio'}`,r.score==null?'—':`${r.score}/5`,i===rows.length-1);
   }
 };
 const reportSubheading=async title=>{
   await ensure(10);
   pdfText(doc,String(title).toUpperCase(),15,y,6.8,'bold',brand.primary);
   y+=5;
 };
 const reportParagraph=async text=>{
   // 1.83: paragrafi lunghi distribuiti su più pagine, senza troncamenti o sovrapposizioni.
   const lines=doc.splitTextToSize(pdfSafe(text),180);
   let offset=0;
   while(offset<lines.length){
     if(y>266)await addPage();
     const lineStep=4.15;
     const capacity=Math.max(1,Math.floor((269-y)/lineStep));
     const chunk=lines.slice(offset,offset+capacity);
     pdfText(doc,chunk,15,y,7.2,'normal',ink,{lineHeightFactor:1.16});
     y+=chunk.length*lineStep+3;
     offset+=chunk.length;
     if(offset<lines.length)await addPage();
   }
 };
 const scorePct=(v,max)=>Number.isFinite(Number(v))&&max?Math.round(Number(v)*100/max):null;
 const buildProfessionalAssessment=()=>{
   const pPct=scorePct(detail.practical_score,50);
   const profPct=scorePct(detail.professional_score,20);
   const initialErrors=Number(detail.initial_error_count||0);
   const retries=Number(detail.retry_used||0);
   const validPractice=practiceRows.filter(r=>Number.isFinite(Number(r?.score)));
   const validProfessional=professionalRows.filter(r=>Number.isFinite(Number(r?.score)));
   const strengths=validPractice.filter(r=>Number(r.score)>=5).map(r=>r.label).filter(Boolean);
   const consolidate=validPractice.filter(r=>Number(r.score)<=3).sort((a,b)=>Number(a.score)-Number(b.score)).map(r=>r.label).filter(Boolean);
   const refine=validPractice.filter(r=>Number(r.score)===4).map(r=>r.label).filter(Boolean);
   const profStrengths=validProfessional.filter(r=>Number(r.score)>=4).map(r=>r.label).filter(Boolean);
   const profConsolidate=validProfessional.filter(r=>Number(r.score)<=3).sort((a,b)=>Number(a.score)-Number(b.score)).map(r=>r.label).filter(Boolean);
   const passedComponents=components.filter(c=>String(c.status||'').toLowerCase()==='passed'||String(c.status||'').toLowerCase()==='superata').map(c=>c.name).filter(Boolean);
   const otherComponents=components.filter(c=>!passedComponents.includes(c.name)).map(c=>`${c.name}: ${componentStatusLabel(c.status)}`).filter(Boolean);
   const joinList=a=>a.length<=1?(a[0]||''):`${a.slice(0,-1).join(', ')} e ${a[a.length-1]}`;
   let overall='La valutazione complessiva è stata costruita sui risultati effettivamente registrati nella prova teorica e pratica.';
   if(pPct!=null){
     if(pPct>=90)overall=`La prova pratica evidenzia una preparazione tecnica di livello elevato (${detail.practical_score}/50, ${pPct}%), con prestazione complessivamente solida e ben strutturata.`;
     else if(pPct>=80)overall=`La prova pratica evidenzia una preparazione tecnica buona (${detail.practical_score}/50, ${pPct}%), con competenze complessivamente affidabili e alcuni aspetti ancora perfezionabili.`;
     else if(pPct>=60)overall=`La prova pratica evidenzia una prestazione parzialmente adeguata ma non ancora consolidata (${detail.practical_score}/50, ${pPct}%). Il risultato richiede continuità di lavoro prima di considerare stabilmente acquisiti tutti gli standard valutati.`;
     else overall=`La prova pratica risulta sotto il livello di sufficienza previsto (${detail.practical_score}/50, ${pPct}%) e richiede un consolidamento mirato prima di considerare stabilmente acquisiti gli standard valutati.`;
   }
   if(strengths.length)overall+=` I risultati migliori riguardano ${joinList(strengths.slice(0,4))}.`;
   if(passedComponents.length)overall+=` Le componenti tecniche ${joinList(passedComponents)} risultano superate.`;
   if(otherComponents.length)overall+=` Restano da considerare le seguenti componenti: ${joinList(otherComponents)}.`;

   let improve='Non emergono, dai punteggi registrati, aree tecniche specifiche sotto il massimo previsto.';
   if(consolidate.length)improve=`Le priorità di consolidamento riguardano ${joinList(consolidate.slice(0,5))}. Su queste aree è opportuno ricercare maggiore precisione, continuità esecutiva e capacità di mantenere lo standard anche al variare delle condizioni operative.${refine.length?` Gli altri criteri valutati 4/5 risultano positivi e richiedono soprattutto affinamento, non un recupero di base.`:''}`;

   let theory=`La prova teorica si conclude con ${detail.correct_answers||0}/${detail.question_count||0} risposte corrette (${detail.score_percentage||0}%), rispetto a una soglia prevista del ${detail.pass_percentage||0}%.`;
   if(initialErrors>0)theory+=` Sono stati registrati ${initialErrors} ${initialErrors===1?'errore':'errori'} al primo tentativo`;
   else theory+=' Non risultano errori al primo tentativo';
   if(retries>0)theory+=`, con ${retries} ${retries===1?'ripetizione utilizzata':'ripetizioni utilizzate'} sulle 3 disponibili.`;
   else theory+=' e non sono state utilizzate ripetizioni.';
   if(profPct!=null){
     theory+=` La professionalità è valutata ${detail.professional_score}/20 (${profPct}%).`;
     if(profStrengths.length)theory+=` Il dato più favorevole riguarda ${joinList(profStrengths.slice(0,3))}.`;
     if(profConsolidate.length)theory+=` Richiedono invece consolidamento ${joinList(profConsolidate.slice(0,3))}.`; else if(profStrengths.length)theory+=' Il profilo professionale risulta complessivamente adeguato nei criteri osservati.';
   }

   let advice='Si consiglia di mantenere l’allenamento sugli standard già acquisiti e di verificare periodicamente la stabilità della prestazione in condizioni differenti.';
   const adviceParts=[];
   if(consolidate.length)adviceParts.push(`dedicare esercitazioni mirate a ${joinList(consolidate.slice(0,3))}`);
   if(initialErrors>0)adviceParts.push('riprendere gli argomenti teorici relativi alle risposte inizialmente errate, verificandone la comprensione e non la sola memorizzazione');
   if(profConsolidate.length)adviceParts.push(`consolidare sul piano professionale ${joinList(profConsolidate.slice(0,2))}`);
   if(adviceParts.length)advice=`Si consiglia di ${adviceParts.join('; ')}. L’obiettivo formativo è rendere la prestazione più stabile, consapevole e uniforme nelle diverse condizioni operative.`;
   return {overall,improve,theory,advice};
 };
 await addPage();
 await heading('Identificazione');
 await line('Corsista',candidate);
 await line('Disciplina',discipline);
 await line('Assegnato da',assignedBy);
 await line('Esaminatore',evaluator);
 await line('Data assegnazione',detail.assigned_at?new Date(detail.assigned_at).toLocaleString('it-IT'):'—');
 await line('Inizio teoria',detail.started_at?new Date(detail.started_at).toLocaleString('it-IT'):'—');
 await line('Consegna teoria',detail.submitted_at?new Date(detail.submitted_at).toLocaleString('it-IT'):'—');
 if(detail.assignment_notes)await line('Note assegnazione',detail.assignment_notes);

 await heading('Esito teorico');
 await line('Risultato',`${detail.correct_answers||0}/${detail.question_count||0} corrette · ${detail.score_percentage||0}%`);
 await line('Soglia',`${detail.pass_percentage||0}%`);
 await line('Esito',detail.passed===true?'SUPERATA':detail.passed===false?'NON SUPERATA':'NON CONCLUSA');
 await line('Risposte date',`${detail.answered_questions||0}/${detail.question_count||0}`);
 await line('Errori al primo tentativo',String(detail.initial_error_count??0));
 await line('Ripetizioni automatiche utilizzate',`${detail.retry_used??0}/3`);

 await criterionRows(practiceRows,'Valutazione pratica');
 await line('Punteggio pratica',detail.practical_score==null?'Non compilato':`${detail.practical_score}/50`);
 await criterionRows(professionalRows,'Valutazione professionalità');
 await line('Punteggio professionalità',detail.professional_score==null?'Non compilato':`${detail.professional_score}/20`);
 await line('Esito pratica',displayedPracticeOutcome({...x,practical_outcome:detail.practical_outcome}));
 if(components.length){
   await heading('Componenti tecniche');
   for(let i=0;i<components.length;i++)await line(`${i+1}. ${components[i].name}`,componentStatusLabel(components[i].status));
 }
 await heading('Osservazioni e valutazione del modulo Corsista');
 const assessment=buildProfessionalAssessment();
 await reportSubheading('Valutazione complessiva');
 await reportParagraph(assessment.overall);
 separator();
 await reportSubheading('Aspetti da consolidare');
 await reportParagraph(assessment.improve);
 separator();
 await reportSubheading('Valutazione teorica e professionale');
 await reportParagraph(assessment.theory);
 separator();
 await reportSubheading('Indicazioni formative');
 await reportParagraph(assessment.advice);
 if(String(detail.practical_notes||'').trim()){
   separator();
   await reportSubheading('Note registrate dal valutatore');
   await reportParagraph(detail.practical_notes);
 }
 await heading('Esito complessivo');
 await line('Stato finale',finalExamStatus({...x,passed:detail.passed,practical_outcome:detail.practical_outcome,practical_components:detail.practical_components}).label);

 await addPage('DETTAGLIO DOMANDE E RISPOSTE');
 if(!questions.length){
   await line('Dettaglio teoria','Nessuna domanda registrata per questo esame.');
 }else{
   for(const q of questions){
     const number=Number(q.position)||0;
     const options=Array.isArray(q.options)?q.options:[];
     const selected=q.selected_option;
     const correct=q.correct_option;
     const correction=q.correction||null;
     const firstSelected=correction?.original_option??selected;
     const selectedText=selected==null?'NON RISPOSTA':(options[selected]??'—');
     const firstSelectedText=firstSelected==null?'NON RISPOSTA':(options[firstSelected]??'—');
     const correctText=correct==null?'—':(options[correct]??'—');
     const state=selected==null?'NON RISPOSTA':q.is_correct===true?'CORRETTA':'ERRATA';
     const questionLines=doc.splitTextToSize(`${number}. ${pdfSafe(q.question_text||'')}`,174);
     const firstLines=doc.splitTextToSize(`Prima risposta: ${pdfSafe(firstSelectedText)}${correction?' — ERRATA, ripetizione utilizzata':''}`,170);
     const selectedLines=correction?doc.splitTextToSize(`Risposta dopo ripetizione: ${pdfSafe(selectedText)} — ${q.is_correct===true?'CORRETTA':'ERRATA'}`,170):[];
     const correctLines=doc.splitTextToSize(`Risposta corretta: ${pdfSafe(correctText)}`,170);
     const explLines=doc.splitTextToSize(`Spiegazione: ${pdfSafe(q.explanation||'Nessuna spiegazione registrata.')}`,170);
     const need=9+questionLines.length*4+firstLines.length*3.8+selectedLines.length*3.8+correctLines.length*3.8+explLines.length*3.8+10;
     await ensure(Math.min(need,80));
     pdfText(doc,`${q.code||'DOMANDA'} · ${q.category||'Senza categoria'}`,15,y,6.2,'bold',brand.primary);
     pdfText(doc,state,195,y,6.6,'bold',q.is_correct===true?[22,101,52]:[153,27,27],{align:'right'});
     y+=5;
     pdfText(doc,questionLines,15,y,7.8,'bold',ink);y+=questionLines.length*4+2;
     pdfText(doc,firstLines,19,y,7.1,'normal',correction?[153,27,27]:(q.is_correct===true?[22,101,52]:[153,27,27]));y+=firstLines.length*3.8+1;
     if(selectedLines.length){pdfText(doc,selectedLines,19,y,7.1,'bold',q.is_correct===true?[22,101,52]:[153,27,27]);y+=selectedLines.length*3.8+1;}
     pdfText(doc,correctLines,19,y,7.1,'bold',[22,101,52]);y+=correctLines.length*3.8+1;
     pdfText(doc,explLines,19,y,6.8,'normal',muted);y+=explLines.length*3.8+3;
     doc.setDrawColor(...hair);doc.line(15,y,195,y);y+=5;
   }
 }

 const totalPages=doc.getNumberOfPages();
 for(let p=1;p<=totalPages;p++){
   doc.setPage(p);
   doc.setDrawColor(...brand.pale);doc.line(15,H-17,195,H-17);
   pdfText(doc,brand.issuer,15,H-10,6.5,'bold',[100,96,108]);
   pdfText(doc,`${candidate} · ${discipline}`,W/2,H-10,6.2,'normal',[100,96,108],{align:'center'});
   pdfText(doc,`${code} · ${p}/${totalPages}`,195,H-10,6.2,'normal',[100,96,108],{align:'right'});
 }
 await registerAndDownloadExamPdf(doc,x,'candidate_report',code);
}

async function generateCertificatePdf(x){
 if(!requirePermission('generate_certificate','Generazione attestato non abilitata per questo ruolo.'))return;
 if(!certificateEligible(x))throw new Error('Attestato non disponibile per questo esame.');
 if(!window.jspdf?.jsPDF)throw new Error('Modulo PDF non disponibile. Ricarica la pagina.');
 const {jsPDF}=window.jspdf;
 const doc=new jsPDF({unit:'mm',format:'a4',orientation:'landscape'});
 const code=documentCode(x,'certificate');
 const brand=pdfBrand(),logo=await pdfLogoData(),sig=examSignatures(x,brand);
 const W=297,H=210, ink=[27,27,30], muted=[92,92,98], accent=brand.primary;
 const discipline=labels[x.discipline]||x.discipline||'—';
 const candidate=x.student_name||x.student_email||'Corsista';
 const comps=normalizePracticalComponents(x.practical_components);

 // Attestato da esposizione: composizione cerimoniale, ampio respiro, nessuna grafica "dashboard".
 doc.setFillColor(253,252,250);doc.rect(0,0,W,H,'F');
 // Filigrana centrale più marcata ma non invasiva, derivata dal logo ufficiale corrente.
 await pdfAddWatermarkLogo(doc,logo,W/2,H/2,210,.14);

 // Cornice a tre livelli molto sobria.
 doc.setDrawColor(...brand.header);doc.setLineWidth(1.1);doc.roundedRect(8,8,W-16,H-16,2.8,2.8,'S');
 doc.setDrawColor(...brand.primary);doc.setLineWidth(.35);doc.roundedRect(12,12,W-24,H-24,1.8,1.8,'S');
 doc.setDrawColor(...mixRgb(brand.primary,[255,255,255],.55));doc.setLineWidth(.18);doc.roundedRect(15,15,W-30,H-30,1.4,1.4,'S');

 // Testata alta e pulita.
 if(!pdfAddLogo(doc,logo,20,19,24,22)){
   pdfText(doc,'K9',32,33,12,'bold',brand.dark,{align:'center'});
 }
 pdfText(doc,brand.issuer,51,25,17,'bold',brand.dark);
 if(brand.subtitle)pdfText(doc,brand.subtitle,51,33,8,'normal',muted);
 pdfText(doc,`N. ${code}`,W-20,25,6.2,'bold',muted,{align:'right'});
 pdfText(doc,examDateHuman(x),W-43,33,7.5,'normal',muted,{align:'right'});
 doc.setDrawColor(...brand.primary);doc.setLineWidth(.32);doc.line(20,40,W-20,40);

 // Titolo.
 pdfText(doc,'ATTESTATO DI IDONEITÀ',W/2,58,29,'bold',brand.dark,{align:'center'});
 pdfText(doc,'rilasciato a',W/2,70,11.5,'normal',muted,{align:'center'});
 pdfText(doc,candidate,W/2,89,32,'bold',accent,{align:'center'});

 // Formula istituzionale.
 const statement1='per aver completato con esito positivo il percorso di valutazione teorica e pratica';
 const statement2='e aver dimostrato il possesso delle competenze previste per la disciplina';
 pdfText(doc,statement1,W/2,103,12,'normal',ink,{align:'center'});
 pdfText(doc,statement2,W/2,112,12,'normal',ink,{align:'center'});
 pdfText(doc,discipline,W/2,128,25,'bold',brand.dark,{align:'center'});

 // Sigillo di esito sobrio.
 pdfStatusPill(doc,'IDONEO',W/2-23,136,46,brand,'ok');

 // Dati valutativi compatti: nessuna sovrapposizione con componenti e firme.
 doc.setDrawColor(220,218,223);doc.line(40,147,W-40,147);
 const detail=`Valutazione teorica: ${x.score_percentage||0}% (${x.correct_answers||0}/${x.question_count||0})    |    Prova pratica: ${x.practical_score||0}/50    |    Professionalità: ${x.professional_score||0}/20`;
 pdfText(doc,detail,W/2,153,8.8,'bold',muted,{align:'center'});
 let fy=169;
 if(x.discipline==='mantrailing'&&comps.length){
   const names=comps.slice(0,2).map(c=>c.name).join('  ·  ');
   const compLines=doc.splitTextToSize(pdfSafe(names),210).slice(0,2);
   pdfText(doc,'COMPONENTI TECNICHE VALUTATE',W/2,158.5,7.1,'bold',accent,{align:'center'});
   pdfText(doc,compLines,W/2,163.5,7.8,'bold',ink,{align:'center',lineHeightFactor:1.05});
   fy=174;
 }

 // 1.88.6: area firme compatta, separata dalle componenti e dal footer.

 const blocks=[
  {cx:55,label:'DOCENTE / FORMATORE',name:sig.teacher,role:'Firma'},
  {cx:148.5,label:'VALUTATORE / ESAMINATORE',name:sig.evaluator,role:'Firma'},
  {cx:242,label:'RESPONSABILE',name:sig.responsible,role:sig.responsibleRole||'Firma'}
 ];
 blocks.forEach(b=>{
   pdfText(doc,b.label,b.cx,fy,7.1,'bold',accent,{align:'center'});
   if(b.name)pdfText(doc,doc.splitTextToSize(pdfSafe(b.name),60).slice(0,1),b.cx,fy+4.6,7.8,'normal',ink,{align:'center'});
   doc.setDrawColor(100,100,105);doc.line(b.cx-31,fy+9.5,b.cx+31,fy+9.5);
   pdfText(doc,b.role,b.cx,fy+13.2,6.4,'normal',muted,{align:'center'});
 });

 // Footer staccato dalle firme e senza sovrapposizioni.
 const placeDate=[brand.place,examDateHuman(x)].filter(Boolean).join(', ')||examDateHuman(x);
 pdfText(doc,placeDate,20,H-12.5,6.5,'normal',muted);
 pdfText(doc,`Codice attestato ${code}`,W/2,H-12.5,6.5,'normal',muted,{align:'center'});
 pdfText(doc,brand.issuer,W-20,H-12.5,6.5,'bold',brand.dark,{align:'right'});
 await registerAndDownloadExamPdf(doc,x,'certificate',code);
}
async function generateSelectedDocument(){
 if(can('document_archive'))await loadDocumentArchive(true,true);
 const x=selectedDocumentExam();if(!x)return note('Seleziona un esame.',true);
 const btn=$('generateDocumentBtn');
 try{
   if(btn){btn.disabled=true;btn.textContent='Generazione PDF...'}
   const type=$('documentTypeSelect').value;
   if(type==='certificate')await generateCertificatePdf(x);
   else if(type==='candidate_report')await generateCandidateExamReportPdf(x);
   else await generateExamReportPdf(x);
 }catch(e){
   note(e.message||'Errore durante la generazione PDF.',true);
 }finally{
   if(btn){btn.disabled=false;btn.textContent='Genera PDF'}
   updateDocumentEligibility();
   await loadDocumentArchive(true,true);
 }
}

function pct(part,total){return total?Math.round((part/total)*100):0}
function avg(values){
 const nums=(values||[]).map(Number).filter(Number.isFinite);
 return nums.length?Math.round((nums.reduce((a,b)=>a+b,0)/nums.length)*10)/10:0;
}
