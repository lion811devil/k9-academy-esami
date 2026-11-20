async function refreshQuestionBankAfterChange(){
 const jobs=[loadQuestionBank()];
 if(profile?.role==='super_admin')jobs.push(loadSettings());
 await Promise.all(jobs);
}
function qbNorm(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ')}
let qbSelectedDiscipline='',qbOffset=0,qbTotal=0,qbSummary=[],qbRequest=0,qbSearchTimer;
const QB_PAGE_SIZE=50;
function qbApplyDisciplineFilter(value){
 qbSelectedDiscipline=['dogsitter','mantrailing','hrdd','detection'].includes(String(value||''))?String(value):'';
 const select=$('qbDisciplineFilter');
 if(select&&select.value!==qbSelectedDiscipline)select.value=qbSelectedDiscipline;
 if($('qbSearch'))$('qbSearch').value='';
 if($('qbCategoryFilter'))$('qbCategoryFilter').value='';
 if($('qbActiveFilter'))$('qbActiveFilter').value='';
 if($('qbSelectAll'))$('qbSelectAll').checked=false;
 qbOffset=0;qbRefreshCategories();qbLoadPage();
}

function qbFiltered(){return questionBankData;}
function qbParams(offset=qbOffset,limit=QB_PAGE_SIZE){return {p_discipline:qbSelectedDiscipline,p_category:$('qbCategoryFilter')?.value||'',p_active:$('qbActiveFilter')?.value||'',p_search:$('qbSearch')?.value||'',p_validation:$('qbValidationFilter')?.value||'',p_offset:offset,p_limit:limit};}
async function qbLoadSummary(){
 if(!can('question_bank'))return;
 const {data,error}=await sb.rpc('k9_bank_summary');if(error){note(error.message,true);return;}
 qbSummary=data||[];qbRefreshCategories();qbRenderStats();
}
async function qbLoadPage(){
 if(!can('question_bank'))return;
 const request=++qbRequest;const {data,error}=await sb.rpc('k9_bank_page',qbParams());
 if(request!==qbRequest)return;
 if(error)return note(error.message,true);
 qbTotal=Number(data?.total||0);
 if(qbOffset>=qbTotal&&qbOffset>0){qbOffset=Math.max(0,Math.floor((qbTotal-1)/QB_PAGE_SIZE)*QB_PAGE_SIZE);return qbLoadPage();}
 questionBankData=data?.rows||[];renderQuestionBank();
}
async function qbFetchFiltered(){
 const params=qbParams(0,500),all=[];
 while(true){const{data,error}=await sb.rpc('k9_bank_page',{...params,p_offset:all.length});if(error)throw error;const rows=data?.rows||[];all.push(...rows);if(!rows.length||all.length>=Number(data.total))return all;}
}
function qbSelectedIds(){return [...document.querySelectorAll('.qb-check:checked')].map(x=>Number(x.value))}
function qbUpdateSelection(){const n=qbSelectedIds().length;if($('qbSelectionInfo'))$('qbSelectionInfo').textContent=`${n} ${n===1?'domanda selezionata':'domande selezionate'}`}
function qbRefreshCategories(){
 const el=$('qbCategoryFilter');if(!el)return;
 const discipline=qbSelectedDiscipline;
 const keep=el.value;
 const source=discipline?qbSummary.filter(x=>x.discipline===discipline):qbSummary;
 const cats=[...new Set(source.flatMap(x=>x.categories||[]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
 el.innerHTML='<option value="">Tutte</option>'+cats.map(c=>`<option value="${qbEscape(c)}">${qbEscape(c)}</option>`).join('');
 if(cats.includes(keep))el.value=keep;else el.value='';
}
function qbEscape(v){
 return String(v??'')
   .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
   .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function qbCorrectAnswerText(x){
 const opts=[x.option_a,x.option_b,x.option_c,x.option_d];
 const i=Number(x.correct_option);
 return Number.isInteger(i)&&i>=0&&i<4?opts[i]||'—':'—';
}
function qbCorrectLetter(x){
 const i=Number(x.correct_option);
 return Number.isInteger(i)&&i>=0&&i<4?String.fromCharCode(65+i):'—';
}
function qbToggleText(btn){
 const text=btn?.previousElementSibling;
 if(!text)return;
 const expanded=text.classList.toggle('expanded');
 btn.textContent=expanded?'Riduci':'Mostra tutto';
}
window.qbToggleText=qbToggleText;
function qbRefreshTextToggles(){
 document.querySelectorAll('#qbRows .qb-text-toggle').forEach(btn=>{
   const el=btn.previousElementSibling;
   if(!el)return;
   if(!el.classList.contains('expanded')){
     btn.hidden=el.scrollHeight<=el.clientHeight+2;
   }else btn.hidden=false;
 });
}


function qbApplyQuickFilter(kind,value=''){
 if(kind==='all'){
   qbSelectedDiscipline='';
   $('qbDisciplineFilter').value='';
   $('qbActiveFilter').value='';
 }else if(kind==='active'){
   qbSelectedDiscipline='';
   $('qbDisciplineFilter').value='';
   $('qbActiveFilter').value='true';
 }else if(kind==='discipline'){
   qbSelectedDiscipline=value;
   $('qbDisciplineFilter').value=value;
   $('qbActiveFilter').value='';
 }
 if($('qbSearch'))$('qbSearch').value='';
 if($('qbCategoryFilter'))$('qbCategoryFilter').value='';
 if($('qbSelectAll'))$('qbSelectAll').checked=false;
 qbOffset=0;qbRefreshCategories();qbLoadPage();
}
window.qbApplyQuickFilter=qbApplyQuickFilter;

function qbRenderStats(){
 const total=qbSummary.reduce((n,x)=>n+Number(x.total),0);
 const active=qbSummary.reduce((n,x)=>n+Number(x.active),0);
 const by=d=>Number(qbSummary.find(x=>x.discipline===d)?.active||0);
 const selected=qbSelectedDiscipline;
 const activeFilter=$('qbActiveFilter')?.value||'';
 if($('bankStats'))$('bankStats').innerHTML=`
   <button type="button" class="stat-card qb-stat-action ${!selected&&!activeFilter?'selected-filter':''}" onclick="qbApplyQuickFilter('all')"><span>Tutte le domande</span><b>${total}</b><small>Mostra l'intera banca</small></button>
   <button type="button" class="stat-card qb-stat-action ${!selected&&activeFilter==='true'?'selected-filter':''}" onclick="qbApplyQuickFilter('active')"><span>Attive</span><b>${active}</b><small>Mostra solo le domande attive</small></button>
   ${['dogsitter','mantrailing','hrdd','detection'].map(d=>`
     <button type="button" class="stat-card qb-stat-action ${selected===d?'selected-filter':''}" onclick="qbApplyQuickFilter('discipline','${d}')">
       <span>${labels[d]}</span><b>${by(d)}</b><small>attive · apri disciplina</small>
     </button>`).join('')}`;
}
function renderQuestionBank(){
 qbRefreshCategories();qbRenderStats();
 const rows=qbFiltered();
 const discipline=qbSelectedDiscipline;
 const summary=$('qbDisciplineSummary');
 if(summary){
   if(discipline){
     const totalDisc=Number(qbSummary.find(x=>x.discipline===discipline)?.total||0);
     summary.innerHTML=`<b>${labels[discipline]||discipline}</b> · ${qbTotal} risultati su ${totalDisc} · ${rows.length} in pagina · ${Number(qbSummary.find(x=>x.discipline===discipline)?.medium||0)} medie / ${Number(qbSummary.find(x=>x.discipline===discipline)?.hard||0)} difficili attive`;
   }else{
     summary.textContent=`Tutte le discipline · ${qbTotal} risultati · ${rows.length} in pagina`;
   }
 }
 const emptyText=discipline
   ?`<b>Nessuna domanda trovata per ${labels[discipline]||discipline}.</b><br>Controlla Categoria, Stato o Ricerca.`
   :'<b>Nessuna domanda trovata.</b><br>Controlla i filtri oppure premi “Nuova domanda”.';

 $('qbRows').innerHTML=rows.length?rows.map(x=>{
   const answer=qbCorrectAnswerText(x);
   const letter=qbCorrectLetter(x);
   const explanation=x.explanation||'Nessuna spiegazione inserita.';
   return `<tr>
     <td data-label="Selezione"><input type="checkbox" class="qb-check" value="${x.id}" aria-label="Seleziona ${qbEscape(x.code)}" onchange="qbUpdateSelection()"></td>
     <td data-label="Codice">${qbEscape(x.code)}</td>
     <td data-label="Disciplina">${qbEscape(labels[x.discipline]||x.discipline)}</td>
     <td data-label="Domanda">${qbEscape(x.question_text)}</td>
     <td data-label="Risposta corretta" class="qb-answer-cell"><span class="qb-correct-letter">${letter}</span><span class="qb-expand-text">${qbEscape(answer)}</span><button type="button" class="qb-text-toggle" onclick="qbToggleText(this)">Mostra tutto</button></td>
     <td data-label="Spiegazione" class="qb-explanation-cell"><span class="qb-expand-text">${qbEscape(explanation)}</span><button type="button" class="qb-text-toggle" onclick="qbToggleText(this)">Mostra tutto</button></td>
     <td data-label="Categoria">${qbEscape(x.category)}</td>
     <td data-label="Livello"><strong>${x.difficulty==='difficile'?'Difficile':x.difficulty==='medio'?'Media':'Facile · esclusa'}</strong></td>
     <td data-label="Stato"><span class="qb-status ${x.active?'on':'off'}">${x.active?'Attiva':'Disattivata'}</span><br><small>${qbEscape(x.validation_status||'da_verificare')} · v${Number(x.k9_version||1)} · var. ${Number(x.variant_number||1)}</small></td>
     <td data-label="Azioni"><button type="button" class="btn ghost" onclick="qbEdit('${x.id}')">Modifica</button> <button type="button" class="btn ghost" onclick="qbDuplicate('${x.id}')">Crea variante</button></td>
   </tr>`;
 }).join(''):`<tr><td colspan="10"><div class="empty-state">${emptyText}</div></td></tr>`;
 $('qbPageLabel').textContent=qbTotal?`${qbOffset+1}–${qbOffset+rows.length} di ${qbTotal}`:'0 risultati';$('qbPrev').disabled=qbOffset===0;$('qbNext').disabled=qbOffset+rows.length>=qbTotal;$('qbSelectAll').checked=false;
 qbUpdateSelection();
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(qbRefreshTextToggles);
}

async function fetchAllRows(table,select='*',configure=null,pageSize=1000){
 const all=[];
 let from=0;
 while(true){
  let q=sb.from(table).select(select);
  if(typeof configure==='function')q=configure(q);
  const{data,error}=await q.range(from,from+pageSize-1);
  if(error)throw error;
  const page=data||[];
  all.push(...page);
  if(page.length<pageSize)break;
  from+=pageSize;
 }
 return all;
}

async function loadQuestionBank(){
 if(!can('question_bank'))return;
 try{setupQuestionBank();await qbLoadSummary();await qbLoadPage();}catch(error){note(error.message,true)}
}
function qbClear(){['qbId','qbCode','qbCategory','qbConcept','qbSource','qbQuestion','qbA','qbB','qbC','qbD','qbExplanation'].forEach(id=>$(id).value='');$('qbDiscipline').value='dogsitter';$('qbDifficulty').value='medio';$('qbActive').value='true';$('qbValidation').value='da_verificare';$('qbVersionInfo').textContent='';$('qbHistoryList').textContent='';$('qbHistory').classList.add('hidden');$('qbCorrect').value='0';$('qbEditorTitle').textContent='Nuova domanda';$('qbPreviewBox').classList.add('hidden')}
function qbRevealEditor(){
 const editor=$('qbEditor');if(!editor)return;
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>{
   editor.scrollIntoView({behavior:'smooth',block:'start'});
   setTimeout(()=>$('qbQuestion')?.focus({preventScroll:true}),180);
 });
}
window.qbEdit=id=>{const x=questionBankData.find(q=>String(q.id)===String(id));if(!x)return;$('qbId').value=x.id;$('qbCode').value=x.code;$('qbDiscipline').value=x.discipline;$('qbCategory').value=x.category;$('qbDifficulty').value=x.difficulty||'medio';$('qbConcept').value=x.concept_id||'';$('qbSource').value=x.source_reference||'';$('qbActive').value=String(!!x.active);$('qbValidation').value=x.validation_status||'da_verificare';$('qbVersionInfo').textContent=`Versione ${x.k9_version||1} · variante ${x.variant_number||1}`;$('qbHistoryList').textContent='';$('qbHistory').classList.remove('hidden');$('qbQuestion').value=x.question_text;$('qbA').value=x.option_a;$('qbB').value=x.option_b;$('qbC').value=x.option_c;$('qbD').value=x.option_d;$('qbCorrect').value=String(x.correct_option);$('qbExplanation').value=x.explanation||'';$('qbEditorTitle').textContent='Modifica domanda';$('qbEditor').classList.remove('hidden');qbRevealEditor()};
window.qbDuplicate=id=>{qbEdit(id);$('qbId').value='';$('qbCode').value='';$('qbValidation').value='da_verificare';$('qbHistory').classList.add('hidden');$('qbVersionInfo').textContent='Nuova variante: modifica il testo e verifica le alternative.';$('qbEditorTitle').textContent='Crea variante — modifica il testo';qbRevealEditor()};
function qbPayload(){const d=$('qbDiscipline').value;return{code:$('qbCode').value.trim()||`${d.toUpperCase()}-${Date.now()}`,discipline:d,category:$('qbCategory').value.trim(),difficulty:$('qbDifficulty').value,validation_status:$('qbValidation').value,concept_id:$('qbConcept').value.trim()||null,source_reference:$('qbSource').value.trim()||null,question_text:$('qbQuestion').value.trim(),option_a:$('qbA').value.trim(),option_b:$('qbB').value.trim(),option_c:$('qbC').value.trim(),option_d:$('qbD').value.trim(),correct_option:Number($('qbCorrect').value),explanation:$('qbExplanation').value.trim()||null,active:$('qbActive').value==='true',updated_at:new Date().toISOString()}}
async function qbSave(){
 if(!requirePermission('question_bank','Banca domande non abilitata per questo ruolo.'))return;
 const v=qbPayload(),id=$('qbId').value;
 // Le domande facili gia' esistenti restano modificabili ma non vengono estratte dagli esami.
 if(!['facile','medio','difficile'].includes(v.difficulty))return note('Livello di difficolta non valido.',true);
 if(!v.category||!v.question_text||!v.explanation||![v.option_a,v.option_b,v.option_c,v.option_d].every(Boolean))return note('Completa domanda, categoria, spiegazione e quattro risposte.',true);
 if(new Set([v.option_a,v.option_b,v.option_c,v.option_d].map(qbNorm)).size!==4)return note('Le quattro alternative devono essere diverse.',true);
 const btn=$('qbSave');if(btn?.disabled)return;
 if(btn)btn.disabled=true;
 try{
   // Controlla tutte le pagine della disciplina; il vecchio codice controllava solo le 50 visibili.
   const existing=await fetchAllRows('question_bank','id,code,question_text',q=>q.eq('discipline',v.discipline).order('id'),1000);
   const duplicate=existing.find(x=>String(x.id)!==String(id)&&qbNorm(x.question_text)===qbNorm(v.question_text));
   if(duplicate)throw new Error(`Domanda gia presente (${duplicate.code}). Modifica il testo prima di salvare.`);
   const res=id?await sb.from('question_bank').update(v).eq('id',id):await sb.from('question_bank').insert(v);
   if(res.error)throw res.error;
   $('qbEditor').classList.add('hidden');
   saveNote(id?'Salvataggio completato — domanda aggiornata.':'Salvataggio completato — domanda creata.');
   await refreshQuestionBankAfterChange();
 }catch(e){note(e.message||'Salvataggio non riuscito.',true)}finally{if(btn)btn.disabled=false}
}

async function qbDeleteSelected(){if(!requirePermission('question_bank','Banca domande non abilitata per questo ruolo.'))return;const ids=[...document.querySelectorAll('.qb-check:checked')].map(x=>Number(x.value));if(!ids.length)return note('Seleziona almeno una domanda.',true);if(!confirm(`Eliminare definitivamente ${ids.length} domande selezionate? Le domande già usate negli esami non possono essere cancellate; puoi disattivarle.`))return;const{error}=await sb.from('question_bank').delete().in('id',ids);if(error)return note(error.message,true);note('Domande eliminate.');await refreshQuestionBankAfterChange()}
async function qbSetSelectedActive(active){if(!requirePermission('question_bank','Banca domande non abilitata per questo ruolo.'))return;const ids=qbSelectedIds();if(!ids.length)return note('Seleziona almeno una domanda.',true);const{error}=await sb.from('question_bank').update({active,updated_at:new Date().toISOString()}).in('id',ids);if(error)return note(error.message,true);saveNote(`Salvataggio completato — ${ids.length} domande ${active?'attivate':'disattivate'}.`);await refreshQuestionBankAfterChange()}
function qbCsvCell(v){const s=String(v??'');return '"'+s.replace(/"/g,'""')+'"'}
const QB_EXPORT_COLS=['code','discipline','category','difficulty','concept_id','source_reference','question_text','option_a','option_b','option_c','option_d','correct_option','explanation','active','validation_status','variant_number'];
function qbDownloadText(content,name,type='text/plain;charset=utf-8'){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function qbExportCsv(){try{const rows=await qbFetchFiltered();if(!rows.length)return note('Nessuna domanda da esportare.',true);qbDownloadText('\ufeff'+[QB_EXPORT_COLS.join(';'),...rows.map(r=>QB_EXPORT_COLS.map(c=>qbCsvCell(r[c])).join(';'))].join('\n'),'k9-banca-domande.csv','text/csv;charset=utf-8');}catch(e){note(e.message,true)}}
async function qbAudit(){try{const{data,error}=await sb.rpc('k9_bank_audit');if(error)throw error;const rows=data||[];const issues=rows.filter(x=>x.issues?.length);qbDownloadText(JSON.stringify(issues,null,2),'k9-audit-banca.json','application/json');note(`Controllate ${rows.length} domande. ${issues.length} con segnalazioni (comprese varianti e fonti da integrare).`);}catch(e){note(e.message,true)}}
async function qbHistory(){try{const id=$('qbId').value;if(!id)return;const{data,error}=await sb.from('k9_question_versions').select('version,changed_at,snapshot').eq('question_id',id).order('version',{ascending:false});if(error)throw error;$('qbHistoryList').innerHTML=(data||[]).map(x=>`<details><summary>Versione ${Number(x.version)} · ${qbEscape(new Date(x.changed_at).toLocaleString('it-IT'))}</summary><pre style="white-space:pre-wrap">${qbEscape(JSON.stringify(x.snapshot,null,2))}</pre></details>`).join('')||'Nessuna versione precedente.';}catch(e){note(e.message,true)}}
function qbParseCsv(text){const lines=[];let row=[],cell='',q=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(q&&text[i+1]==='"'){cell+='"';i++}else q=!q}else if(ch===';'&&!q){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!q){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))lines.push(row);row=[];cell=''}else cell+=ch}if(q)throw new Error('CSV non valido: virgolette non chiuse.');row.push(cell);if(row.some(v=>v!==''))lines.push(row);return lines}
async function qbImportCsv(file){
 if(!requirePermission('question_bank','Banca domande non abilitata per questo ruolo.'))return;
 try{
  let text=(await file.text()).replace(/^\ufeff/,'');
  if(!/\.csv$/i.test(file.name))throw new Error('Seleziona un file CSV.');
  const matrix=qbParseCsv(text);
  if(matrix.length<2)throw new Error('CSV vuoto o non valido.');
  const headers=matrix[0].map(x=>x.trim());
  const required=['discipline','category','question_text','option_a','option_b','option_c','option_d','correct_option','explanation'];
  if(required.some(x=>!headers.includes(x))||new Set(headers).size!==headers.length)throw new Error('Intestazioni CSV mancanti o duplicate.');
  const validDisc=['dogsitter','mantrailing','hrdd','detection'],payload=[],issues=[];
  const allExisting=await fetchAllRows('question_bank','code,discipline,question_text',q=>q.order('id'));
  const seenTexts=new Set(allExisting.map(x=>`${x.discipline}\n${qbNorm(x.question_text)}`));
  const seenCodes=new Set(allExisting.map(x=>qbNorm(x.code)));
  for(const [i,cells] of matrix.slice(1).entries()){
   const r=Object.fromEntries(headers.map((h,j)=>[h,(cells[j]??'').trim()]));
   const code=r.code||`${r.discipline.toUpperCase()}-${Date.now()}-${i+1}`;
   const textKey=`${r.discipline}\n${qbNorm(r.question_text)}`,codeKey=qbNorm(code);
   const options=[r.option_a,r.option_b,r.option_c,r.option_d];
   let reason='';
   if(cells.length!==headers.length)reason='numero colonne non valido';
   else if(!validDisc.includes(r.discipline)||!r.category||!r.question_text||!r.explanation||!options.every(Boolean))reason='campi obbligatori mancanti o disciplina non valida';
   else if(new Set(options.map(qbNorm)).size!==4)reason='alternative duplicate';
   else if(!/^[0-3]$/.test(r.correct_option))reason='risposta corretta: atteso 0, 1, 2 o 3';
   else if(r.difficulty&&!['medio','difficile'].includes(r.difficulty))reason='livello non valido: usare medio o difficile';
   else if(r.validation_status&&!['da_verificare','bozza','approvata'].includes(r.validation_status))reason='validazione non valida';
   else if(r.variant_number&&!/^[1-9][0-9]*$/.test(r.variant_number))reason='numero variante non valido';
   else if(r.active&&!['true','false'].includes(r.active.toLowerCase()))reason='stato non valido';
   else if(seenTexts.has(textKey)||seenCodes.has(codeKey))reason='duplicato (codice o testo)';
   if(reason){issues.push(`Riga ${i+2}: ${reason}`);continue;}
   seenTexts.add(textKey);seenCodes.add(codeKey);
   payload.push({code,discipline:r.discipline,category:r.category,difficulty:r.difficulty||'medio',validation_status:r.validation_status||'da_verificare',variant_number:r.variant_number?Number(r.variant_number):null,concept_id:r.concept_id||null,source_reference:r.source_reference||null,question_text:r.question_text,option_a:r.option_a,option_b:r.option_b,option_c:r.option_c,option_d:r.option_d,correct_option:Number(r.correct_option),explanation:r.explanation,active:r.active?.toLowerCase()!=='false'});
  }
  if(issues.length){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([issues.join('\n')],{type:'text/plain;charset=utf-8'}));a.href=url;a.download='k9-anomalie-importazione.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if(!payload.length)throw new Error(`Nessuna domanda valida. Anomalie: ${issues.length}.`);
  if(!confirm(`Importare ${payload.length} domande valide? Righe escluse: ${issues.length}. ${issues.length?'Consulta il report scaricato.':''}`))return;
  const{error}=await sb.from('question_bank').insert(payload);if(error)throw error;
  saveNote(`Importazione completata: ${payload.length} domande; ${issues.length} righe escluse.`);await refreshQuestionBankAfterChange();
 }catch(e){note(e.message||'Errore importazione CSV.',true)}finally{if($('qbImportCsv'))$('qbImportCsv').value=''}
}

function qbPreview(){const x=qbPayload(),box=$('qbPreviewBox');box.classList.remove('hidden');box.innerHTML=`<b>${qbEscape(x.question_text||'Domanda')}</b>${[x.option_a,x.option_b,x.option_c,x.option_d].map((o,i)=>`<div class="qb-preview-option ${i===x.correct_option?'correct':''}">${String.fromCharCode(65+i)}. ${qbEscape(o||'Risposta')}</div>`).join('')}${x.explanation?`<p>${qbEscape(x.explanation)}</p>`:''}`}
function setupQuestionBank(){
 ['qbSearch','qbCategoryFilter','qbActiveFilter','qbValidationFilter'].forEach(id=>{
   const e=$(id);
   if(e&&e.dataset.qb!=='1'){
     e.dataset.qb='1';
     e.addEventListener(id==='qbSearch'?'input':'change',()=>{clearTimeout(qbSearchTimer);qbOffset=0;qbSearchTimer=setTimeout(qbLoadPage,id==='qbSearch'?280:0);});
   }
 });
 const discipline=$('qbDisciplineFilter');
 $('qbNew').onclick=()=>{qbClear();if(qbSelectedDiscipline)$('qbDiscipline').value=qbSelectedDiscipline;$('qbEditor').classList.remove('hidden');qbRevealEditor()};
 $('qbSave').onclick=qbSave;
 $('qbPreview').onclick=qbPreview;
 $('qbCancel').onclick=()=>$('qbEditor').classList.add('hidden');
 $('qbDeleteSelected').onclick=qbDeleteSelected;
 $('qbEnableSelected').onclick=()=>qbSetSelectedActive(true);
 $('qbDisableSelected').onclick=()=>qbSetSelectedActive(false);
 $('qbExportCsv').onclick=qbExportCsv;$('qbAudit').onclick=qbAudit;$('qbHistory').onclick=qbHistory;
 $('qbPrev').onclick=()=>{qbOffset=Math.max(0,qbOffset-QB_PAGE_SIZE);qbLoadPage()};$('qbNext').onclick=()=>{qbOffset+=QB_PAGE_SIZE;qbLoadPage()};
 $('qbImportCsv').onchange=e=>{const f=e.target.files?.[0];if(f)qbImportCsv(f)};
 $('qbResetFilters').onclick=()=>{
   $('qbSearch').value='';$('qbDisciplineFilter').value='';$('qbCategoryFilter').value='';$('qbActiveFilter').value='';$('qbValidationFilter').value='';
   qbSelectedDiscipline='';qbOffset=0;
   if($('qbSelectAll'))$('qbSelectAll').checked=false;
   qbRefreshCategories();qbLoadPage();
 };
 $('qbSelectAll').onchange=e=>{document.querySelectorAll('.qb-check').forEach(x=>x.checked=e.target.checked);qbUpdateSelection()};
 qbUpdateSelection();
}
function activeQuestionCount(d){return Number(qbSummary.find(x=>x.discipline===d)?.active||0)}
function availableQuestionFamilies(d){return Number(qbSummary.find(x=>x.discipline===d)?.families||0)}
function validateQuestionAvailability(d,n){const a=availableQuestionFamilies(d),need=Number(n);if(qbSummary.length&&a<need){note(`Esame ${labels[d]}: ${need} domande richieste ma solo ${a} concetti distinti. Non è corretto ripetere varianti dello stesso quesito. Riduci la prova o amplia la banca.`,true);return false}return true}
async function loadSettings(){
const [{data},{data:stats,error:statsError}]=await Promise.all([
 sb.from('exam_settings').select('*').order('discipline'),
 sb.from('question_bank_stats').select('*').order('discipline')
]);
if(statsError)return note(statsError.message,true);examSettingsCache=Object.fromEntries((data||[]).map(x=>[x.discipline,x]));
const statMap=Object.fromEntries((stats||[]).map(x=>[x.discipline,x]));
$('settings').innerHTML=(data||[]).map(x=>`<div class="card" data-disc="${x.discipline}"><h3>${labels[x.discipline]}</h3><div class="grid"><label>Domande<select class="qc">${questionValues.map(v=>`<option value="${v}" ${v===Number(x.question_count)?'selected':''}>${v}</option>`).join('')}</select></label><label>Minuti<select class="dm">${timerValues.map(v=>`<option value="${v}" ${v===Number(x.duration_minutes)?'selected':''}>${v}</option>`).join('')}</select></label><label>Soglia %<select class="pp">${passValues.map(v=>`<option value="${v}" ${v===Number(x.pass_percentage)?'selected':''}>${v}%</option>`).join('')}</select></label><label>Banca domande<input value="${statMap[x.discipline]?.active_questions||0}" readonly></label></div></div>`).join('');

if($('assignDiscipline')?.value)applySyncedExamConfig($('assignDiscipline').value)}

const PROFILE_PHOTO_BUCKET='profile-photos';
const profilePhotoUrlCache=new Map();
let profilePhotoTarget=null;
let profilePhotoPendingBlob=null;
let profilePhotoPendingObjectUrl='';

function profileInitials(name){
 const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
 return (parts.slice(0,2).map(x=>x[0]||'').join('')||'U').toUpperCase();
}
