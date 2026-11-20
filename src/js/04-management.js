async function loadDidacticStats(){
 if(!can('analytics'))return;
 let box=$('k9DidacticStats');if(!box){box=document.createElement('div');box.id='k9DidacticStats';box.className='card';$('analyticsCard').appendChild(box);}
 box.textContent='Caricamento indicatori didattici…';
 const{data,error}=await sb.rpc('k9_didactic_stats');if(error){box.textContent=error.message;return;}
 const d=data||{}, table=(title,headers,rows)=>`<h3>${title}</h3><div style="overflow:auto"><table><thead><tr>${headers.map(x=>`<th>${qbEscape(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${qbEscape(x??'—')}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="6">Nessun dato</td></tr>'}</tbody></table></div>`;
 box.innerHTML=`<h2>Analisi didattica</h2><p>Prove concluse; errori iniziali e finali distinti. Tempo medio dalla partenza alla prima risposta: ${d.mean_seconds_from_start==null?'—':Number(d.mean_seconds_from_start)+' s'} (non durata per singola domanda).</p><button class="btn ghost" onclick="loadDidacticStats()">Aggiorna</button><button class="btn ghost" id="k9ExportStats">Esporta indicatori JSON</button>`+table('Domande (prime 100 per errori iniziali)',['Disciplina','Codice','Utilizzi','Errori iniziali','Errori finali','Correzioni'],(d.questions||[]).map(x=>[labels[x.discipline],x.code,x.uses,x.initial_errors,x.final_errors,x.retries]))+table('Argomenti',['Disciplina','Categoria','Utilizzi','Errori iniziali','Errori finali','Correzioni'],(d.categories||[]).map(x=>[labels[x.discipline],x.category,x.uses,x.initial_errors,x.final_errors,x.retries]))+table('Alternative errate (ordine originale della banca)',['Disciplina','Codice','Alternativa','Selezioni'],(d.wrong_choices||[]).map(x=>[labels[x.discipline],x.code,String.fromCharCode(65+Number(x.original_choice)),x.uses]));
 $('k9ExportStats').onclick=()=>qbDownloadText(JSON.stringify(d,null,2),'k9-statistiche.json','application/json');
}
function renderAnalyticsBar(container,label,value,total){
 const c=$(container);if(!c)return;
 const width=pct(value,total);
 c.insertAdjacentHTML('beforeend',`<div class="analytics-row">
  <span class="analytics-label">${label}</span>
  <div class="analytics-track"><div class="analytics-fill" style="width:${width}%"></div></div>
  <span class="analytics-number">${value}</span>
 </div>`);
}
function renderAnalytics(){
 if(!$('analyticsCard'))return;
 const rows=examArchiveData||[];
 const total=rows.length;
 const open=rows.filter(x=>['assigned','in_progress'].includes(x.status)).length;
 const theoryDone=rows.filter(x=>['submitted','expired'].includes(x.status));
 const passed=theoryDone.filter(x=>x.passed===true).length;
 const failed=theoryDone.filter(x=>x.passed===false).length;
 const complete=rows.filter(x=>['idoneo','non_idoneo'].includes(x.practical_outcome)).length;
 const practiceIdonee=rows.filter(x=>x.practical_outcome==='idoneo').length;
 const practiceNonIdonee=rows.filter(x=>x.practical_outcome==='non_idoneo').length;
 const practiceReview=rows.filter(x=>x.practical_outcome==='da_rivedere').length;
 const practicePending=theoryDone.filter(x=>x.passed===true&&!x.practical_outcome).length;

 $('analyticsTotal').textContent=total;
 $('analyticsOpen').textContent=open;
 $('analyticsPassed').textContent=passed;
 $('analyticsComplete').textContent=complete;

 const disciplineCounts={dogsitter:0,mantrailing:0,hrdd:0,detection:0};
 rows.forEach(x=>{if(disciplineCounts[x.discipline]!==undefined)disciplineCounts[x.discipline]++});
 $('disciplineStats').innerHTML='';
 Object.entries(disciplineCounts).forEach(([d,n])=>renderAnalyticsBar('disciplineStats',labels[d]||d,n,total));

 $('theoryStats').innerHTML='';
 renderAnalyticsBar('theoryStats','Superata',passed,theoryDone.length);
 renderAnalyticsBar('theoryStats','Non superata',failed,theoryDone.length);
 renderAnalyticsBar('theoryStats','Da concludere',total-theoryDone.length,total);

 $('practiceStats').innerHTML='';
 renderAnalyticsBar('practiceStats','IDONEO',practiceIdonee,total);
 renderAnalyticsBar('practiceStats','NON IDONEO',practiceNonIdonee,total);
 renderAnalyticsBar('practiceStats','DA RIVEDERE',practiceReview,total);
 renderAnalyticsBar('practiceStats','Da completare',practicePending,total);

 const theoryAvg=avg(theoryDone.map(x=>x.score_percentage));
 const practiceRows=rows.filter(x=>x.practical_score!==null);
 const practiceAvg=avg(practiceRows.map(x=>Number(x.practical_score)/50*100));
 const professionalRows=rows.filter(x=>x.professional_score!==null);
 const professionalAvg=avg(professionalRows.map(x=>Number(x.professional_score)/20*100));
 const passRate=pct(passed,theoryDone.length);

 $('averageStats').innerHTML=`
  <div class="analytics-value"><span>Media teoria</span><b>${theoryAvg}%</b></div>
  <div class="analytics-value"><span>Tasso superamento</span><b>${passRate}%</b></div>
  <div class="analytics-value"><span>Media pratica</span><b>${practiceAvg}%</b></div>
  <div class="analytics-value"><span>Media professionalità</span><b>${professionalAvg}%</b></div>
 `;

 analyticsLastUpdated=new Date();
 $('analyticsUpdated').textContent='Aggiornato '+analyticsLastUpdated.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
 enableClickableSelectableUI();
}
function archiveOutcome(x){
 const theoryDone=['submitted','expired'].includes(x.status);
 if(!theoryDone)return '';
 if(x.passed===false)return 'failed';
 if(x.practical_outcome==='idoneo')return 'complete';
 if(x.practical_outcome==='non_idoneo')return 'failed';
 return 'practice_pending';
}
function archiveMatches(x){
 const q=($('archiveSearch')?.value||'').trim().toLowerCase();
 const d=$('archiveDiscipline')?.value||'',s=$('archiveStatus')?.value||'',o=$('archiveOutcome')?.value||'';
 if(d&&x.discipline!==d)return false;if(s&&x.status!==s)return false;if(o&&archiveOutcome(x)!==o)return false;
 if(q){const hay=[x.student_name,x.student_email,x.discipline,labels[x.discipline],x.evaluator_name,x.evaluator_email].filter(Boolean).join(' ').toLowerCase();if(!hay.includes(q))return false}
 return true;
}
function renderArchive(){
 const rows=(examArchiveData||[]).filter(archiveMatches);
 if($('archiveCount'))$('archiveCount').textContent=rows.length+' '+(rows.length===1?'esame':'esami');
 if(!$('archiveRows'))return;
 $('archiveRows').innerHTML=rows.length?rows.map(x=>{
  const theory=['submitted','expired'].includes(x.status)?`${x.score_percentage||0}%`:'—';
  const practice=x.practical_score!==null?`${x.practical_score}/50 · ${x.professional_score||0}/20`:'—';
  const payload=k9EncodeInline(JSON.stringify(x));
  return `<tr onclick="openFinalResult('${payload}')"><td data-label="Corsista">${k9EscapeHtml(x.student_name||x.student_email||'—')}</td><td data-label="Disciplina">${k9EscapeHtml(labels[x.discipline]||x.discipline)}</td><td data-label="Stato"><span class="archive-pill ${x.status}">${x.status}</span></td><td data-label="Teoria" class="archive-score">${theory}</td><td data-label="Pratica">${practice}</td><td data-label="Data">${new Date(x.assigned_at).toLocaleString('it-IT')}</td><td data-label="Dettaglio"><button type="button" class="btn ghost" onclick="event.stopPropagation();openFinalResult('${payload}')">Apri</button></td></tr>`;
 }).join(''):'<tr><td colspan="7"><div class="empty-state">Nessun esame corrisponde ai filtri.</div></td></tr>';
}
function setupArchiveFilters(){
 ['archiveDiscipline','archiveStatus','archiveOutcome'].forEach(id=>{
   const el=$(id);
   if(!el||el.dataset.archiveReady==='1')return;
   el.dataset.archiveReady='1';
   el.addEventListener('change',renderArchive);
 });

 const search=$('archiveSearch');
 const searchBtn=$('archiveSearchBtn');
 if(search&&search.dataset.archiveReady!=='1'){
   search.dataset.archiveReady='1';
   search.addEventListener('keydown',e=>{
     if(e.key==='Enter'){
       e.preventDefault();
       renderArchive();
       search.blur();
     }
   });
   // Mantiene anche il filtro immediato mentre si scrive.
   search.addEventListener('input',renderArchive);
 }
 if(searchBtn&&searchBtn.dataset.archiveReady!=='1'){
   searchBtn.dataset.archiveReady='1';
   searchBtn.onclick=()=>{
     renderArchive();
     search?.blur();
     const count=$('archiveCount')?.textContent||'';
     showGlobalMessage(count||'Ricerca completata.',false,'Storico esami');
   };
 }
 const reset=$('archiveResetFilters');
 if(reset&&reset.dataset.archiveReady!=='1'){
   reset.dataset.archiveReady='1';
   reset.onclick=()=>{
     if(search)search.value='';
     $('archiveDiscipline').value='';
     $('archiveStatus').value='';
     $('archiveOutcome').value='';
     renderArchive();
     showGlobalMessage('Filtri azzerati.',false,'Storico esami');
   };
 }
}


function setupAnalyticsControls(){
 const b=$('refreshAnalyticsBtn');
 if(b&&b.dataset.analyticsReady!=='1'){
   b.dataset.analyticsReady='1';
   b.onclick=async()=>{await refreshAll(true);renderAnalytics()};
 }
}

function documentArchiveMatches(row){
 const rawQ=String($('documentArchiveSearch')?.value||'').trim();
 const q=rawQ.toLowerCase();
 const normalizedQ=normalizeDocumentCode(rawQ).toLowerCase();
 const d=$('documentArchiveDiscipline')?.value||'';
 const t=$('documentArchiveType')?.value||'';
 const s=$('documentArchiveStatus')?.value||'';
 const typeWords=row.document_type==='certificate'
   ?'attestato attestati certificato certificati certificate idoneità idoneita'
   :row.document_type==='candidate_report'
     ?'report completo report completi corsista esame analitico'
     :'verbale verbali';
 const statusWords=row.status==='revoked'
   ?'revocato revocata revocati revocate'
   :'valido valida validi valide';
 const disciplineWords=labels[row.discipline]||row.discipline||'';
 const documentCode=normalizeDocumentCode(row.document_code||'').toLowerCase();
 const groupCode=String(row.document_group_code||documentGroupCodeFromCode(row.document_code)||'').toLowerCase();
 const hay=[
   row.document_code,
   documentCode,
   row.student_name,
   row.discipline,
   disciplineWords,
   row.document_group_code,
   groupCode,
   row.organization_name,
   row.final_status,
   typeWords,
   statusWords
 ].filter(Boolean).join(' ').toLowerCase();
 if(q && !hay.includes(q) && !hay.includes(normalizedQ) && !documentCode.includes(normalizedQ))return false;
 if(d&&row.discipline!==d)return false;
 if(t&&row.document_type!==t)return false;
 if(s&&row.status!==s)return false;
 return true;
}
function humanFileSize(bytes){
 const n=Number(bytes||0);if(!Number.isFinite(n)||n<=0)return '—';
 if(n<1024)return `${n} B`;
 if(n<1024*1024)return `${Math.round(n/1024)} KB`;
 return `${(n/(1024*1024)).toFixed(2).replace('.',',')} MB`;
}
function documentGenerationHistory(row){
 const list=Array.isArray(row?.generation_history)?row.generation_history:[];
 if(!list.length)return '<div class="status">Le generazioni precedenti alla Release 1.86 restano registrate nel vecchio contatore, ma non dispongono dell’impronta del file PDF.</div>';
 return `<div class="document-generation-list">${list.map(g=>`
  <div class="document-generation-row">
   <b>Generazione ${Number(g.generation_number||0)}</b>
   <span>${htmlSafe(g.file_name||'PDF')}</span>
   <span>${g.generated_at?new Date(g.generated_at).toLocaleString('it-IT'):'—'} · ${humanFileSize(g.file_size_bytes)}</span><button class="btn ghost" onclick="k9DownloadOriginal('${row.id}',${Number(g.generation_number)})">Scarica versione</button>
  </div>`).join('')}</div>`;
}
function documentArchivePeers(row){
 return (documentArchiveData||[])
   .filter(x=>x.assignment_id===row.assignment_id && x.id!==row.id)
   .sort((a,b)=>String(a.document_type).localeCompare(String(b.document_type)));
}
function openExamFromDocument(assignmentId){
 const id=String(assignmentId||'');
 const x=(examArchiveData||[]).find(r=>String(r.id)===id);
 if(!x)return note('Scheda esame non disponibile in archivio.',true);

 // Individua dinamicamente la pagina che contiene le schede esami:
 // niente ID hardcoded, così il comando resta valido anche se cambia il titolo della sezione.
 const examBox=$('examCards');
 const examPage=examBox?.closest('.app-page');
 if(!examBox||!examPage?.dataset?.pageId){
   return note('Pagina Esami e valutazioni non disponibile.',true);
 }

 showAppPage(examPage.dataset.pageId);

 setTimeout(()=>{
   const safeCardId=id.replace(/[^a-zA-Z0-9_-]/g,'');
   openExamCardId=safeCardId;

   // Funzione reale usata dalla pagina esami.
   applyOpenExamCardState();

   // La scheda reale usa data-assignment-id / data-card-id.
   const escapedId=(window.CSS&&CSS.escape)?CSS.escape(id):id.replace(/"/g,'\\"');
   const escapedCard=(window.CSS&&CSS.escape)?CSS.escape(safeCardId):safeCardId.replace(/"/g,'\\"');
   const el=examBox.querySelector(
     `.exam-fold[data-assignment-id="${escapedId}"], .exam-fold[data-card-id="${escapedCard}"]`
   );

   if(el){
     el.scrollIntoView({behavior:'smooth',block:'start'});
     const btn=el.querySelector('.exam-open-btn');
     if(btn)btn.focus({preventScroll:true});
   }else{
     note('Esame trovato, ma la scheda non è visibile nella pagina corrente.',true);
   }
 },180);
}
function renderDocumentArchive(){
 const box=$('documentArchiveList'),count=$('documentArchiveCount');
 if(!box)return;
 const rows=(documentArchiveData||[]).filter(documentArchiveMatches);
 if(count)count.textContent=`${rows.length} ${rows.length===1?'documento':'documenti'}`;
 if(!rows.length){
   box.innerHTML='<div class="empty-state">Nessun documento corrisponde ai filtri selezionati.</div>';
   return;
 }
 box.innerHTML=rows.map(row=>{
   const peers=documentArchivePeers(row);
   const first=row.issued_at?new Date(row.issued_at).toLocaleString('it-IT'):'—';
   const last=row.last_generated_at?new Date(row.last_generated_at).toLocaleString('it-IT'):'—';
   const statusLabel=row.status==='revoked'?'REVOCATO':'VALIDO';
   const statusClass=row.status==='revoked'?'bad':'ok';
   const associatedDocs=peers.length
     ?peers.map(p=>`${documentTypeHuman(p.document_type)}: ${k9EscapeHtml(p.document_code)}`).join('<br>')
     :'Nessun altro documento registrato per questo esame';
   return `<details class="document-archive-entry">
     <summary>
       <div class="document-archive-main">
         <b>${k9EscapeHtml(row.student_name||'Corsista')}</b>
         <span class="document-archive-code">${k9EscapeHtml(row.document_code)}</span>
       </div>
       <div>
         <b>${documentTypeHuman(row.document_type)}</b>
         <span class="meta">${labels[row.discipline]||row.discipline||'—'}</span>
       </div>
       <div class="document-archive-meta">
         <span class="result-state ${statusClass}">${statusLabel}</span>
       </div>
     </summary>
     <div class="document-archive-body">
       <div class="document-archive-grid">
         <div class="document-archive-field"><span class="meta">Codice documento</span><b>${k9EscapeHtml(row.document_code)}</b></div>
         <div class="document-archive-field"><span class="meta">Identificativo pratica</span><b>${k9EscapeHtml(row.document_group_code||documentGroupCodeFromCode(row.document_code))}</b></div>
         <div class="document-archive-field"><span class="meta">Esito</span><b>${k9EscapeHtml(row.final_status||'—')}</b></div>
         <div class="document-archive-field"><span class="meta">Prima emissione</span><b>${first}</b></div>
         <div class="document-archive-field"><span class="meta">Ultima generazione</span><b>${last}</b></div>
         <div class="document-archive-field"><span class="meta">Generazioni</span><b>${row.generation_count??1}</b></div>
         <div class="document-archive-field document-archive-associated">
           <span class="meta">Altri documenti dello stesso esame</span>
           <b>${associatedDocs}</b>
         </div>
         <div class="document-archive-field"><span class="meta">Organizzazione</span><b>${k9EscapeHtml(row.organization_name||'—')}</b></div>
         <div class="document-archive-field"><span class="meta">Stato registro</span><b>${statusLabel}</b></div>
       </div>
       <div class="document-trace-box">
         <div class="document-trace-title">Tracciabilità PDF</div>
         <div class="document-trace-grid">
           <div class="document-trace-item"><span class="meta">Ultimo file registrato</span><b>${k9EscapeHtml(row.latest_file_name||'Dati precedenti alla 1.86')}</b></div>
           <div class="document-trace-item"><span class="meta">Dimensione</span><b>${humanFileSize(row.latest_file_size_bytes)}</b></div>
           <div class="document-trace-item"><span class="meta">Integrità digitale</span><b>${row.latest_file_sha256?'Impronta SHA-256 registrata':'Non disponibile per le vecchie generazioni'}</b></div>
         </div>
         ${documentGenerationHistory(row)}
       </div>
       <div class="document-archive-actions"><button type="button" class="btn ghost" onclick="k9DownloadOriginal('${row.id}')">Scarica originale</button>${profile?.role==='super_admin'&&row.status!=='revoked'?`<button class="btn danger" onclick="k9RevokeDocument('${row.id}')">Revoca</button>`:''}
         ${can('verify_documents')?`<button type="button" class="btn ghost" onclick="verifyDocumentFromArchive(decodeURIComponent('${k9EncodeInline(row.document_code)}'))">Verifica documento</button>`:''}
         ${can('exam_management')?`<button type="button" class="btn ghost" onclick="openExamFromDocument('${row.assignment_id}')">Apri scheda esame</button>`:''}
         ${can('verify_documents')?peers.map(p=>`<button type="button" class="btn ghost" onclick="verifyDocumentFromArchive(decodeURIComponent('${k9EncodeInline(p.document_code)}'))">Verifica ${documentTypeHuman(p.document_type).toLowerCase()}</button>`).join(''):''}
       </div>
     </div>
   </details>`;
 }).join('');
}
window.verifyDocumentFromArchive=async code=>{
 if(!requirePermission('verify_documents','Verifica documenti non abilitata per questo ruolo.'))return;
 const normalized=normalizeDocumentCode(code);
 const documentsPage=$('documentsCard');
 const input=$('documentVerifyCode');
 const result=$('documentVerifyResult');

 if(!documentsPage?.dataset?.pageId){
   return note('Sezione Documenti esami non disponibile.',true);
 }

 // Cambia realmente pagina: non basta scrollare una card nascosta.
 showAppPage(documentsPage.dataset.pageId,false);

 if(input)input.value=normalized;
 if(result){
   result.classList.remove('hidden','valid','invalid');
   result.innerHTML='<div class="empty-state">Verifica documento in corso...</div>';
 }

 // Attende che la pagina sia resa visibile, poi esegue la verifica.
 await new Promise(resolve=>setTimeout(resolve,120));
 const row=await verifyDocumentCode();

 await new Promise(resolve=>setTimeout(resolve,60));
 result?.scrollIntoView({behavior:'smooth',block:'center'});

 if(row){
   showGlobalMessage(
     row.status==='revoked'
       ?`Documento ${k9EscapeHtml(row.document_code)} registrato ma REVOCATO.`
       :`Documento ${k9EscapeHtml(row.document_code)} verificato: VALIDO.`,
     row.status==='revoked',
     'Verifica documento'
   );
 }
};
window.openExamFromDocument=openExamFromDocument;
async function loadDocumentArchive(silent=false,force=false){
 if(!can('document_archive'))return documentArchiveData;
 if(!sb||!profile||profile.role==='student')return documentArchiveData;
 const box=$('documentArchiveList');

 // Evita richieste sovrapposte causate da boot, auto-refresh, focus e ritorno nell'app.
 if(documentArchiveLoadPromise&&!force)return documentArchiveLoadPromise;

 // Se abbiamo appena caricato correttamente, riusa i dati per 4 secondi.
 if(!force&&documentArchiveLastOk&&Date.now()-documentArchiveLastOk<4000){
   renderDocumentArchive();
   return documentArchiveData;
 }

 if(box&&!silent&&!documentArchiveData.length){
   box.innerHTML='<div class="empty-state">Caricamento archivio...</div>';
 }

 documentArchiveLoadPromise=(async()=>{
   let lastError=null;
   for(let attempt=1;attempt<=3;attempt++){
     try{
       // Prima di ogni tentativo verifica che la sessione Auth sia ancora disponibile.
       const {data:sessionData,error:sessionError}=await sb.auth.getSession();
       if(sessionError)throw sessionError;
       if(!sessionData?.session){
         const {data:userData,error:userError}=await sb.auth.getUser();
         if(userError)throw userError;
         if(!userData?.user)throw new Error('Sessione non disponibile');
       }

       const {data,error}=await sb.rpc('list_exam_documents_v2');
       if(error)throw error;

       documentArchiveData=Array.isArray(data)?data:[];
       documentArchiveLastOk=Date.now();
       renderDocumentArchive();
       return documentArchiveData;
     }catch(e){
       lastError=e;
       console.warn(`Archivio documenti tentativo ${attempt}/3:`,e);
       if(attempt<3)await new Promise(resolve=>setTimeout(resolve,350*attempt));
     }
   }

   // Un errore di rete temporaneo NON deve cancellare un archivio già caricato.
   if(documentArchiveData.length){
     renderDocumentArchive();
     if(!silent)note('Archivio mantenuto con gli ultimi dati disponibili.');
     return documentArchiveData;
   }

   if(box)box.innerHTML=`<div class="empty-state">Archivio documenti temporaneamente non disponibile.<br><small>${k9EscapeHtml(lastError?.message||lastError||'Errore di connessione')}</small><br><button type="button" class="btn ghost" style="margin-top:12px" onclick="loadDocumentArchive(false,true)">Riprova</button></div>`;
   if(!silent)note('Impossibile caricare l’archivio documenti.',true);
   return [];
 })();

 try{
   return await documentArchiveLoadPromise;
 }finally{
   documentArchiveLoadPromise=null;
 }
}
window.loadDocumentArchive=loadDocumentArchive;
function setupDocumentArchiveControls(){
 const ids=['documentArchiveSearch','documentArchiveDiscipline','documentArchiveType','documentArchiveStatus'];
 ids.forEach(id=>{
   const el=$(id);if(!el||el.dataset.archiveDocReady==='1')return;
   el.dataset.archiveDocReady='1';
   el.addEventListener(id==='documentArchiveSearch'?'input':'change',renderDocumentArchive);
 });
 const refresh=$('refreshDocumentArchiveBtn');
 if(refresh&&refresh.dataset.archiveDocReady!=='1'){
   refresh.dataset.archiveDocReady='1';
   refresh.onclick=async()=>{
     if(!sb){const ok=await ensureSupabase();if(!ok)return note('Supabase non configurato.',true)}
     await loadDocumentArchive(false,true);
   };
 }
 const reset=$('resetDocumentArchiveFilters');
 if(reset&&reset.dataset.archiveDocReady!=='1'){
   reset.dataset.archiveDocReady='1';
   reset.onclick=()=>{
     $('documentArchiveSearch').value='';
     $('documentArchiveDiscipline').value='';
     $('documentArchiveType').value='';
     $('documentArchiveStatus').value='';
     renderDocumentArchive();
   };
 }
}

function setupDocumentControls(){
 setupAnalyticsControls();
 setupDocumentArchiveControls();
 if($('documentExamSelect')&&$('documentExamSelect').dataset.docReady!=='1'){
   $('documentExamSelect').dataset.docReady='1';$('documentExamSelect').addEventListener('change',updateDocumentEligibility);
 }
 if($('documentTypeSelect')&&$('documentTypeSelect').dataset.docReady!=='1'){
   $('documentTypeSelect').dataset.docReady='1';$('documentTypeSelect').addEventListener('change',updateDocumentEligibility);
 }
 if($('generateDocumentBtn')&&$('generateDocumentBtn').dataset.docReady!=='1'){
   $('generateDocumentBtn').dataset.docReady='1';$('generateDocumentBtn').onclick=generateSelectedDocument;
 }
 if($('documentVerifyBtn')&&$('documentVerifyBtn').dataset.docReady!=='1'){
   $('documentVerifyBtn').dataset.docReady='1';$('documentVerifyBtn').onclick=verifyDocumentCode;
 }
 if($('documentVerifyFileBtn')&&$('documentVerifyFileBtn').dataset.docReady!=='1'){
   $('documentVerifyFileBtn').dataset.docReady='1';$('documentVerifyFileBtn').onclick=verifyPdfFileIntegrity;
 }
 if($('documentVerifyCode')&&$('documentVerifyCode').dataset.docReady!=='1'){
   $('documentVerifyCode').dataset.docReady='1';
   $('documentVerifyCode').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();verifyDocumentCode();}});
 }
 if($('resultReportBtn')&&$('resultReportBtn').dataset.docReady!=='1'){
   $('resultReportBtn').dataset.docReady='1';$('resultReportBtn').onclick=()=>{if(currentResultExam)generateExamReportPdf(currentResultExam)};
 }
 if($('resultDetailedReportBtn')&&$('resultDetailedReportBtn').dataset.docReady!=='1'){
   $('resultDetailedReportBtn').dataset.docReady='1';$('resultDetailedReportBtn').onclick=()=>{if(currentResultExam)generateCandidateExamReportPdf(currentResultExam)};
 }
 if($('resultCertificateBtn')&&$('resultCertificateBtn').dataset.docReady!=='1'){
   $('resultCertificateBtn').dataset.docReady='1';$('resultCertificateBtn').onclick=()=>{if(currentResultExam)try{generateCertificatePdf(currentResultExam)}catch(e){note(e.message,true)}};
 }
}
function practicalOutcomeLabel(v){
 return v==='idoneo'?'IDONEO':v==='non_idoneo'?'NON IDONEO':v==='da_rivedere'?'DA RIVEDERE':'Non definito';
}
function displayedPracticeOutcome(x){
 if(x?.discipline==='mantrailing' && x?.practical_outcome==='idoneo' && !mantrailingComponentsComplete(x)){
   return 'IN VALUTAZIONE';
 }
 return practicalOutcomeLabel(x?.practical_outcome);
}
function finalExamStatus(x){
 const theoryDone=['submitted','expired'].includes(x.status);
 if(!theoryDone)return{code:'waiting',label:'Teoria da completare'};
 if(x.passed===false)return{code:'failed',label:'ESAME NON SUPERATO'};
 if(x.practical_outcome==='idoneo'){
   if(x.discipline==='mantrailing'&&!mantrailingComponentsComplete(x))return{code:'waiting',label:'Componenti da completare'};
   return{code:'complete',label:'ESAME SUPERATO'};
 }
 if(x.practical_outcome==='non_idoneo')return{code:'failed',label:'ESAME NON SUPERATO'};
 if(x.practical_outcome==='da_rivedere')return{code:'waiting',label:'DA RIVEDERE'};
 return{code:'waiting',label:'Pratica da completare'};
}
window.openFinalResult=encoded=>{
 const x=JSON.parse(decodeURIComponent(encoded));
 currentResultExam=x;
 const status=finalExamStatus(x);
 const theoryPct=Number(x.score_percentage||0);
 const practicalPct=x.practical_score!==null?Math.round(Number(x.practical_score)/50*100):null;
 const professionalPct=x.professional_score!==null?Math.round(Number(x.professional_score)/20*100):null;
 const statusClass=status.code==='complete'?'ok':status.code==='failed'?'bad':status.code==='waiting'?'warn':'neutral';
 $('finalResultTitle').textContent=x.student_name||x.student_email||'Esito esame';
 $('finalResultSubtitle').textContent=(labels[x.discipline]||x.discipline)+' · '+new Date(x.assigned_at).toLocaleString('it-IT');
 const theoryState=x.passed===true?'Superata':x.passed===false?'Non superata':['submitted','expired'].includes(x.status)?'Conclusa':'Da svolgere';
 const theoryClass=x.passed===true?'ok':x.passed===false?'bad':'warn';
 $('finalResultBody').innerHTML=`
 <div class="result-summary"><h3>Stato finale</h3><span class="result-state ${statusClass}">${status.label}</span></div>
 <div class="result-grid">
  <div class="result-tile"><div class="meta">Teoria</div><div class="value">${['submitted','expired'].includes(x.status)?theoryPct+'%':'—'}</div><span class="result-state ${theoryClass}">${theoryState}</span></div>
  <div class="result-tile"><div class="meta">Pratica</div><div class="value">${displayedPracticeOutcome(x)}</div><div class="meta">${x.practical_score===null?'Non compilata':x.practical_score+'/50 · '+(practicalPct===null?'—':practicalPct+'%')}</div></div>
  <div class="result-tile"><div class="meta">Professionalità</div><div class="value">${professionalPct===null?'—':professionalPct+'%'}</div><div class="meta">${x.professional_score===null?'Non compilata':x.professional_score+'/20'}</div></div>
 </div>
 <div class="result-list">
  <div class="result-list-row"><b>Disciplina</b><span>${k9EscapeHtml(labels[x.discipline]||x.discipline)}</span></div>
  <div class="result-list-row"><b>Domande teoriche</b><span>${x.question_count||0}</span></div>
  <div class="result-list-row"><b>Corrette</b><span>${x.correct_answers||0}</span></div>
  <div class="result-list-row"><b>Soglia teoria</b><span>${x.pass_percentage||0}%</span></div>
  <div class="result-list-row"><b>Esaminatore</b><span>${k9EscapeHtml(x.evaluator_name||x.evaluator_email||'Non assegnato')}</span></div>
  <div class="result-list-row"><b>Esito pratica</b><span>${displayedPracticeOutcome(x)}</span></div>
  ${x.discipline==='mantrailing'?`<div class="result-list-row result-components-row"><b>Componenti estratte</b><span>${normalizePracticalComponents(x.practical_components).length?normalizePracticalComponents(x.practical_components).map((c,i)=>`Componente ${i+1}: ${k9EscapeHtml(c.name)} — ${k9EscapeHtml(componentStatusLabel(c.status))}`).join('<br>'):'Non ancora generate'}</span></div>`:''}
  <div class="result-list-row"><b>Pratica finalizzata</b><span>${x.practical_completed_at?new Date(x.practical_completed_at).toLocaleString('it-IT'):'No'}</span></div>
  <div class="result-list-row"><b>Osservazioni</b><span>${k9EscapeHtml(x.practical_notes||'—')}</span></div>
 </div>`;
 setupDocumentControls();
 if($('resultCertificateBtn'))$('resultCertificateBtn').disabled=!certificateEligible(x);
 $('finalResultDialog').showModal();
};



let openExamCardId='';
let examCardTapLock=0;
window.openExamCard=function(event,id){
 if(event){
   event.preventDefault();
   event.stopPropagation();
   if(typeof event.stopImmediatePropagation==='function')event.stopImmediatePropagation();
 }
 const now=Date.now();
 if(now-examCardTapLock<300)return false;
 examCardTapLock=now;
 openExamCardId=(openExamCardId===id)?'':id;
 applyOpenExamCardState();
 return false;
};
function applyOpenExamCardState(){
 const box=$('examCards');if(!box)return;
 let found=false;
 box.querySelectorAll('.exam-fold').forEach(card=>{
   const id=card.dataset.cardId||'';
   const open=!!openExamCardId&&id===openExamCardId;
   if(open)found=true;
   card.classList.toggle('exam-card-open',open);
   const btn=card.querySelector('.exam-open-btn');
   if(btn){btn.textContent=open?'Chiudi scheda':'Apri scheda';btn.setAttribute('aria-expanded',String(open))}
 });
 if(openExamCardId&&!found)openExamCardId='';
}
function auditValueLabel(key,value){
 if(value===true)return 'Sì';
 if(value===false)return 'No';
 const maps={
  status:{assigned:'Assegnato',in_progress:'In corso',started:'In corso',submitted:'Esame consegnato',expired:'Scaduto',completed:'Concluso',pending:'In attesa',approved:'Approvato',rejected:'Respinto'},
  outcome:{idoneo:'Idoneo',non_idoneo:'Non idoneo',da_rivedere:'Da rivedere'},
  document_type:{verbale:'Verbale',attestato:'Attestato',report:'Report dettagliato'},
  selected_option:{A:'A',B:'B',C:'C',D:'D'}
 };
 const translated=maps[key]?.[String(value)];
 return translated!==undefined?translated:String(value).replaceAll('_',' ');
}
function auditDataSummary(data){
 const d=data||{};const parts=[];
 // Gli identificativi tecnici restano nel database ma non vengono esposti nella vista ordinaria.
 const map={discipline:'Disciplina',question_count:'Domande',duration_minutes:'Durata (minuti)',pass_percentage:'Soglia di superamento',position:'Numero domanda',selected_option:'Risposta selezionata',is_correct:'Risposta corretta',from:'Da',to:'A',correct_answers:'Risposte corrette',answered_questions:'Risposte date',score_percentage:'Punteggio',passed:'Teoria superata',practical_score:'Punteggio pratica',professional_score:'Professionalità',outcome:'Esito pratica',document_type:'Documento',document_code:'Codice documento',generation_count:'Numero generazioni',file_name:'Nome file PDF',file_size_bytes:'Dimensione PDF (byte)',status:'Stato'};
 Object.keys(map).forEach(k=>{
  if(d[k]===undefined||d[k]===null||d[k]===''||Array.isArray(d[k])||typeof d[k]==='object')return;
  let value=auditValueLabel(k,d[k]);
  if(k==='score_percentage'||k==='pass_percentage')value=`${value}%`;
  parts.push(`${map[k]}: ${value}`);
 });
 if(Array.isArray(d.components)&&d.components.length)parts.push(`Componenti tecniche: ${d.components.length}`);
 return parts.join(' · ')||'Operazione registrata dal sistema.';
}
function auditRoleLabel(role){
 return ({system:'Sistema',super_admin:'Super Amministratore',vice_admin:'Vice Amministratore',teacher:'Docente',examiner:'Esaminatore',student:'Corsista'}[role]||'Sistema');
}
function auditEventVisible(e){
 if(!['practice_saved','practice_updated'].includes(e?.event_type))return true;
 const d=e.event_data||{};
 // Le scritture parziali restano nell'audit immutabile ma vengono nascoste dalla cronologia ordinaria.
 const hasOutcome=['idoneo','non_idoneo','da_rivedere'].includes(String(d.outcome||''));
 const hasScores=Number(d.practical_score||0)>0||Number(d.professional_score||0)>0;
 return hasOutcome&&hasScores;
}
function auditEventTitle(e){
 const titles={
  audit_baseline:'Stato iniziale acquisito all’attivazione del registro',
  question_prepared:'Domanda preparata per la prova',
  answer_recorded:'Risposta registrata',
  retry_recorded:'Ripetizione della risposta registrata',
  retry_reviewed:'Correzione revisionata',
  practice_saved:'Valutazione pratica registrata',
  practice_updated:'Valutazione pratica aggiornata',
  document_created:'Documento generato',
  document_regenerated:'Documento rigenerato',
  pdf_traced:'PDF registrato nel fascicolo',
  course_created:'Corso preparato'
 };
 return titles[e?.event_type]||e?.event_label||'Operazione registrata';
}
window.openExamAudit=async function(assignmentId){
 const dlg=$('auditDialog'),box=$('auditTimeline');if(!dlg||!box)return;
 box.innerHTML='<div class="status">Caricamento registro…</div>';dlg.showModal();
 try{
  const {data,error}=await sb.rpc('get_exam_audit_timeline',{p_assignment_id:assignmentId});if(error)throw error;
  const rows=(data||[]).filter(auditEventVisible);
  box.innerHTML=rows.length?rows.map(e=>{
   const actor=htmlSafe(e.actor_name||'Sistema');
   const role=htmlSafe(auditRoleLabel(e.actor_role));
   const actorMeta=(actor==='Sistema'&&role==='Sistema')?'Sistema':`${actor} · ${role}`;
   return `<div class="audit-event"><div class="audit-event-head"><b>${htmlSafe(auditEventTitle(e))}</b><span class="audit-event-time">${e.created_at?new Date(e.created_at).toLocaleString('it-IT'):'—'}</span></div><div class="audit-event-meta">${actorMeta}</div><div class="audit-event-data">${htmlSafe(auditDataSummary(e.event_data))}</div></div>`;
  }).join(''):'<div class="empty-state">Nessuna operazione significativa disponibile per questo esame.</div>';
 }catch(error){box.innerHTML=`<div class="notice bad"><b>Registro non disponibile</b><br>${htmlSafe(error.message||String(error))}</div>`}
};

async function loadExams(){
 if(can('assign_evaluator')&&!examinerOptions.length)await loadExaminers();
 let data;
 try{data=await fetchAllRows('exam_overview','*',q=>q.order('assigned_at',{ascending:false}))}
 catch(error){return note(error.message,true)}
 examArchiveData=data||[];
 setupArchiveFilters();renderArchive();refreshDocumentSelector();setupDocumentControls();renderAnalytics();loadDocumentArchive(true);
 const box=$('examCards');if(!box)return;
 if(!(data||[]).length){box.innerHTML='<div class="empty-state">Nessun esame presente.</div>';openExamCardId='';return}
 box.innerHTML=(data||[]).map(x=>{
   const theoryDone=['submitted','expired'].includes(x.status);
   const practiceDone=['idoneo','non_idoneo'].includes(x.practical_outcome);
   const practiceReview=x.practical_outcome==='da_rivedere';
   const componentsPending=x.discipline==='mantrailing'&&x.practical_outcome==='idoneo'&&!mantrailingComponentsComplete(x);
   const actionLabel=componentsPending?'Completa componenti':practiceDone?'Pratica chiusa · '+practicalOutcomeLabel(x.practical_outcome):practiceReview?'Rivedi pratica':theoryDone?'Compila pratica':'Attendi teoria';
   const disabled=(!theoryDone||practiceDone)?'disabled':'';
   const disabledClass=!theoryDone?'practice-disabled':'';
   const criteria=k9EncodeInline(JSON.stringify(x.practical_criteria||[]));
   const professional=k9EncodeInline(JSON.stringify(x.professional_criteria||[]));
   const notes=k9EncodeInline(x.practical_notes||'');
   const outcome=k9EncodeInline(x.practical_outcome||'');
   const components=k9EncodeInline(JSON.stringify(x.practical_components||[]));
   const payload=k9EncodeInline(JSON.stringify(x));
   const practiceAction=can('practice_evaluation')
     ? `<button type="button" class="btn primary ${disabledClass}" ${disabled} onclick="openPractice('${x.id}','${x.discipline}','${criteria}','${professional}','${notes}','${outcome}','${components}')">${actionLabel}</button>`
     : '';
   const status=finalExamStatus(x);
   const statusClass=status.code==='complete'?'ok':status.code==='failed'?'bad':status.code==='waiting'?'warn':'neutral';
   const theoryLabel=!theoryDone?'Da svolgere':x.passed===true?'Superata':'Non superata';
   const theoryValue=theoryDone?`${x.correct_answers||0}/${x.question_count||0} · ${x.score_percentage||0}%`:`0/${x.question_count||0}`;
   const practiceValue=x.practical_outcome?`${displayedPracticeOutcome(x)}${x.practical_score!==null?' · '+x.practical_score+'/50':''}`:'Da completare';
   const professionalValue=x.professional_score!==null?`${x.professional_score||0}/20`:'—';
   const examinerControl=can('assign_evaluator')
     ? `<select aria-label="Esaminatore" onchange="setEvaluator('${x.id}',this.value,event)"><option value="">Non assegnato</option>${examinerOptions.map(e=>`<option value="${e.id}" ${x.evaluator_id===e.id?'selected':''}>${k9EscapeHtml(e.full_name||e.email)} — ${e.role==='examiner'?'Esaminatore':'Docente'}</option>`).join('')}</select>`
     : `<b>${k9EscapeHtml(x.evaluator_name||x.evaluator_email||'Non assegnato')}</b>`;
   const when=x.assigned_at?new Date(x.assigned_at).toLocaleString('it-IT'):'—';
   const practiceWhen=x.practical_completed_at?new Date(x.practical_completed_at).toLocaleString('it-IT'):(x.practical_outcome==='da_rivedere'?'Valutazione salvata, da rivedere':'Non finalizzata');
   const safeCardId=String(x.id).replace(/[^a-zA-Z0-9_-]/g,'');
   const isOpen=openExamCardId===safeCardId;
   return `<div class="exam-fold ${isOpen?'exam-card-open':''}" data-assignment-id="${x.id}" data-card-id="${safeCardId}">
     <div class="exam-fold-summary">
       <div class="exam-fold-main"><span class="exam-fold-name">${k9EscapeHtml(x.student_name||x.student_email||'Corsista')}</span><span class="exam-fold-sub"><b>${labels[x.discipline]||x.discipline}</b><span>·</span><span>${theoryDone?theoryValue:'Teoria da svolgere'}</span></span></div>
       <span class="result-state ${statusClass} exam-fold-summary-status">${status.label}</span>
       <button type="button" class="btn ghost exam-open-btn" aria-expanded="${isOpen?'true':'false'}" data-card-id="${safeCardId}">${isOpen?'Chiudi scheda':'Apri scheda'}</button>
     </div>
     <div class="exam-fold-body">
       <div class="exam-fold-grid">
         <div class="exam-fold-field"><span>Teoria</span><b class="${x.passed===true?'exam-theory-ok':x.passed===false?'exam-theory-bad':''}">${theoryLabel} · ${theoryValue}</b><small>Soglia ${x.pass_percentage||0}%</small></div>
         <div class="exam-fold-field"><span>Pratica</span><b>${practiceValue}</b><small>${practiceWhen}</small></div>
         <div class="exam-fold-field"><span>Professionalità</span><b>${professionalValue}</b></div>
         <div class="exam-fold-field"><span>Esaminatore</span>${examinerControl}</div>
         <div class="exam-fold-field"><span>Disciplina</span><b>${labels[x.discipline]||x.discipline}</b></div>
         <div class="exam-fold-field"><span>Assegnato il</span><b>${when}</b></div>
       </div>
       <div class="exam-fold-actions">${practiceAction}<button type="button" class="btn ghost" onclick="openFinalResult('${payload}')">Dettaglio esito</button><button type="button" class="btn ghost" onclick="openExamAudit('${x.id}')">Registro audit</button>${profile?.role==='super_admin'&&x.status==='in_progress'?`<button class="btn ghost" onclick="k9ReleaseSession('${x.id}')">Sblocca accesso prova</button>`:''}${profile?.role==='super_admin'&&['idoneo','non_idoneo'].includes(x.practical_outcome)?`<button class="btn ghost" onclick="k9ReopenPractice('${x.id}')">Riapri valutazione</button>`:''}${profile?.role==='super_admin'?`<button type="button" class="btn danger delete-exam" data-id="${x.id}">Elimina esame</button>`:''}</div>
     </div>
   </div>`;
 }).join('');
 box.querySelectorAll('.exam-open-btn').forEach(btn=>{
   btn.onclick=e=>openExamCard(e,btn.dataset.cardId||'');
 });
 box.querySelectorAll('.delete-exam').forEach(btn=>{
   btn.onclick=e=>{e.preventDefault();e.stopPropagation();deleteManagedExam(btn.dataset.id||'')};
 });
 applyOpenExamCardState();
}
async function k9ReleaseSession(id){if(!confirm('Consentire un nuovo accesso alla prova? Il timer e le risposte restano invariati.'))return;const{error}=await sb.rpc('k9_release_exam_session',{p_assignment:id});if(error)return note(error.message,true);note('Accesso sbloccato.');}
async function k9ReopenPractice(id){const reason=prompt('Motivo riapertura della valutazione (verbale e attestato già emessi saranno revocati):');if(!reason?.trim())return;const{error}=await sb.rpc('k9_reopen_practical',{p_assignment:id,p_reason:reason.trim()});if(error)return note(error.message,true);note('Valutazione riaperta.');await refreshAll(true);}
async function deleteManagedExam(id){
 if(profile?.role!=='super_admin')return note('Funzione riservata al Super Amministratore.',true);
 if(!isUuid(id))return note('Esame non valido.',true);
 const x=(examArchiveData||[]).find(row=>String(row.id)===String(id));
 const student=x?.student_name||x?.student_email||'Corsista';
 const discipline=labels[x?.discipline]||x?.discipline||'Esame';
 const status=x?.status||'assigned';
 const theoryStarted=!!x?.started_at||status!=='assigned';
 const practicePresent=!!x?.practical_outcome||x?.practical_score!==null||x?.professional_score!==null;
 const firstWarning=theoryStarted||practicePresent
   ? `Eliminare l’esame di ${student} — ${discipline}?\n\nLa prova risulta già iniziata, conclusa o valutata. Il sistema controllerà tutti i dati collegati prima di consentire l’eliminazione definitiva.`
   : `Eliminare definitivamente l’esame creato per ${student} — ${discipline}?\n\nSe la prova non è mai stata iniziata verrà rimossa immediatamente.`;
 if(!confirm(firstWarning))return;
 try{
   let result=await invokeAccessManager({action:'delete_exam',assignment_id:id,confirm_progressed:false});
   if(result?.requires_confirmation){
     const details=Array.isArray(result.details)&&result.details.length?`\n\nDati che verranno eliminati:\n• ${result.details.join('\n• ')}`:'';
     const warning=`ATTENZIONE — SECONDA CONFERMA\n\nQuesto esame contiene già attività o dati storici.${details}\n\nL’eliminazione è definitiva e non può essere annullata. Procedere?`;
     if(!confirm(warning))return;
     result=await invokeAccessManager({action:'delete_exam',assignment_id:id,confirm_progressed:true});
   }
   if(!result?.deleted)throw new Error('Eliminazione dell’esame non confermata dal server.');
   if(openExamCardId===String(id).replace(/[^a-zA-Z0-9_-]/g,''))openExamCardId='';
   note(`Esame di ${student} eliminato definitivamente.`);
   await refreshAll(true);
 }catch(e){note(e.message,true)}
}
$('refreshExams').onclick=()=>refreshAll(false);

function renderRatingGroup(containerId,labelsList,valuesStore,prefix){
 const box=$(containerId);
 box.innerHTML=labelsList.map((label,i)=>`<div class="criterion"><b>${i+1}. ${label}</b><div class="rating">${[1,2,3,4,5].map(v=>`<button type="button" class="btn ghost ${valuesStore[i]===v?'selected':''}" data-prefix="${prefix}" data-i="${i}" data-v="${v}">${v}</button>`).join('')}</div></div>`).join('');
 box.querySelectorAll('button').forEach(b=>b.onclick=()=>{
   const store=b.dataset.prefix==='practice'?practiceValues:professionalValues;
   store[+b.dataset.i]=+b.dataset.v;
   b.parentElement.querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));
   updatePracticeTotals();
 });
}
function examAdvisoryRecommendation(exam,practicalScore,professionalScore,disc,components,completePractice=true,completeProfessional=true){
 const theoryDone=['submitted','expired'].includes(exam?.status);
 const theoryPassed=exam?.passed===true;
 const practicalPct=Math.round((Number(practicalScore)||0)/50*100);
 const professionalPct=Math.round((Number(professionalScore)||0)/20*100);
 if(!theoryDone)return{code:'waiting',label:'DATI DA COMPLETARE',reason:'La prova teorica non risulta ancora conclusa.'};
 if(!completePractice||!completeProfessional)return{code:'waiting',label:'DATI DA COMPLETARE',reason:'Completa tutti i criteri della prova pratica e della professionalità.'};
 if(disc==='mantrailing'){
   const rows=normalizePracticalComponents(components);
   if(rows.length<2||rows.some(c=>!c.status))return{code:'waiting',label:'DATI DA COMPLETARE',reason:'Per il Mantrailing devono essere generate e valutate entrambe le componenti tecniche.'};
   if(rows.some(c=>c.status==='da_rivedere'))return{code:'waiting',label:'DA RIVEDERE',reason:'Almeno una componente tecnica è stata indicata come DA RIVEDERE.'};
   if(rows.some(c=>c.status==='non_superata'))return{code:'bad',label:'CONSIGLIO: NON IDONEO',reason:'Almeno una componente tecnica obbligatoria non è stata superata.'};
 }
 if(!theoryPassed)return{code:'bad',label:'CONSIGLIO: NON IDONEO',reason:`La prova teorica non ha raggiunto la soglia prevista (${exam?.pass_percentage||0}%).`};
 if(practicalPct<60||professionalPct<60){
   const parts=[];
   if(practicalPct<60)parts.push(`pratica ${practicalPct}%`);
   if(professionalPct<60)parts.push(`professionalità ${professionalPct}%`);
   return{code:'bad',label:'CONSIGLIO: NON IDONEO',reason:`L'indicazione orientativa segnala valori inferiori al livello sufficiente del 60%: ${parts.join(' e ')}.`};
 }
 return{code:'ok',label:'CONSIGLIO: IDONEO',reason:`Teoria superata; pratica ${practicalPct}% e professionalità ${professionalPct}%, entrambe almeno al livello sufficiente del 60%.`};
}
function updateExamRecommendation(){
 const value=$('examRecommendationValue'),reason=$('examRecommendationReason');
 if(!value||!reason||!currentPractice)return;
 const exam=(examArchiveData||[]).find(x=>String(x.id)===String(currentPractice.id))||{};
 const ps=Object.values(practiceValues).reduce((a,v)=>a+(Number(v)||0),0);
 const prof=Object.values(professionalValues).reduce((a,v)=>a+(Number(v)||0),0);
 const completePractice=practical[currentPractice.disc].every((_,i)=>Number(practiceValues[i])>=1);
 const completeProfessional=professionalCriteria.every((_,i)=>Number(professionalValues[i])>=1);
 const rec=examAdvisoryRecommendation(exam,ps,prof,currentPractice.disc,currentPractice.components,completePractice,completeProfessional);
 value.className='recommendation-value '+(rec.code==='ok'?'ok':rec.code==='bad'?'bad':'warn');
 value.textContent=rec.label;
 reason.textContent=rec.reason;
}
function updatePracticeTotals(){
 const ps=Object.values(practiceValues).reduce((a,v)=>a+(Number(v)||0),0);
 const prof=Object.values(professionalValues).reduce((a,v)=>a+(Number(v)||0),0);
 $('practiceLiveScore').textContent=ps+'/50';
 $('professionalLiveScore').textContent=prof+'/20';
 updateExamRecommendation();
}

function normalizePracticalComponents(value){
 const rows=Array.isArray(value)?value:[];
 return rows.slice(0,2).map(x=>({
   name:String(x?.name||'').trim(),
   status:['superata','non_superata','da_rivedere'].includes(x?.status)?x.status:'',
   generated_at:x?.generated_at||null,
   evaluated_at:x?.evaluated_at||null
 })).filter(x=>x.name);
}
function componentStatusLabel(v){
 return v==='superata'?'SUPERATA':v==='non_superata'?'NON SUPERATA':v==='da_rivedere'?'DA RIVEDERE':'Da valutare';
}
function mantrailingComponentsComplete(x){
 if(x?.discipline!=='mantrailing')return true;
 const rows=normalizePracticalComponents(x?.practical_components);
 return rows.length===2&&rows.every(c=>c.status==='superata');
}
async function persistPracticalComponents(){
 if(!currentPractice||currentPractice.disc!=='mantrailing')return false;
 const payload={
   assignment_id:currentPractice.id,
   evaluator_id:user.id,
   discipline:currentPractice.disc,
   components:normalizePracticalComponents(currentPractice.components)
 };
 const{error}=await sb.from('practical_evaluations').upsert(payload,{onConflict:'assignment_id'});
 if(error){note(error.message,true);return false}
 return true;
}
function renderPracticalComponents(){
 const block=$('practiceComponentBlock'),box=$('practiceComponents');
 if(!block||!box)return;
 if(currentPractice?.disc!=='mantrailing'){
   block.classList.add('hidden');box.innerHTML='';return;
 }
 block.classList.remove('hidden');
 currentPractice.components=normalizePracticalComponents(currentPractice.components);
 const rows=currentPractice.components;
 let body='';
 rows.forEach((c,i)=>{
   body+=`<div class="component-card">
     <div class="component-head">
       <div><span class="component-kicker">Componente ${i+1}</span><b>${c.name}</b></div>
       <span class="result-state ${c.status==='superata'?'ok':c.status==='non_superata'?'bad':'warn'}">${componentStatusLabel(c.status)}</span>
     </div>
     <div class="component-actions">
       <select id="componentStatus${i}" aria-label="Esito componente ${i+1}">
         <option value="">Seleziona esito</option>
         <option value="superata" ${c.status==='superata'?'selected':''}>SUPERATA</option>
         <option value="non_superata" ${c.status==='non_superata'?'selected':''}>NON SUPERATA</option>
         <option value="da_rivedere" ${c.status==='da_rivedere'?'selected':''}>DA RIVEDERE</option>
       </select>
       <button type="button" class="btn ghost" onclick="savePracticalComponentStatus(${i})">Salva componente ${i+1}</button>
     </div>
   </div>`;
 });
 if(!rows.length){
   body+=`<button type="button" class="btn primary component-generate-btn" onclick="generateNextPracticalComponent()">Genera prima componente</button>`;
 }else if(rows.length===1&&rows[0].status==='superata'){
   body+=`<button type="button" class="btn primary component-generate-btn" onclick="generateNextPracticalComponent()">Genera seconda componente</button>`;
 }else if(rows.length===1){
   body+=`<p class="status">La seconda componente sarà disponibile solo quando la prima risulterà SUPERATA.</p>`;
 }
 box.innerHTML=body;
}
window.generateNextPracticalComponent=async()=>{
 if(!requirePermission('practice_evaluation','Valutazione pratica non abilitata per questo ruolo.'))return;
 if(!currentPractice||currentPractice.disc!=='mantrailing')return;
 currentPractice.components=normalizePracticalComponents(currentPractice.components);
 if(currentPractice.components.length>=2)return note('Sono già state generate due componenti.',true);
 if(currentPractice.components.length===1&&currentPractice.components[0].status!=='superata')
   return note('La prima componente deve essere SUPERATA prima di generare la seconda.',true);
 const used=new Set(currentPractice.components.map(x=>x.name));
 const available=mantrailingComponents.filter(x=>!used.has(x));
 if(!available.length)return note('Nessuna componente disponibile.',true);
 const rnd=(crypto?.getRandomValues)?crypto.getRandomValues(new Uint32Array(1))[0]:Math.floor(Math.random()*0xffffffff);
 const name=available[rnd%available.length];
 currentPractice.components.push({name,status:'',generated_at:new Date().toISOString(),evaluated_at:null});
 if(await persistPracticalComponents()){
   renderPracticalComponents();
   updateExamRecommendation();
   saveNote(`Salvataggio completato — componente ${currentPractice.components.length} generata: ${name}.`);
 }
};
window.savePracticalComponentStatus=async index=>{
 if(!requirePermission('practice_evaluation','Valutazione pratica non abilitata per questo ruolo.'))return;
 if(!currentPractice||currentPractice.disc!=='mantrailing')return;
 const select=$('componentStatus'+index);
 const status=select?.value||'';
 if(!['superata','non_superata','da_rivedere'].includes(status))
   return note('Seleziona l’esito della componente.',true);
 const row=currentPractice.components?.[index];
 if(!row)return;
 row.status=status;
 row.evaluated_at=new Date().toISOString();
 if(await persistPracticalComponents()){
   renderPracticalComponents();
   updateExamRecommendation();
   saveNote(`Salvataggio completato — componente ${index+1}: ${componentStatusLabel(status)}.`);
 }
};


function assessmentScoreLevel(score,max){
 const pct=max>0?(Number(score)||0)/max*100:0;
 if(pct>=92)return 'eccellente'; if(pct>=82)return 'molto_buono'; if(pct>=70)return 'buono'; if(pct>=60)return 'sufficiente'; return 'critico';
}
function assessmentLabelList(items,mode='high'){
 const sorted=[...items].sort((a,b)=>mode==='low'?a.score-b.score:b.score-a.score);
 const selected=sorted.filter(x=>mode==='low'?x.score<=3:x.score>=4).slice(0,2);
 return selected.map(x=>x.label.toLowerCase()).join(' e ');
}
function disciplineAssessmentFocus(disc){
 return {dogsitter:'gestione del cane, sicurezza operativa e relazione con il proprietario',mantrailing:'preparazione operativa, conduzione sul trail, lettura del cane e gestione tecnica della prova',hrdd:'biosicurezza, strategia di ricerca, controllo della contaminazione e lettura operativa del cane',detection:'strategia di ricerca, discriminazione olfattiva, conduzione e qualità della segnalazione'}[disc]||'competenze tecniche e operative previste dalla prova';
}
function generateProfessionalAssessmentText(){
 if(!currentPractice)return '';
 const exam=(examArchiveData||[]).find(x=>String(x.id)===String(currentPractice.id))||{};
 const disc=currentPractice.disc, disciplineName=labels[disc]||disc||'disciplina';
 const practiceItems=practical[disc].map((label,i)=>({label,score:Number(practiceValues[i]||0)}));
 const professionalItems=professionalCriteria.map((label,i)=>({label,score:Number(professionalValues[i]||0)}));
 const practicalScore=practiceItems.reduce((s,x)=>s+x.score,0), professionalScore=professionalItems.reduce((s,x)=>s+x.score,0);
 const theoryPct=Number(exam.score_percentage||0), correct=Number(exam.correct_answers||0), total=Number(exam.question_count||0), theoryPassed=exam.passed===true;
 const outcome=$('practiceOutcome')?.value||exam.practical_outcome||'';
 const pLevel=assessmentScoreLevel(practicalScore,50), profLevel=assessmentScoreLevel(professionalScore,20);
 const strengths=assessmentLabelList(practiceItems,'high'), weaknesses=assessmentLabelList(practiceItems,'low'), profStrengths=assessmentLabelList(professionalItems,'high');
 const components=normalizePracticalComponents(currentPractice.components);
 const componentText=disc==='mantrailing'&&components.length?` Nelle componenti tecniche assegnate (${components.map(c=>c.name).join(' e ')}) ha riportato ${components.map(c=>componentStatusLabel(c.status).toLowerCase()).join(' e ')}.`:'';
 let opening='';
 if(pLevel==='eccellente')opening=`Il corsista ha affrontato la prova pratica di ${disciplineName} con livello tecnico eccellente, dimostrando padronanza, precisione e continuità operativa.`;
 else if(pLevel==='molto_buono')opening=`Il corsista ha svolto la prova pratica di ${disciplineName} con un livello tecnico molto buono, mostrando preparazione solida e gestione complessivamente sicura e coerente.`;
 else if(pLevel==='buono')opening=`Il corsista ha svolto la prova pratica di ${disciplineName} con un livello tecnico buono, evidenziando competenze adeguate e una gestione generalmente corretta delle situazioni proposte.`;
 else if(pLevel==='sufficiente')opening=`Il corsista ha raggiunto nella prova pratica di ${disciplineName} un livello complessivamente sufficiente, dimostrando le competenze essenziali richieste ma con aspetti tecnici ancora da consolidare.`;
 else opening=`La prova pratica di ${disciplineName} ha evidenziato criticità tecniche che richiedono ulteriore consolidamento prima di considerare pienamente acquisiti gli standard operativi richiesti.`;
 let theory=total>0?` La prova teorica è stata conclusa con ${correct}/${total} risposte corrette (${Math.round(theoryPct)}%), risultando ${theoryPassed?'superata':'non superata'}.`:'';
 let detail=` La valutazione ha riguardato ${disciplineAssessmentFocus(disc)}.`;
 if(strengths)detail+=` Gli elementi maggiormente positivi sono risultati ${strengths}.`; if(weaknesses)detail+=` Richiedono invece maggiore attenzione ${weaknesses}.`;
 let professional='';
 if(profLevel==='eccellente'||profLevel==='molto_buono')professional=` Sul piano professionale ha mostrato ${profStrengths||'organizzazione, affidabilità, comunicazione e autonomia'} con comportamento maturo e coerente con il ruolo.`;
 else if(profLevel==='buono')professional=' Il comportamento professionale è risultato adeguato, con buona affidabilità e capacità di operare nel rispetto delle indicazioni ricevute.';
 else if(profLevel==='sufficiente')professional=" La professionalità risulta sufficiente, pur richiedendo maggiore continuità nell'organizzazione, nella comunicazione e nell'autonomia decisionale.";
 else professional=' Sul piano professionale sono necessari ulteriori miglioramenti in termini di affidabilità, organizzazione, comunicazione e autonomia operativa.';
 let conclusion=outcome==='idoneo'?' Nel complesso, la prestazione risulta coerente con un giudizio di idoneità.':outcome==='non_idoneo'?' Nel complesso, gli elementi rilevati non consentono al momento di esprimere un giudizio di idoneità; si raccomanda un percorso di consolidamento mirato prima di una nuova valutazione.':outcome==='da_rivedere'?' Il quadro complessivo richiede un ulteriore approfondimento e una successiva rivalutazione prima della definizione dell’esito.':' La valutazione conclusiva resta subordinata alla decisione finale dell’esaminatore.';
 let text=(opening+theory+detail+professional+componentText+conclusion).replace(/\s+/g,' ').trim();
 return text;
}
function generateProfessionalAssessment(){
 if(!currentPractice)return note('Apri prima una valutazione pratica.',true);
 const missingPractice=practical[currentPractice.disc].some((_,i)=>!practiceValues[i]), missingProfessional=professionalCriteria.some((_,i)=>!professionalValues[i]);
 if(missingPractice||missingProfessional)return note('Assegna prima tutti i punteggi pratici e di professionalità.',true);
 $('practiceNotes').value=generateProfessionalAssessmentText(); note('Valutazione professionale generata. Puoi modificarla prima di salvare.');
}

window.openPractice=(id,disc,criteriaEncoded,professionalEncoded,notesEncoded,outcomeEncoded,componentsEncoded)=>{
 if(!requirePermission('practice_evaluation','Valutazione pratica non abilitata per questo ruolo.'))return;
 currentPractice={id,disc,components:normalizePracticalComponents(JSON.parse(decodeURIComponent(componentsEncoded||'%5B%5D')))};
 const savedCriteria=JSON.parse(decodeURIComponent(criteriaEncoded||'%5B%5D'));
 const savedProfessional=JSON.parse(decodeURIComponent(professionalEncoded||'%5B%5D'));
 practiceValues={};professionalValues={};
 savedCriteria.forEach((x,i)=>{if(Number(x.score)>=1&&Number(x.score)<=5)practiceValues[i]=Number(x.score)});
 savedProfessional.forEach((x,i)=>{if(Number(x.score)>=1&&Number(x.score)<=5)professionalValues[i]=Number(x.score)});
 $('practiceTitle').textContent='Valutazione pratica — '+labels[disc];
 $('practiceNotes').value=decodeURIComponent(notesEncoded||'');
 $('practiceOutcome').value=decodeURIComponent(outcomeEncoded||'');
 renderPracticalComponents();
 renderRatingGroup('practiceCriteria',practical[disc],practiceValues,'practice');
 renderRatingGroup('professionalCriteria',professionalCriteria,professionalValues,'professional');
 updatePracticeTotals();
 const generateBtn=$('generateProfessionalAssessment');
 if(generateBtn)generateBtn.onclick=generateProfessionalAssessment;
 $('practiceDialog').showModal();
};
$('savePractice').onclick=async e=>{
 e.preventDefault();
 if(!requirePermission('practice_evaluation','Valutazione pratica non abilitata per questo ruolo.'))return;
 if(!currentPractice)return;
 const missingPractice=practical[currentPractice.disc].some((_,i)=>!practiceValues[i]);
 const missingProfessional=professionalCriteria.some((_,i)=>!professionalValues[i]);
 const outcome=$('practiceOutcome').value;
 if(missingPractice||missingProfessional){
   note('Completa tutte le voci della valutazione pratica e della professionalità.',true);
   return;
 }
 if(!['idoneo','non_idoneo','da_rivedere'].includes(outcome)){
   note('Seleziona IDONEO, NON IDONEO oppure DA RIVEDERE.',true);
   return;
 }
 if(currentPractice.disc==='mantrailing'&&outcome==='idoneo'){
   const comps=normalizePracticalComponents(currentPractice.components);
   if(comps.length<2||!comps.every(c=>c.status==='superata')){
     note('Per dichiarare IDONEO il Mantrailing devono essere generate e superate entrambe le componenti.',true);
     return;
   }
 }
 const rec=examAdvisoryRecommendation((examArchiveData||[]).find(x=>String(x.id)===String(currentPractice.id))||{},Object.values(practiceValues).reduce((a,v)=>a+Number(v),0),Object.values(professionalValues).reduce((a,v)=>a+Number(v),0),currentPractice.disc,currentPractice.components,true,true);
 if(((outcome==='idoneo'&&rec.code!=='ok')||(outcome==='non_idoneo'&&rec.code==='ok'))&&!$('practiceNotes').value.trim())return note('Motiva nelle osservazioni il giudizio diverso dal consiglio automatico.',true);
 const criteria=practical[currentPractice.disc].map((label,i)=>({label,score:practiceValues[i]}));
 const professional_criteria=professionalCriteria.map((label,i)=>({label,score:professionalValues[i]}));
 const practical_score=criteria.reduce((a,x)=>a+x.score,0);
 const professional_score=professional_criteria.reduce((a,x)=>a+x.score,0);
 const payload={
   assignment_id:currentPractice.id,
   evaluator_id:user.id,
   discipline:currentPractice.disc,
   criteria,
   professional_criteria,
   practical_score,
   professional_score,
   outcome,
   components:normalizePracticalComponents(currentPractice.components),
   notes:$('practiceNotes').value.trim(),
   completed_at:outcome==='da_rivedere'?null:new Date().toISOString()
 };
 const{error}=await sb.from('practical_evaluations').upsert(payload,{onConflict:'assignment_id'});
 if(error)note(error.message,true);else saveNote(outcome==='da_rivedere'?'Salvataggio completato — valutazione salvata come DA RIVEDERE.':'Salvataggio completato — valutazione pratica: '+practicalOutcomeLabel(outcome)+'.');
 if(!error){$('practiceDialog').close();await refreshAll(true);}
};

