

window.addEventListener('error',e=>{
  console.error('Errore applicazione:',e.error||e.message);
});
window.addEventListener('unhandledrejection',e=>{
  console.error('Errore asincrono applicazione:',e.reason);
});
let sb,user,profile,assignment,exam,tick,currentPractice=null,practiceValues={},professionalValues={},appSettings={},rolePermissions={},allRolePermissions={},currentQuestionIndex=0,examArchiveData=[],documentArchiveData=[],documentArchiveLoadPromise=null,documentArchiveLastOk=0,currentResultExam=null,analyticsLastUpdated=null,questionBankData=[];
let examSettingsCache={},autoRefreshTimer=null,lastSessionCreatedId=null;
const K9_LEGACY_AUTO_RETRY_MAX=3;
let autoRetryUsed=0,autoRetryPositions=new Set(),autoRetryDeclinedPositions=new Set(),currentRetryPosition=null;
const $=id=>document.getElementById(id);const questionValues=[5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100];
const timerValues=[5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100,105,110,115,120];
const passValues=[50,55,60,65,70,75,80,85,90,95,100];
const labels={dogsitter:'Dogsitter',mantrailing:'Mantrailing',hrdd:'HRDD',detection:'Detection'};const mantrailingComponents=["INTENSITY","EXTENDED","INTENSITY SCENT","DELAYED START","BODY SCENT","FENCE CROSSING","NEGATIVO","CHECK","CASTING","DOOR ID","CAR ID / VEHICLE ID","ID ELEVATO","VEHICLE SCENT","VEHICLE PICKUP","INPUT CONTAMINATO","LINE UP","ID FIGURANTE IN ACQUA","ID INGRESSO IN ACQUA","CONDOTTA PASSIVA","PARTENZA DA VEICOLO CON DISCRIMINAZIONE","ID MOVIMENTO","VIA DI FUGA CONOSCIUTA","STAFFETTA","FLIP","SPLIT","BACK TRACK","WALK TRACK","PAUSA"];
const practical={dogsitter:['Approccio e sicurezza','Gestione passeggiata','Lettura del cane','Benessere','Gestione imprevisti','Comunicazione cliente','Attrezzature','Gestione domestica','Rientro e controllo','Autonomia'],mantrailing:['Preparazione operativa e materiale','Sicurezza e valutazione area','Rituale pre-partenza','Vestizione del cane e gestione longhina','Gestione input olfattivo: Pre-Scent / Scent','Comando e gestione della partenza','Lettura del cane e conduzione sul trail','Gestione della componente / prova tecnica assegnata','Ritrovamento e segnalazione','Premiazione, svestizione e chiusura / debriefing'],hrdd:['Preparazione area','Biosicurezza e DPI','Controllo contaminazione','Strategia di ricerca','Lettura del cane','Segnalazione finale','Gestione blank','Documentazione','Sicurezza operativa','Debriefing'],detection:['Preparazione target','Controllo contaminazione','Strategia di ricerca','Conduzione','Lettura del cane','Discriminazione','Segnalazione','Gestione rinforzo','Gestione blank','Debriefing']};const professionalCriteria=['Puntualità e organizzazione','Affidabilità e responsabilità','Comunicazione e rispetto','Autonomia e capacità decisionale'];
let k9ToastTimer=null;
function showGlobalMessage(message,isError=false,title=''){
 const toast=$('k9SaveToast'),text=$('k9SaveToastText'),head=$('k9SaveToastTitle'),icon=$('k9SaveToastIcon');
 if(!toast||!message)return;
 clearTimeout(k9ToastTimer);
 toast.classList.toggle('error',!!isError);
 if(head)head.textContent=title||(isError?'Operazione non riuscita':'Operazione completata');
 if(text)text.textContent=String(message);
 if(icon)icon.textContent=isError?'!':'✓';
 toast.classList.add('show');
 k9ToastTimer=setTimeout(()=>toast.classList.remove('show'),3200);
}
function note(t,b=false){
 const notice=$('notice');
 if(notice){
   notice.textContent=t||'';
   notice.className=b?'status err':'status ok';
   notice.classList.toggle('hidden',!t);
 }
 if(t)showGlobalMessage(t,!!b);
}
function saveNote(message='Salvataggio completato.'){
 note(message,false);
}
function isUuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''))}
function setInvalid(el,invalid){if(el)el.classList.toggle('field-error',!!invalid)}
function positiveInt(value,min,max){const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:null}
function setSelectState(select,button,hasItems,emptyText){if(!select)return;select.disabled=!hasItems;if(button)button.disabled=!hasItems;if(!hasItems)select.innerHTML=`<option value="">${emptyText}</option>`}function validPublicConfig(c){
 return !!c&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(c.url||''))&&String(c.key||'').length>20;
}
const K9_CANDIDATE_BROWSER_MODE=window.K9_CANDIDATE_BROWSER_MODE===true;
function createK9SupabaseClient(url,key){
 const options=K9_CANDIDATE_BROWSER_MODE
   ? {auth:{storage:window.sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}
   : undefined;
 return options?supabase.createClient(url,key,options):supabase.createClient(url,key);
}
function candidateAccessUrl(){
 const u=new URL(location.href);
 u.search='';
 u.hash='';
 u.searchParams.set('corsista','1');
 return u.toString();
}
async function fetchRepositoryConfig(){
 try{
  const r=await fetch('./supabase-config.json?v=220',{cache:'no-store'});
  if(!r.ok)return null;
  const c=await r.json();
  return validPublicConfig(c)?{url:String(c.url).trim(),key:String(c.key).trim()}:null;
 }catch(_){return null}
}
async function ensureSupabase(){
 if(sb)return true;
 const c=await fetchRepositoryConfig();
 if(!validPublicConfig(c))return false;
 try{localStorage.removeItem('k9_url');localStorage.removeItem('k9_key')}catch(_){}
 sb=createK9SupabaseClient(c.url,c.key);return true;
}
function normalizeSessionUsername(v){return v.trim().toLowerCase().replace(/[^a-z0-9_-]/g,'')}
async function sha256Hex(v){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function showLoginMode(m){const s=m==='student';$('studentLoginBox').classList.toggle('hidden',!s);$('staffLoginBox').classList.toggle('hidden',s);$('studentLoginTab').className='btn '+(s?'primary':'ghost');$('staffLoginTab').className='btn '+(s?'ghost':'primary')}
function nowStamp(){return new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}
function disciplineCode(d){return({dogsitter:'DS',mantrailing:'MT',hrdd:'HRDD',detection:'DET'}[d]||'K9')}
function dateCode(){const d=new Date();return String(d.getFullYear()).slice(-2)+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')}
function makePassword(len=10){const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';const a=new Uint32Array(len);crypto.getRandomValues(a);return [...a].map(n=>chars[n%chars.length]).join('')}
function makeCandidateCode(){const a=new Uint32Array(1);crypto.getRandomValues(a);return `K9-${dateCode()}-${String(a[0]%10000).padStart(4,'0')}`}
let examSyncLock=false,examSyncSaveTimers={};

async function loadExamSettingsCache(){
 if(!sb)return;
 const{data,error}=await sb.from('exam_settings').select('discipline,question_count,duration_minutes,pass_percentage');
 if(!error)examSettingsCache=Object.fromEntries((data||[]).map(x=>[x.discipline,{
   discipline:x.discipline,
   question_count:Number(x.question_count),
   duration_minutes:Number(x.duration_minutes),
   pass_percentage:Number(x.pass_percentage)
 }]));
}

function configForDiscipline(d){
 return examSettingsCache[d]||{discipline:d,question_count:40,duration_minutes:45,pass_percentage:60};
}

function setSelectValue(id,value){
 const el=$(id);if(!el)return;
 const wanted=String(value);
 if([...el.options].some(o=>o.value===wanted))el.value=wanted;
}

function updateSettingsCard(d,key,value){
 const card=document.querySelector(`#settings [data-disc="${d}"]`);
 if(!card)return;
 const cls={question_count:'.qc',duration_minutes:'.dm',pass_percentage:'.pp'}[key];
 const el=cls?card.querySelector(cls):null;
 if(el&&String(el.value)!==String(value))el.value=String(value);
}

function applySyncedExamConfig(d){
 const x=configForDiscipline(d);
 examSyncLock=true;
 setSelectValue('assignDiscipline',d);
 setSelectValue('sessionDiscipline',d);
 setSelectValue('assignQuestions',x.question_count);
 setSelectValue('sessionQuestions',x.question_count);
 setSelectValue('assignDuration',x.duration_minutes);
 setSelectValue('sessionDuration',x.duration_minutes);
 setSelectValue('assignPass',x.pass_percentage);
 setSelectValue('sessionPass',x.pass_percentage);
 updateSettingsCard(d,'question_count',x.question_count);
 updateSettingsCard(d,'duration_minutes',x.duration_minutes);
 updateSettingsCard(d,'pass_percentage',x.pass_percentage);
 examSyncLock=false;
 generateSessionIdentity(true);
}

function applyExamDefaults(d,target='assign'){
 const x=configForDiscipline(d);
 examSyncLock=true;
 if(target==='assign'){
   setSelectValue('assignQuestions',x.question_count);
   setSelectValue('assignDuration',x.duration_minutes);
   setSelectValue('assignPass',x.pass_percentage);
 }else{
   setSelectValue('sessionQuestions',x.question_count);
   setSelectValue('sessionDuration',x.duration_minutes);
   setSelectValue('sessionPass',x.pass_percentage);
 }
 examSyncLock=false;
}

async function persistExamConfig(d){
 if(profile?.role!=='super_admin'||!sb)return;
 const x=configForDiscipline(d);
 const{error}=await sb.from('exam_settings').update({
   question_count:Number(x.question_count),
   duration_minutes:Number(x.duration_minutes),
   pass_percentage:Number(x.pass_percentage),
   updated_by:user.id,
   updated_at:new Date().toISOString()
 }).eq('discipline',d);
 if(error)note('Sincronizzazione impostazioni non riuscita: '+error.message,true);
}

function scheduleExamConfigSave(d){
 if(profile?.role!=='super_admin')return;
 clearTimeout(examSyncSaveTimers[d]);
 examSyncSaveTimers[d]=setTimeout(()=>persistExamConfig(d),450);
}

function syncExamConfig(d,key,value,source=''){
 if(examSyncLock||!d)return;
 const numeric=Number(value);
 if(!Number.isFinite(numeric))return;
 const x=configForDiscipline(d);
 x[key]=numeric;
 examSettingsCache[d]=x;

 examSyncLock=true;
 if(key==='question_count'){
   setSelectValue('assignQuestions',numeric);setSelectValue('sessionQuestions',numeric);
 }else if(key==='duration_minutes'){
   setSelectValue('assignDuration',numeric);setSelectValue('sessionDuration',numeric);
 }else if(key==='pass_percentage'){
   setSelectValue('assignPass',numeric);setSelectValue('sessionPass',numeric);
 }
 updateSettingsCard(d,key,numeric);
 examSyncLock=false;

 scheduleExamConfigSave(d);
}

function syncDiscipline(d,source=''){
 if(examSyncLock||!d)return;
 applySyncedExamConfig(d);
}
function generateSessionIdentity(force=false){const d=$('sessionDiscipline')?.value;if(!d)return;const title=$('sessionTitle'),usern=$('commonUsername');const today=new Date().toLocaleDateString('it-IT');if(force||!title.value||title.dataset.auto==='1'){title.value=`${labels[d]} — ${today}`;title.dataset.auto='1';title.classList.add('auto-generated')}if(force||!usern.value||usern.dataset.auto==='1'){usern.value=`${disciplineCode(d)}-${dateCode()}`;usern.dataset.auto='1';usern.classList.add('auto-generated')}}
function prepareCandidateCredentials(force=false){const code=$('candidateCode'),pass=$('newCandidatePassword');if(force||!code.value){code.value=makeCandidateCode();code.classList.add('auto-generated')}if(force||!pass.value){pass.value=makePassword();pass.classList.add('auto-generated')}}


function firstUsableOption(select){
 return [...select.options].find(o=>!o.disabled&&o.value!=='')||[...select.options].find(o=>!o.disabled)||null;
}
function ensureControlPrefilled(control){
 if(control.disabled||control.readOnly)return;

 if(control.tagName==='SELECT'){
   const current=control.options[control.selectedIndex];
   // Un'opzione selezionata con value="" può essere intenzionale:
   // "Non assegnato", "Tutte", "Seleziona..." ecc. Non va mai sostituita automaticamente.
   if(current&&!current.disabled)return;
   const first=firstUsableOption(control);
   if(first){
     control.value=first.value;
     // Aggiornamento solo visivo: nessun change sintetico, per evitare salvataggi involontari.
   }
   return;
 }

 if(control.tagName!=='INPUT'&&control.tagName!=='TEXTAREA')return;
 const id=control.id||'';

 // Valori standard modificabili.
 const defaults={
   assignQuestions:'40',assignDuration:'45',assignPass:'60',
   sessionQuestions:'40',sessionDuration:'45',sessionPass:'60',
   settingsQuestionCount:'40',settingsDuration:'45',settingsPass:'60'
 };
 if((control.value??'').trim()===''&&defaults[id]!==undefined){
   control.value=defaults[id];
   control.dispatchEvent(new Event('input',{bubbles:true}));
   control.dispatchEvent(new Event('change',{bubbles:true}));
 }
}



function markSyncedControls(){
 ['assignQuestions','assignDuration','assignPass','sessionQuestions','sessionDuration','sessionPass'].forEach(id=>{
   $(id)?.closest('label')?.classList.add('sync-linked');
 });
 document.querySelectorAll('#settings [data-disc] label').forEach(label=>{
   if(label.querySelector('.qc,.dm,.pp'))label.classList.add('sync-linked');
 });
}
function makeControlsReady(){
 markSyncedControls();
 document.querySelectorAll('input,select,textarea').forEach(control=>{
   ensureControlPrefilled(control);
   if(control.dataset.readyControl==='1')return;
   control.dataset.readyControl='1';

   // Toccando un input numerico/testuale, seleziona tutto il valore già presente:
   // basta digitare per sostituirlo.
   if(control.tagName==='INPUT'&&!['checkbox','radio','color','file','date','time'].includes(control.type)){
     control.addEventListener('focus',()=>{
       if(control.value)requestAnimationFrame(()=>{try{control.select()}catch{}});
     });
     control.addEventListener('click',()=>{
       if(control.value)requestAnimationFrame(()=>{try{control.select()}catch{}});
     });
   }

   // Ogni select mantiene sempre una scelta valida quando esistono opzioni disponibili.
   if(control.tagName==='SELECT'){
     control.addEventListener('focus',()=>ensureControlPrefilled(control));
     control.addEventListener('change',()=>ensureControlPrefilled(control));
   }
 });
}


function enableClickableSelectableUI(){
 makeControlsReady();
 document.querySelectorAll('.stat-card,.preview-box,#bankStats>.card,#settings>.card').forEach(card=>{card.classList.add('click-select');if(card.dataset.selectReady==='1')return;card.dataset.selectReady='1';card.tabIndex=0;const select=()=>{card.parentElement?.querySelectorAll('.selected-card').forEach(x=>x.classList.remove('selected-card'));card.classList.add('selected-card')};card.addEventListener('click',e=>{if(!e.target.closest('button,input,select,textarea,a'))select()});card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select()}})});
 document.querySelectorAll('label').forEach(label=>{if(label.dataset.clickReady==='1')return;label.dataset.clickReady='1';label.addEventListener('click',e=>{if(e.target.matches('input,select,textarea,button'))return;const control=label.querySelector('input,select,textarea');if(control&&!control.disabled)control.focus()})});
}

/* RELEASE 1.23 — Persistenza anti-perdita */
const K9_DRAFT_KEY='k9_academy_ui_draft_v123',K9_PAGE_KEY='k9_academy_current_page_v123',K9_EXAM_POS_KEY='k9_academy_exam_position_v123';
// V2: moduli amministrativi non persistono dati personali nel browser.
function restoreUiDraft(){try{localStorage.removeItem(K9_DRAFT_KEY)}catch(_){}}
function clearUiDraftFields(){restoreUiDraft()}
restoreUiDraft();
function clearPrivateLocalState(){try{for(const k of Object.keys(localStorage)){if(k===K9_DRAFT_KEY||k===K9_PAGE_KEY||k===K9_EXAM_POS_KEY||k.startsWith('k9_exam_retry_declined_'))localStorage.removeItem(k)}}catch(_){}}
async function logoutSafely(){clearInterval(tick);clearInterval(autoRefreshTimer);clearPrivateLocalState();try{if(sb)await sb.auth.signOut({scope:'local'})}finally{location.reload()}}


function pageSlug(value){
 return String(value||'pagina').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
let currentPageId='';
function consolidateExamWorkflowLayout(){
 if(document.body.dataset.workflowConsolidated==='1')return;
 document.body.dataset.workflowConsolidated='1';
 const embed=(sourceId,targetId,title,subtitle,permission)=>{
   const source=$(sourceId),target=$(targetId);if(!source||!target)return;
   const direct=source.querySelector('h2');if(direct)direct.remove();
   const wrap=document.createElement('section');wrap.className='workflow-embedded-section';
   // Mantieni l'ID del contenitore: CSS mobile e collegamenti restano validi dopo lo spostamento.
   wrap.id=sourceId;
   if(permission)wrap.dataset.embeddedPermission=permission;
   const head=document.createElement('div');head.className='workflow-section-head';
   head.innerHTML=`<div><h3>${title}</h3>${subtitle?`<p>${subtitle}</p>`:''}</div>`;
   wrap.appendChild(head);
   while(source.firstChild)wrap.appendChild(source.firstChild);
   target.appendChild(wrap);source.remove();
 };
 embed('sessionListCard','sessionCreateCard','Corsi preparati','Gestisci, archivia o elimina i corsi già creati senza uscire dalla preparazione.','sessions_manage');
 embed('examArchiveCard','examManagementCard','Storico esami','Consulta le prove concluse e i relativi esiti nello stesso ambiente di valutazione.','exam_history');
 embed('documentArchiveCard','documentsCard','Archivio documenti','Consulta verbali, report dettagliati e attestati già generati.','document_archive');
 const flow=$('examFlowCard'),dash=$('dashboardCard');
 if(flow){
   if(profile?.role==='super_admin'&&dash){
     flow.querySelectorAll('[data-flow-target="documentArchiveCard"]').forEach(b=>b.dataset.flowTarget='documentsCard');
     const box=document.createElement('div');box.className='dashboard-workflow-overview';
     while(flow.firstChild)box.appendChild(flow.firstChild);
     dash.insertBefore(box,dash.firstChild);
   }
   flow.remove();
 }
 const examTitle=$('examManagementCard')?.querySelector(':scope > h2');if(examTitle)examTitle.textContent='Esami e valutazioni';
 const docsTitle=$('documentsCard')?.querySelector(':scope > h2');if(docsTitle)docsTitle.textContent='Documenti e archivio';
}
function buildSidePages(){
 consolidateExamWorkflowLayout();
 const staff=$('staffPanel'),admin=$('adminPanel');
 if(!staff||staff.dataset.pages==='1')return;

 const workspace=document.createElement('div');workspace.id='topWorkspace';workspace.className='top-workspace hidden';
 const navWrap=document.createElement('div');navWrap.className='top-page-nav-wrap';
 navWrap.innerHTML=`
   <div class="practical-page-bar">
     <button type="button" class="practical-nav-btn practical-menu-btn" id="pageMenuBtn">☰ Sezioni</button>
     <div class="practical-page-title" id="currentPageLabel">Dashboard</div>
     <button type="button" class="practical-nav-btn sequence-nav-btn" id="pagePrevBtn" aria-label="Pagina precedente">← Precedente</button>
     <button type="button" class="practical-nav-btn sequence-nav-btn" id="pageNextBtn" aria-label="Pagina successiva">Successiva →</button>
   </div>
   <nav id="topPageNav" class="top-page-nav" aria-hidden="true"></nav>`;
 const nav=navWrap.querySelector('#topPageNav');
 const content=document.createElement('div');content.id='topWorkspaceContent';content.className='top-workspace-content';
 const menu=document.createElement('div');menu.id='pageMenuOverlay';menu.className='page-menu-overlay';
 menu.innerHTML=`<div class="page-menu-sheet" role="dialog" aria-modal="true" aria-label="Sezioni applicazione">
   <div class="page-menu-head"><h3>Vai a…</h3><span class="spacer"></span><button type="button" class="page-menu-close" id="pageMenuClose" aria-label="Chiudi">×</button></div>
   <div id="pageMenuContent"></div>
 </div>`;
 const quick=document.createElement('nav');quick.id='mobileQuickNav';quick.className='mobile-quick-nav';quick.setAttribute('aria-label','Accessi rapidi');

 staff.parentNode.insertBefore(workspace,staff);
 workspace.appendChild(navWrap);workspace.appendChild(content);
 document.body.appendChild(menu);document.body.appendChild(quick);
 $('pageMenuBtn').onclick=()=>menu.classList.add('open');
 $('pageMenuClose').onclick=()=>menu.classList.remove('open');
 menu.onclick=e=>{if(e.target===menu)menu.classList.remove('open')};
 $('pagePrevBtn').onclick=()=>navigateRelative(-1);
 $('pageNextBtn').onclick=()=>navigateRelative(1);
 document.querySelectorAll('[data-flow-target]').forEach(btn=>btn.onclick=()=>{const card=$(btn.dataset.flowTarget);if(card?.dataset?.pageId)showAppPage(card.dataset.pageId)});
 content.appendChild(staff);content.appendChild(admin);

 const PAGE_TITLES={
   roleHomeCard:'Area personale',
   dashboardCard:'Dashboard',
   assignExamCard:'Assegna prova singola',
   examManagementCard:'Esami e valutazioni',
   examArchiveCard:'Storico esami',
   analyticsCard:'Statistiche',
   documentsCard:'Documenti e archivio',
   documentArchiveCard:'Archivio documenti',
   bankAdminCard:'Banca domande',
   sessionCreateCard:'Corsi',
   candidateCreateCard:'Corsisti',
   sessionListCard:'Corsi preparati',
   userCreateCard:'Crea utente',
   userManagementCard:'Gestione utenti',
   rolePermissionsCard:'Ruoli e permessi',
   settingsCard:'Impostazioni'
 };
 const makePages=(panel,groupLabel)=>{
   [...panel.children].filter(el=>el.classList?.contains('card')).forEach((card,index)=>{
     let title=PAGE_TITLES[card.id]||'';
     if(!title){
       const h=card.querySelector('h2');
       title=h?.textContent?.trim()||'Sezione';
     }
     const directH=card.querySelector(':scope > h2');
     if(directH)directH.remove();
     const id='page-'+pageSlug(groupLabel+'-'+title);
     card.id=card.id||id;card.dataset.pageId=id;card.dataset.pageTitle=title;card.dataset.pageGroup=groupLabel;card.classList.add('app-page');
     const heading=document.createElement('div');heading.className='page-heading';
     heading.innerHTML=`<h2>${title}</h2><span class="page-role-badge role-page-badge">${groupLabel}</span>`;
     card.insertBefore(heading,card.firstChild);
   });
 };
 makePages(staff,'Operativo');makePages(admin,'Amministrazione');
 staff.dataset.pages='1';admin.dataset.pages='1';
 enableClickableSelectableUI();refreshSideNavigation();
}

const ROLE_PERMISSION_DEFS=[
 {key:'dashboard',group:'Panoramica',label:'Dashboard',help:'Visualizza i principali indicatori della piattaforma.'},
 {key:'students_view',group:'Corsisti ed esami',label:'Visualizza corsisti',help:'Carica e utilizza l’elenco dei corsisti.'},
 {key:'assign_exam',group:'Corsisti ed esami',label:'Assegna esami',help:'Assegna una prova teorica a un corsista.'},
 {key:'exam_management',group:'Corsisti ed esami',label:'Esami e valutazioni',help:'Visualizza le schede degli esami accessibili al ruolo.'},
 {key:'practice_evaluation',group:'Corsisti ed esami',label:'Valutazione pratica',help:'Compila e modifica pratica, professionalità ed esito.'},
 {key:'assign_evaluator',group:'Corsisti ed esami',label:'Assegna valutatore',help:'Assegna o modifica l’esaminatore di una prova.'},
 {key:'exam_history',group:'Consultazione',label:'Storico esami',help:'Consulta lo storico delle prove accessibili.'},
 {key:'analytics',group:'Consultazione',label:'Statistiche',help:'Visualizza statistiche e riepiloghi.'},
 {key:'documents_view',group:'Documenti',label:'Documenti esami',help:'Accede alla sezione documenti.'},
 {key:'generate_report',group:'Documenti',label:'Genera verbale',help:'Genera e registra il verbale individuale.'},
 {key:'generate_certificate',group:'Documenti',label:'Genera attestato',help:'Genera e registra l’attestato individuale.'},
 {key:'verify_documents',group:'Documenti',label:'Verifica documenti',help:'Verifica un codice ATT/VER registrato.'},
 {key:'document_archive',group:'Documenti',label:'Archivio documenti',help:'Consulta l’archivio documentale.'},
 {key:'question_bank',group:'Amministrazione operativa',label:'Banca domande',help:'Consulta e gestisce domande e risposte.'},
 {key:'sessions_manage',group:'Percorso esame',label:'Prepara Corso',help:'Crea corsi, configura la prova e inserisce i Corsisti.'},
 {key:'candidates_create',group:'Amministrazione operativa',label:'Prepara Corsista',help:'Crea anagrafica e credenziali personali prima del corso.'},
 {key:'users_create',group:'Amministrazione operativa',label:'Crea utenti staff',help:'Crea Docenti, Esaminatori e Vice nei limiti del ruolo.'}
];
const ROLE_PERMISSION_DEFAULTS={
 vice_admin:{
  dashboard:true,students_view:true,assign_exam:true,exam_management:true,practice_evaluation:true,assign_evaluator:true,
  exam_history:true,analytics:true,documents_view:true,generate_report:true,generate_certificate:true,verify_documents:true,
  document_archive:true,question_bank:false,sessions_manage:true,candidates_create:true,users_create:true
 },
 teacher:{
  dashboard:true,students_view:true,assign_exam:true,exam_management:true,practice_evaluation:true,assign_evaluator:false,
  exam_history:true,analytics:false,documents_view:true,generate_report:true,generate_certificate:false,verify_documents:true,
  document_archive:false,question_bank:false,sessions_manage:false,candidates_create:false,users_create:false
 },
 examiner:{
  dashboard:false,students_view:false,assign_exam:false,exam_management:true,practice_evaluation:true,assign_evaluator:false,
  exam_history:false,analytics:false,documents_view:false,generate_report:true,generate_certificate:false,verify_documents:false,
  document_archive:false,question_bank:false,sessions_manage:false,candidates_create:false,users_create:false
 }
};
const ROLE_PERMISSION_DEPENDENCIES={
 practice_evaluation:['exam_management'],
 assign_evaluator:['exam_management'],
 verify_documents:['documents_view'],
 assign_exam:['students_view']
};
function permissionObject(value,role=profile?.role){
 return {...(ROLE_PERMISSION_DEFAULTS[role]||{}),...(value&&typeof value==='object'?value:{})};
}
function normalizePermissionDependencies(values){
 const out={...values};
 let changed=true;
 while(changed){
  changed=false;
  for(const[key,deps]of Object.entries(ROLE_PERMISSION_DEPENDENCIES)){
   if(out[key])for(const dep of deps)if(!out[dep]){out[dep]=true;changed=true}
  }
 }
 return out;
}
function dependentPermissionsOf(key){
 return Object.entries(ROLE_PERMISSION_DEPENDENCIES).filter(([,deps])=>deps.includes(key)).map(([k])=>k);
}
function can(permission){
 if(profile?.role==='super_admin')return true;
 if(profile?.role==='student')return false;
 return rolePermissions?.[permission]===true;
}
function requirePermission(permission,message='Funzione non abilitata per questo ruolo.'){
 if(can(permission))return true;
 note(message,true);return false;
}
async function loadMyRolePermissions(){
 if(!profile||profile.role==='student'){rolePermissions={};return rolePermissions}
 if(profile.role==='super_admin'){
   rolePermissions=Object.fromEntries(ROLE_PERMISSION_DEFS.map(x=>[x.key,true]));
   return rolePermissions;
 }
 const{data,error}=await sb.rpc('get_my_role_permissions');
 if(error){
   console.error('Permessi ruolo:',error);
   rolePermissions=Object.fromEntries(ROLE_PERMISSION_DEFS.map(x=>[x.key,false]));
   note('Impossibile caricare i permessi del ruolo. Accesso operativo bloccato per sicurezza.',true);
 }else rolePermissions=normalizePermissionDependencies(permissionObject(data||{},profile.role));
 return rolePermissions;
}
async function loadAllRolePermissions(){
 if(profile?.role!=='super_admin')return;
 const{data,error}=await sb.rpc('get_all_role_permissions');
 if(error)return note('Impossibile caricare i permessi: '+error.message,true);
 allRolePermissions={};
 (data||[]).forEach(r=>allRolePermissions[r.role]=normalizePermissionDependencies(permissionObject(r.permissions,r.role)));
 ['vice_admin','teacher','examiner'].forEach(r=>{
   if(!allRolePermissions[r])allRolePermissions[r]=permissionObject({},r);
 });
 renderRolePermissionsEditor();
}
function roleHumanName(role){
 return({vice_admin:'Vice Amministratore',teacher:'Docente',examiner:'Esaminatore',super_admin:'Super Amministratore',student:'Corsista'}[role]||role);
}
function renderRolePermissionsEditor(){
 const box=$('rolePermissionsGrid'),sel=$('permissionRoleSelect'),summary=$('rolePermissionSummary');
 if(!box||!sel||profile?.role!=='super_admin')return;
 const role=sel.value||'vice_admin';
 const values=allRolePermissions[role]||permissionObject({},role);
 const groups={};
 ROLE_PERMISSION_DEFS.forEach(def=>(groups[def.group]??=[]).push(def));
 box.innerHTML=Object.entries(groups).map(([group,defs])=>`
  <div class="role-permission-group">
   <h3>${group}</h3>
   <div class="role-permission-list">
    ${defs.map(def=>`<div class="role-permission-item">
      <div class="role-permission-copy"><b>${def.label}</b><small>${def.help}</small>${ROLE_PERMISSION_DEPENDENCIES[def.key]?.length?`<span class="permission-dependency">Richiede: ${ROLE_PERMISSION_DEPENDENCIES[def.key].map(k=>ROLE_PERMISSION_DEFS.find(x=>x.key===k)?.label||k).join(", ")}</span>`:""}</div>
      <button type="button" class="btn ghost role-permission-switch ${values[def.key]?'on':''}" data-permission="${def.key}" aria-pressed="${values[def.key]?'true':'false'}">${values[def.key]?'ON':'OFF'}</button>
    </div>`).join('')}
   </div>
  </div>`).join('');
 box.querySelectorAll('.role-permission-switch').forEach(btn=>btn.onclick=()=>{
   const key=btn.dataset.permission;
   const next=!values[key];
   values[key]=next;
   if(next){
     (ROLE_PERMISSION_DEPENDENCIES[key]||[]).forEach(dep=>values[dep]=true);
   }else{
     // Spegnendo un permesso padre, spegni anche le funzioni che da esso dipendono.
     dependentPermissionsOf(key).forEach(child=>values[child]=false);
   }
   allRolePermissions[role]=normalizePermissionDependencies(values);
   renderRolePermissionsEditor();
 });
 const enabled=ROLE_PERMISSION_DEFS.filter(x=>values[x.key]).length;
 if(summary)summary.textContent=`${roleHumanName(role)}: ${enabled}/${ROLE_PERMISSION_DEFS.length} funzioni abilitate.`;
}
async function saveConfiguredRolePermissions(){
 if(profile?.role!=='super_admin')return note('Funzione riservata al Super Amministratore.',true);
 const role=$('permissionRoleSelect')?.value;
 if(!['vice_admin','teacher','examiner'].includes(role))return;
 const permissions=normalizePermissionDependencies(allRolePermissions[role]||permissionObject({},role));
 const{error}=await sb.rpc('set_role_permissions',{p_role:role,p_permissions:permissions});
 if(error)return note(error.message,true);
 saveNote(`Salvataggio completato — permessi ${roleHumanName(role)} aggiornati.`);
 await loadAllRolePermissions();
}
function setupRolePermissionsEditor(){
 if(profile?.role!=='super_admin')return;
 const sel=$('permissionRoleSelect');
 if(sel&&sel.dataset.permissionReady!=='1'){
   sel.dataset.permissionReady='1';
   sel.onchange=renderRolePermissionsEditor;
 }
 const save=$('saveRolePermissions');
 if(save&&save.dataset.permissionReady!=='1'){save.dataset.permissionReady='1';save.onclick=saveConfiguredRolePermissions}
 const all=$('permissionEnableAll');
 if(all&&all.dataset.permissionReady!=='1'){all.dataset.permissionReady='1';all.onclick=()=>{
   const r=sel.value;allRolePermissions[r]=Object.fromEntries(ROLE_PERMISSION_DEFS.map(x=>[x.key,true]));renderRolePermissionsEditor();
 }}
 const none=$('permissionDisableAll');
 if(none&&none.dataset.permissionReady!=='1'){none.dataset.permissionReady='1';none.onclick=()=>{
   const r=sel.value;allRolePermissions[r]=Object.fromEntries(ROLE_PERMISSION_DEFS.map(x=>[x.key,false]));renderRolePermissionsEditor();
 }}
 const reset=$('permissionResetDefaults');
 if(reset&&reset.dataset.permissionReady!=='1'){reset.dataset.permissionReady='1';reset.onclick=()=>{
   const r=sel.value;allRolePermissions[r]=normalizePermissionDependencies(permissionObject({},r));renderRolePermissionsEditor();
 }}
}
function pagePermission(page){
 const id=page?.id||'',title=page?.dataset?.pageTitle||'';
 if(id==='roleHomeCard')return null;
 if(profile?.role==='super_admin')return null;
 if(id==='assignExamCard'||title==='Assegna esame teorico')return 'assign_exam';
 if(id==='examManagementCard'||title==='Esami e valutazioni'||title==='Esami e valutazioni')return 'exam_management';
 if(id==='examArchiveCard'||title==='Storico esami')return 'exam_history';
 if(id==='analyticsCard'||title==='Statistiche')return 'analytics';
 if(id==='documentsCard'||title==='Documenti esami'||title==='Documenti e archivio')return 'documents_view';
 if(id==='documentArchiveCard'||title==='Archivio documenti')return 'document_archive';
 if(id==='bankAdminCard'||title==='Banca domande')return 'question_bank';
 if(id==='sessionCreateCard'||id==='sessionListCard'||title==='Corsi'||title==='Corsi preparati')return 'sessions_manage';
 if(id==='candidateCreateCard'||title==='Corsisti')return 'candidates_create';
 if(id==='userCreateCard'||title==='Crea utente')return 'users_create';
 if(id==='dashboardCard'||title==='Dashboard')return 'dashboard';
 return null;
}
function renderRoleHome(){
 const card=$('roleHomeCard');if(!card||!profile)return;
 // Questo riepilogo è amministrativo: visibile esclusivamente al Super Amministratore.
 if(profile.role!=='super_admin'){
   card.classList.add('permission-hidden');
   return;
 }
 card.classList.remove('permission-hidden');
 const title=$('roleHomeTitle'),text=$('roleHomeText'),count=$('roleHomeEnabledCount'),mods=$('roleHomeModules');
 if(title)title.textContent='Controllo Super Amministratore';
 if(text)text.textContent='Riepilogo amministrativo delle funzioni disponibili nella piattaforma.';
 const enabled=ROLE_PERMISSION_DEFS.filter(x=>can(x.key));
 if(count)count.textContent=String(enabled.length);
 if(mods)mods.innerHTML=enabled.map(x=>`<span class="role-home-chip">${x.label}</span>`).join('');
}
function applyRolePermissionsToUI(){
 if(!profile||profile.role==='student')return;
 const retryAdmin=profile.role==='super_admin';
 $('assignRetryLimitWrap')?.classList.toggle('hidden',!retryAdmin);
 $('retryDefaultWrap')?.classList.toggle('hidden',!retryAdmin);
 if(retryAdmin)loadRetryDefault().catch(e=>console.warn('Limite correzioni:',e.message));
 renderRoleHome();
 const dashboardUserTools=$('dashboardUserTools');if(dashboardUserTools)dashboardUserTools.classList.toggle('hidden',profile.role!=='super_admin');
 document.querySelectorAll('[data-embedded-permission]').forEach(section=>{const p=section.dataset.embeddedPermission;section.classList.toggle('permission-hidden',!!p&&!can(p))});
 document.querySelectorAll('.app-page').forEach(page=>{
   if(page.id==='roleHomeCard'){
     page.classList.toggle('permission-hidden',profile?.role!=='super_admin');
     return;
   }
   const p=pagePermission(page);
   const hide=!!p&&!can(p);
   page.classList.toggle('permission-hidden',hide);
 });
 const actionMap=[
  ['assignBtn','assign_exam'],
  ['savePractice','practice_evaluation'],
  ['generateDocumentBtn',($('documentTypeSelect')?.value==='certificate'?'generate_certificate':'generate_report')],
  ['documentVerifyBtn','verify_documents'],
  ['refreshDocumentArchiveBtn','document_archive'],
  ['createSessionBtn','sessions_manage'],
  ['deleteSelectedSession','sessions_manage'],
  ['createCandidateBtn','candidates_create'],
  ['createStaffUserBtn','users_create']
 ];
 actionMap.forEach(([id,p])=>{const el=$(id);if(el)el.classList.toggle('permission-hidden',!can(p))});
 const verifyPanel=document.querySelector('.document-verify-panel');
 if(verifyPanel)verifyPanel.classList.toggle('permission-hidden',!can('verify_documents'));
 if($('resultReportBtn'))$('resultReportBtn').classList.toggle('permission-hidden',!can('generate_report'));
 if($('resultDetailedReportBtn'))$('resultDetailedReportBtn').classList.toggle('permission-hidden',!can('generate_report'));
 if($('resultCertificateBtn'))$('resultCertificateBtn').classList.toggle('permission-hidden',!can('generate_certificate'));
 const type=$('documentTypeSelect');
 if(type){
   [...type.options].forEach(o=>{
     if(o.value==='report')o.hidden=!can('generate_report');
     if(o.value==='certificate')o.hidden=!can('generate_certificate');
   });
   const current=type.selectedOptions[0];
   if(current?.hidden){const first=[...type.options].find(o=>!o.hidden);if(first)type.value=first.value}
 }
}

function visibleAppPages(){
 return [...document.querySelectorAll('.app-page')].filter(page=>{
   if(page.dataset.navExclude==='1')return false;
   if(page.id==='assignExamCard'&&profile?.role!=='super_admin'&&can('sessions_manage'))return false;
   if(page.id==='roleHomeCard'&&profile?.role!=='super_admin')return false;
   if(page.classList.contains('permission-hidden'))return false;
   if(page.classList.contains('super-only')&&profile?.role!=='super_admin')return false;
   const permission=pagePermission(page);
   if(permission&&!can(permission))return false;
   return true;
 });
}

function pageMenuCategory(title){
 const t=String(title||'');
 if(['Area personale','Dashboard','Statistiche'].includes(t))return 'Panoramica';
 if(['Corsisti','Corsi','Assegna prova singola','Esami e valutazioni','Documenti e archivio'].includes(t))return 'Percorso esame';
 if(['Banca domande'].includes(t))return 'Banca esame';
 if(['Crea utente','Gestione utenti','Ruoli e permessi'].includes(t))return 'Utenti';
 return 'Configurazione';
}
function renderPracticalNavigation(ordered){
 const menu=$('pageMenuContent'),quick=$('mobileQuickNav');
 if(menu){
   const groups={};
   ordered.forEach(p=>{const g=pageMenuCategory(p.dataset.pageTitle);(groups[g]??=[]).push(p)});
   const order=['Panoramica','Percorso esame','Banca esame','Utenti','Configurazione'];
   menu.innerHTML=order.filter(g=>groups[g]?.length).map(g=>`
     <div class="page-menu-group">${g}</div>
     <div class="page-menu-grid">${groups[g].map(p=>`<button type="button" class="page-menu-item" data-target="${p.dataset.pageId}">${p.dataset.pageTitle}</button>`).join('')}</div>
   `).join('');
   menu.querySelectorAll('.page-menu-item').forEach(b=>b.onclick=()=>showAppPage(b.dataset.target));
 }
 if(quick){
   const firstByTitle=(titles)=>ordered.find(p=>titles.includes(p.dataset.pageTitle));
   const items=[
     ['⌂','Home',firstByTitle(['Dashboard','Area personale'])],
     ['✓','Esame',firstByTitle(['Esami e valutazioni'])],
     ['♟','Corsista',firstByTitle(['Corsisti','Gestione utenti'])],
     ['☰','Menu',null]
   ];
   quick.innerHTML=items.map(([icon,label,p],i)=>`<button type="button" class="mobile-quick-btn" ${p?`data-target="${p.dataset.pageId}"`:''} data-quick="${i}">
     <span class="quick-icon">${icon}</span><span>${label}</span></button>`).join('');
   quick.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>showAppPage(b.dataset.target));
   const menuBtn=quick.querySelector('[data-quick="3"]');if(menuBtn)menuBtn.onclick=()=>$('pageMenuOverlay')?.classList.add('open');
 }
 document.body.classList.toggle('staff-navigation-active',ordered.length>0);
}

function refreshSideNavigation(){
 const workspace=$('topWorkspace'),nav=$('topPageNav');
 if(!workspace||!nav||!profile)return;
 workspace.classList.remove('hidden');
 const pages=visibleAppPages();
 const pageOrder=['Area personale','Dashboard','Corsisti','Corsi','Assegna prova singola','Esami e valutazioni','Documenti e archivio','Banca domande','Statistiche','Crea utente','Gestione utenti','Ruoli e permessi','Impostazioni'];
 const ordered=[...pages].sort((a,b)=>{
   const ai=pageOrder.indexOf(a.dataset.pageTitle),bi=pageOrder.indexOf(b.dataset.pageTitle);
   return (ai<0?999:ai)-(bi<0?999:bi);
 });
 nav.innerHTML=ordered.map(p=>`<button type="button" class="top-page-btn" data-target="${p.dataset.pageId}">${p.dataset.pageTitle}</button>`).join('');
 nav.querySelectorAll('.top-page-btn').forEach(btn=>btn.onclick=()=>showAppPage(btn.dataset.target));
 renderPracticalNavigation(ordered);
 if(!pages.length)return;
 let remembered='';try{remembered=localStorage.getItem(K9_PAGE_KEY)||''}catch(_){}
 const preferred=currentPageId||remembered;
 const stillValid=pages.some(p=>p.dataset.pageId===preferred);
 showAppPage(stillValid?preferred:pages[0].dataset.pageId,false);
 setTimeout(restoreUiDraft,0);
}
function showAppPage(pageId,scrollTop=true){
 const pages=[...document.querySelectorAll('.app-page')];
 const target=pages.find(p=>p.dataset.pageId===pageId);if(!target||!visibleAppPages().includes(target))return;
 pages.forEach(p=>p.classList.toggle('active-page',p===target));
 currentPageId=pageId;
 try{localStorage.setItem(K9_PAGE_KEY,pageId)}catch(_){}
 document.querySelectorAll('.top-page-btn').forEach(b=>b.classList.toggle('active',b.dataset.target===pageId));
 document.querySelectorAll('.page-menu-item,.mobile-quick-btn[data-target]').forEach(b=>b.classList.toggle('active',b.dataset.target===pageId));
 const label=$('currentPageLabel');if(label)label.textContent=target.dataset.pageTitle||'Sezione';
 $('pageMenuOverlay')?.classList.remove('open');
 const navButtons=[...document.querySelectorAll('.top-page-btn')];
 const ids=navButtons.map(b=>b.dataset.target);
 const pos=ids.indexOf(pageId);
 const prevBtn=$('pagePrevBtn'),nextBtn=$('pageNextBtn');
 const prevPage=pos>0?navButtons[pos-1]:null;
 const nextPage=pos>=0&&pos<navButtons.length-1?navButtons[pos+1]:null;
 if(prevBtn){
   prevBtn.hidden=!prevPage;
   prevBtn.disabled=!prevPage;
   prevBtn.textContent=prevPage?`← ${prevPage.textContent.trim()}`:'← Precedente';
   prevBtn.setAttribute('aria-label',prevPage?`Vai a ${prevPage.textContent.trim()}`:'Nessuna pagina precedente');
 }
 if(nextBtn){
   nextBtn.hidden=!nextPage;
   nextBtn.disabled=!nextPage;
   nextBtn.textContent=nextPage?`${nextPage.textContent.trim()} →`:'Successiva →';
   nextBtn.setAttribute('aria-label',nextPage?`Vai a ${nextPage.textContent.trim()}`:'Nessuna pagina successiva');
 }
 if(scrollTop)window.scrollTo({top:$('topWorkspace')?.offsetTop||0,behavior:'auto'});
 enableClickableSelectableUI();
 if(target?.id==='documentsCard')loadDocumentArchive(true);
 if(target?.id==='bankAdminCard')loadQuestionBank();
 if(target?.id==='analyticsCard')loadDidacticStats();
}
function navigateRelative(delta){
 const ids=[...document.querySelectorAll('.top-page-btn')].map(b=>b.dataset.target);
 const i=ids.indexOf(currentPageId);if(i<0||!ids.length)return;
 const next=Math.max(0,Math.min(ids.length-1,i+delta));if(next!==i)showAppPage(ids[next]);
}
let refreshInFlight=null;
async function refreshAll(auto=false){
 if(!user||!profile||!sb)return;
 if(refreshInFlight)return refreshInFlight;
 refreshInFlight=(async()=>{
  try{
   if(profile.role==='student'){
    await loadAssignment();
   }else{
    if(profile.role!=='super_admin')await loadMyRolePermissions();
    const jobs=[];
    if(can('dashboard'))jobs.push(loadDashboard());
    if(can('exam_management')||can('exam_history')||can('analytics')||can('documents_view')||can('document_archive'))jobs.push(loadExams());
    if(can('students_view')||can('assign_exam'))jobs.push(loadStudents());
    if(can('sessions_manage')||can('candidates_create'))jobs.push(loadSessions());
    if(can('assign_evaluator'))jobs.push(loadExaminers());
    if(can('question_bank')&&!auto&&$('bankAdminCard')?.classList.contains('active-page'))jobs.push(loadQuestionBank());
    if(profile.role==='super_admin')jobs.push(loadUsers(),loadSettings(),loadAllRolePermissions());
    await Promise.all(jobs);
    applyRolePermissionsToUI();
    refreshSideNavigation();
   }
   if($('lastAutoRefresh'))$('lastAutoRefresh').textContent=`Ultimo aggiornamento: ${nowStamp()}`;
   if(!auto)note('Dati aggiornati.');
  }catch(e){
   if(!auto)note(e.message||'Errore aggiornamento.',true);
  }finally{
   refreshInFlight=null;
  }
 })();
 return refreshInFlight;
}
function startAutoRefresh(){clearInterval(autoRefreshTimer);if(!user)return;autoRefreshTimer=setInterval(()=>{if(document.visibilityState==='visible'&&can('dashboard'))loadDashboard().catch(()=>{})},120000);$('automationBar')?.classList.toggle('hidden',profile?.role==='student')}
function setupAutomationEvents(){
 $('assignDiscipline')?.addEventListener('change',e=>syncDiscipline(e.target.value,'assign'));
 $('sessionDiscipline')?.addEventListener('change',e=>syncDiscipline(e.target.value,'session'));

 $('assignQuestions')?.addEventListener('change',e=>syncExamConfig($('assignDiscipline').value,'question_count',e.target.value,'assign'));
 $('sessionQuestions')?.addEventListener('change',e=>syncExamConfig($('sessionDiscipline').value,'question_count',e.target.value,'session'));
 $('assignDuration')?.addEventListener('change',e=>syncExamConfig($('assignDiscipline').value,'duration_minutes',e.target.value,'assign'));
 $('sessionDuration')?.addEventListener('change',e=>syncExamConfig($('sessionDiscipline').value,'duration_minutes',e.target.value,'session'));
 $('assignPass')?.addEventListener('change',e=>syncExamConfig($('assignDiscipline').value,'pass_percentage',e.target.value,'assign'));
 $('sessionPass')?.addEventListener('change',e=>syncExamConfig($('sessionDiscipline').value,'pass_percentage',e.target.value,'session'));

 // Impostazioni per disciplina: una modifica qui aggiorna subito Assegna esame e Sessioni.
 $('settings')?.addEventListener('change',e=>{
   const field=e.target.closest('.qc,.dm,.pp');
   if(!field)return;
   const card=field.closest('[data-disc]');if(!card)return;
   const d=card.dataset.disc;
   const key=field.classList.contains('qc')?'question_count':field.classList.contains('dm')?'duration_minutes':'pass_percentage';
   syncExamConfig(d,key,field.value,'settings');
   if($('assignDiscipline')?.value===d||$('sessionDiscipline')?.value===d)applySyncedExamConfig(d);
 });

 $('sessionTitle')?.addEventListener('input',e=>{e.target.dataset.auto='0';e.target.classList.remove('auto-generated')});
 $('commonUsername')?.addEventListener('input',e=>{e.target.dataset.auto='0';e.target.classList.remove('auto-generated')});
 $('candidateSession')?.addEventListener('change',()=>prepareCandidateCredentials(false));
 $('candidateName')?.addEventListener('focus',()=>prepareCandidateCredentials(false));
 let lastResumeRefresh=0;
 const refreshOnResume=()=>{
   if(!user||document.visibilityState!=='visible')return;
   const now=Date.now();
   if(now-lastResumeRefresh<1500)return;
   lastResumeRefresh=now;
   refreshAll(true);
 };
 document.addEventListener('visibilitychange',refreshOnResume);
 window.addEventListener('focus',refreshOnResume);
}



$('studentLogoutBtn')?.addEventListener('click',logoutSafely);
$('resultLogoutBtn')?.addEventListener('click',logoutSafely);
$('studentLoginTab')?.addEventListener('click',()=>showLoginMode('student'));$('staffLoginTab')?.addEventListener('click',()=>showLoginMode('staff'));
function applyCandidateBrowserMode(){
 if(!K9_CANDIDATE_BROWSER_MODE)return;
 showLoginMode('student');
 $('staffLoginTab')?.classList.add('hidden');
 $('studentLoginTab')?.classList.add('hidden');
 const auth=$('authCard');
 if(auth){
   const hint=document.createElement('p');
   hint.className='status candidate-browser-hint';
   hint.textContent='Accesso Corsista via browser — nessuna installazione richiesta.';
   auth.prepend(hint);
 }
}
applyCandidateBrowserMode();
$('candidateLoginBtn').onclick=async()=>{
  if(!await ensureSupabase())return note('Connessione al servizio non disponibile. Contatta l’amministratore.',true);
  const username=$('sessionUsername').value.trim();
  const password=$('candidatePassword').value;
  if(!username||!password)return note('Inserisci username e password.',true);
  try{
    $('candidateLoginBtn').disabled=true;
    const{data,error}=await sb.functions.invoke('manage-exam-access',{
      body:{action:'candidate_login',common_username:username,password}
    });
    if(error||data?.error)throw new Error('Credenziali non valide o sessione non attiva.');
    if(!data.access_token||!data.refresh_token)throw new Error('Accesso personale non disponibile.');
    const{error:loginError}=await sb.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});
    if(loginError)throw loginError;
    $('sessionUsername').value='';
    $('candidatePassword').value='';
    await boot();
  }catch(e){
    note('Credenziali non valide o sessione non disponibile.',true);
  }finally{
    $('candidateLoginBtn').disabled=false;
  }
};
$('loginBtn').onclick=async()=>{
 const btn=$('loginBtn');
 if(btn?.disabled)return;
 try{
  if(btn){btn.disabled=true;btn.textContent='Accesso in corso…'}
  note('Accesso in corso…');
  if(!await ensureSupabase())throw new Error('Connessione al servizio non disponibile.');
  const email=String($('email')?.value||'').trim();
  const password=String($('password')?.value||'');
  if(!email||!password)throw new Error('Inserisci email e password.');
  const authPromise=sb.auth.signInWithPassword({email,password});
  const timeoutPromise=new Promise((_,reject)=>setTimeout(()=>reject(new Error('Il servizio di accesso non risponde. Riprova tra qualche secondo.')),15000));
  const{error}=await Promise.race([authPromise,timeoutPromise]);
  if(error)throw error;
  note('Accesso riuscito. Caricamento profilo…');
  await boot();
 }catch(e){
  console.error('Accesso amministrativo non riuscito:',e);
  note(e?.message||'Accesso non riuscito.',true);
 }finally{
  if(btn){btn.disabled=false;btn.textContent='Accedi'}
 }
};$('logoutBtn').onclick=logoutSafely;

const defaultAppSettings={app_name:'K9 Academy',app_subtitle:'Dogsitter · Mantrailing · HRDD · Detection',organization_name:'K9 Academy',logo_url:'',footer_text:'K9 Academy — Piattaforma esami · Release 2.2.11',student_help_text:'Usa le credenziali fornite dal Super Amministratore.',primary_color:'#5b21b6',header_color:'#35106f',background_color:'#f5f3f8',card_color:'#ffffff',theme:'light',density:'comfortable',corners:'rounded',max_width:1150,show_result:true,immediate_feedback:true,show_explanation:true,confirm_submit:true,timer_warning_minutes:5,teacher_can_assign:true,allow_mistap_report:true,doc_issuer_name:'K9 Academy',doc_issue_place:'',doc_signer_name:'',doc_signer_role:'',icon_192_url:'',icon_512_url:'',branding_bucket:'branding',logo_path:''};
function bool(v){return v===true||v==='true'}

let brandingObjectUrls={logo:'',icon:''},dynamicManifestUrl='',officialLogoBlobUrl='';
function brandingStatus(message,isError=false){
 const box=$('brandingStatus');if(!box)return;
 box.textContent=message||'';
 box.classList.toggle('branding-status-err',!!isError);
 box.classList.toggle('branding-status-ok',!isError&&!!message);
}


function revokeBrandingObjectUrl(key){
 if(brandingObjectUrls[key]){
   URL.revokeObjectURL(brandingObjectUrls[key]);
   brandingObjectUrls[key]='';
 }
}
function setBrandingPreview(imgId,url){
 const img=$(imgId);if(!img)return;
 const frame=img.closest('.branding-image-frame');
 if(url){img.src=url;img.style.display='block';frame?.classList.add('has-image')}
 else{img.removeAttribute('src');img.style.display='none';frame?.classList.remove('has-image')}
}
function previewLocalBranding(file,key,imgId){
 revokeBrandingObjectUrl(key);
 if(!file){setBrandingPreview(imgId,'');return}
 const url=URL.createObjectURL(file);
 brandingObjectUrls[key]=url;
 setBrandingPreview(imgId,url);
}

async function updateOfficialLogo(){
 const img=$('officialLogoImage'),ph=$('officialLogoPlaceholder');if(!img||!ph)return;
 const placeholder=()=>{img.removeAttribute('src');img.style.display='none';ph.style.display='flex'};
 placeholder();
 const src=await resolveOfficialLogoSource();
 if(!src)return;
 img.onload=()=>{img.style.display='block';ph.style.display='none'};
 img.onerror=placeholder;
 img.src=src;img.style.display='block';ph.style.display='none';
}
function updateBrandingPreviews(){
 updateOfficialLogo();
 if(!brandingObjectUrls.logo)setBrandingPreview('brandingLogoPreview',appSettings.logo_url||'');
 if(!brandingObjectUrls.icon)setBrandingPreview('brandingIconPreview',appSettings.icon_512_url||appSettings.icon_192_url||'');
}
async function resizeImageToPng(file,size){
 const dataUrl=await new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(reader.result);
   reader.onerror=()=>reject(new Error('Impossibile leggere l’immagine selezionata.'));
   reader.readAsDataURL(file);
 });
 const img=await new Promise((resolve,reject)=>{
   const el=new Image();
   el.onload=()=>resolve(el);
   el.onerror=()=>reject(new Error('Formato immagine non supportato dal dispositivo.'));
   el.src=dataUrl;
 });
 const canvas=document.createElement('canvas');
 canvas.width=size;canvas.height=size;
 const ctx=canvas.getContext('2d');
 if(!ctx)throw new Error('Canvas non disponibile sul dispositivo.');
 ctx.clearRect(0,0,size,size);
 const scale=Math.min(size/img.naturalWidth,size/img.naturalHeight);
 const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
 ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);
 return await new Promise((resolve,reject)=>{
   canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Impossibile generare l’icona PNG.')),'image/png',0.96);
 });
}
let logoCropState={
 image:null,sourceUrl:'',naturalWidth:0,naturalHeight:0,baseScale:1,zoom:1,x:0,y:0,
 dragging:false,pointerId:null,startX:0,startY:0,startOffsetX:0,startOffsetY:0,fileName:''
};

function clearLogoCropSource(keepPreview=false){
 if(logoCropState.sourceUrl)URL.revokeObjectURL(logoCropState.sourceUrl);
 logoCropState={image:null,sourceUrl:'',naturalWidth:0,naturalHeight:0,baseScale:1,zoom:1,x:0,y:0,dragging:false,pointerId:null,startX:0,startY:0,startOffsetX:0,startOffsetY:0,fileName:''};
 $('logoCropControls')?.classList.add('hidden');
 $('logoCropBox')?.classList.remove('crop-active','crop-dragging');
 const img=$('brandingLogoPreview');
 if(img)img.classList.remove('logo-crop-image');
 if(!keepPreview)updateBrandingPreviews();
}

function logoCropViewportSize(){
 const box=$('logoCropBox');
 return Math.max(1,Math.min(box?.clientWidth||230,box?.clientHeight||230));
}

function clampLogoCropPosition(){
 const s=logoCropState;if(!s.image)return;
 const box=logoCropViewportSize(),scale=s.baseScale*s.zoom;
 const dw=s.naturalWidth*scale,dh=s.naturalHeight*scale;
 const maxX=Math.max(0,(dw-box)/2),maxY=Math.max(0,(dh-box)/2);
 s.x=Math.max(-maxX,Math.min(maxX,s.x));
 s.y=Math.max(-maxY,Math.min(maxY,s.y));
}

function renderLogoCrop(){
 const s=logoCropState,img=$('brandingLogoPreview');
 if(!s.image||!img)return;
 clampLogoCropPosition();
 const scale=s.baseScale*s.zoom;
 img.style.width=`${s.naturalWidth*scale}px`;
 img.style.height=`${s.naturalHeight*scale}px`;
 img.style.transform=`translate(calc(-50% + ${s.x}px),calc(-50% + ${s.y}px))`;
 const range=$('logoZoomRange');if(range)range.value=String(Math.round(s.zoom*100));
}

function setLogoCropZoom(value){
 if(!logoCropState.image)return;
 logoCropState.zoom=Math.max(1,Math.min(4,Number(value)||1));
 renderLogoCrop();
}

function resetLogoCrop(){
 if(!logoCropState.image)return;
 logoCropState.zoom=1;logoCropState.x=0;logoCropState.y=0;renderLogoCrop();
}

async function prepareLogoCropFromFile(file){
 if(!file)throw new Error('Nessun logo selezionato.');
 const mime=String(file.type||'').toLowerCase(),name=String(file.name||'').toLowerCase();
 const imageExt=/\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|svg)$/i.test(name);
 if(!mime.startsWith('image/')&&!imageExt)throw new Error('Seleziona un file immagine.');
 if(file.size>15*1024*1024)throw new Error('Il logo non può superare 15 MB.');

 clearLogoCropSource(true);
 const sourceUrl=URL.createObjectURL(file);
 const image=await new Promise((resolve,reject)=>{
   const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error('Formato immagine non supportato dal dispositivo.'));el.src=sourceUrl;
 });
 const nw=image.naturalWidth||image.width,nh=image.naturalHeight||image.height;
 const box=logoCropViewportSize();
 logoCropState.image=image;logoCropState.sourceUrl=sourceUrl;logoCropState.fileName=file.name||'logo';
 logoCropState.naturalWidth=nw;logoCropState.naturalHeight=nh;
 logoCropState.baseScale=Math.max(box/nw,box/nh);logoCropState.zoom=1;logoCropState.x=0;logoCropState.y=0;

 const preview=$('brandingLogoPreview');
 preview.src=sourceUrl;preview.style.display='block';preview.classList.add('logo-crop-image');
 $('logoCropBox')?.classList.add('has-image','crop-active');
 $('logoCropControls')?.classList.remove('hidden');
 const selected=$('selectedLogoName');if(selected)selected.textContent='Logo selezionato: '+(file.name||'immagine');
 const save=$('uploadLogoBtn');if(save)save.disabled=false;
 brandingStatus('Logo pronto: spostalo e regola lo zoom, poi premi SALVA LOGO.');
 renderLogoCrop();
}

async function logoCropToPng(){
 const s=logoCropState;if(!s.image)throw new Error('Seleziona prima un logo.');
 clampLogoCropPosition();
 const out=900,canvas=document.createElement('canvas');canvas.width=out;canvas.height=out;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas non disponibile sul dispositivo.');
 ctx.clearRect(0,0,out,out);
 const box=logoCropViewportSize(),displayScale=s.baseScale*s.zoom;
 const dw=s.naturalWidth*displayScale,dh=s.naturalHeight*displayScale;
 const left=(box-dw)/2+s.x,top=(box-dh)/2+s.y,ratio=out/box;
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(s.image,left*ratio,top*ratio,dw*ratio,dh*ratio);
 return await new Promise((resolve,reject)=>canvas.toBlob(
   b=>b?resolve(b):reject(new Error('Impossibile preparare il logo.')),'image/png',0.96
 ));
}

function openLogoFilePicker(input){
 if(!input)return;
 try{if(typeof input.showPicker==='function')input.showPicker();else input.click()}catch(_){input.click()}
}

function setupLogoCropEvents(){
 const box=$('logoCropBox');if(!box||box.dataset.cropReady==='1')return;
 box.dataset.cropReady='1';
 box.addEventListener('pointerdown',e=>{
   const s=logoCropState;if(!s.image)return;
   s.dragging=true;s.pointerId=e.pointerId;s.startX=e.clientX;s.startY=e.clientY;s.startOffsetX=s.x;s.startOffsetY=s.y;
   box.classList.add('crop-dragging');try{box.setPointerCapture(e.pointerId)}catch(_){}e.preventDefault();
 });
 box.addEventListener('pointermove',e=>{
   const s=logoCropState;if(!s.dragging||s.pointerId!==e.pointerId)return;
   s.x=s.startOffsetX+(e.clientX-s.startX);s.y=s.startOffsetY+(e.clientY-s.startY);renderLogoCrop();e.preventDefault();
 });
 const stop=e=>{
   const s=logoCropState;if(!s.dragging)return;if(e?.pointerId!=null&&s.pointerId!==e.pointerId)return;
   s.dragging=false;s.pointerId=null;box.classList.remove('crop-dragging');
 };
 box.addEventListener('pointerup',stop);box.addEventListener('pointercancel',stop);
 $('logoZoomRange')?.addEventListener('input',e=>setLogoCropZoom(Number(e.target.value)/100));
 $('logoZoomOut')?.addEventListener('click',()=>setLogoCropZoom(logoCropState.zoom-.1));
 $('logoZoomIn')?.addEventListener('click',()=>setLogoCropZoom(logoCropState.zoom+.1));
 $('logoResetCrop')?.addEventListener('click',resetLogoCrop);
}

function preloadImageUrl(url){
 return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(url);i.onerror=()=>reject(new Error('Il logo caricato non è leggibile dall’app.'));i.src=url+(url.includes('?')?'&':'?')+'check='+Date.now()});
}
async function readBackAppSettings(){
 const{data,error}=await sb.from('app_settings').select('settings').eq('id',1).maybeSingle();
 if(error)throw error;return data?.settings||null;
}
async function resolveOfficialLogoSource(){
 const url=String(appSettings?.logo_url||'').trim();
 if(url){try{await preloadImageUrl(url);return url}catch(e){console.warn('URL logo pubblico non leggibile, uso download storage',e)}}
 const path=String(appSettings?.logo_path||'').trim();
 if(path&&sb){
   try{
     const{data,error}=await sb.storage.from(appSettings.branding_bucket||'branding').download(path);
     if(error)throw error;
     if(officialLogoBlobUrl)URL.revokeObjectURL(officialLogoBlobUrl);
     officialLogoBlobUrl=URL.createObjectURL(data);return officialLogoBlobUrl;
   }catch(e){console.warn('Download logo fallito',e)}
 }
 return '';
}
async function uploadBrandingObject(path,blob,contentType){
 const bucket=appSettings.branding_bucket||'branding';
 const{error}=await sb.storage.from(bucket).upload(path,blob,{upsert:true,contentType,cacheControl:'3600'});
 if(error)throw error;
 const{data}=sb.storage.from(bucket).getPublicUrl(path);
 if(!data?.publicUrl)throw new Error('URL pubblico branding non disponibile.');
 return data.publicUrl+'?v='+Date.now();
}
async function saveAppSettingsPatch(patch){
 if(profile?.role!=='super_admin')throw new Error('Funzione riservata al Super Amministratore.');
 const next={...appSettings,...patch};
 const{error}=await sb.from('app_settings').upsert({
   id:1,settings:next,updated_by:user.id,updated_at:new Date().toISOString()
 },{onConflict:'id'});
 if(error)throw error;
 applyAppSettings(next);
 fillAppSettingsForm();
 return next;
}
async function uploadSelectedLogo(){
 const btn=$('uploadLogoBtn');
 try{
   if(profile?.role!=='super_admin')throw new Error('Funzione riservata al Super Amministratore.');
   if(!logoCropState.image)throw new Error('Seleziona prima un logo.');
   if(btn){btn.disabled=true;btn.textContent='SALVATAGGIO...'}brandingStatus('Preparazione logo...');
   const png=await logoCropToPng();
   const path='logo/official-logo.png';
   brandingStatus('Caricamento logo su Supabase...');
   const url=await uploadBrandingObject(path,png,'image/png');
   await preloadImageUrl(url);
   await saveAppSettingsPatch({logo_url:url,logo_path:path});
   const saved=await readBackAppSettings();
   if(!saved||String(saved.logo_path||'')!==path)throw new Error('Il logo è stato caricato ma le impostazioni non risultano salvate.');
   appSettings={...appSettings,...saved};
   revokeBrandingObjectUrl('logo');
   ['cfgLogoFile','cfgLogoDeviceFile','cfgLogoCameraFile'].forEach(id=>{if($(id))$(id).value=''});
   clearLogoCropSource(true);
   const name=$('selectedLogoName');if(name)name.textContent='Logo salvato.';
   await updateOfficialLogo();updateBrandingPreviews();
   brandingStatus('Logo salvato, verificato e applicato all’app.');saveNote('Salvataggio completato — logo ufficiale aggiornato.');
 }catch(e){brandingStatus(e.message,true);note(e.message,true)}
 finally{if(btn){btn.textContent='SALVA LOGO';btn.disabled=true}}
}

async function resetLogo(){
 try{
   if(!confirm('Rimuovere il logo personalizzato dall’app?'))return;
   await saveAppSettingsPatch({logo_url:'',logo_path:''});
   revokeBrandingObjectUrl('logo');
   clearLogoCropSource(true);
   updateBrandingPreviews();
   note('Logo rimosso.');
 }catch(e){note(e.message,true)}
}

async function cachePwaIcons(){
 if(!('caches' in window))return;
 const icon192=appSettings.icon_192_url||'',icon512=appSettings.icon_512_url||icon192;
 if(!icon192&&!icon512)return;
 try{
   const cache=await caches.open('k9-branding-v1');
   if(icon192){const r=await fetch(icon192,{cache:'no-store'});if(r.ok)await cache.put(new Request('./icons/app-icon-192.png'),r.clone())}
   if(icon512){const r=await fetch(icon512,{cache:'no-store'});if(r.ok)await cache.put(new Request('./icons/app-icon-512.png'),r.clone())}
 }catch(e){console.warn('Cache icone PWA:',e)}
}
function applyPwaBranding(){
 const fav=$('appFavicon'),apple=$('appAppleIcon'),theme=$('themeColorMeta');
 if(fav)fav.href='./icons/app-icon-192.png';
 if(apple)apple.href='./icons/app-icon-192.png';
 if(theme)theme.content=appSettings.primary_color||'#5b21b6';
}
function setupBrandingControls(){
 const gallery=$('cfgLogoFile'),device=$('cfgLogoDeviceFile'),camera=$('cfgLogoCameraFile'),saveBtn=$('uploadLogoBtn');
 setupLogoCropEvents();
 if(saveBtn)saveBtn.disabled=!logoCropState.image;

 if($('chooseLogoGalleryBtn'))$('chooseLogoGalleryBtn').onclick=()=>openLogoFilePicker(gallery);
 if($('chooseLogoDeviceBtn'))$('chooseLogoDeviceBtn').onclick=()=>openLogoFilePicker(device);
 if($('chooseLogoCameraBtn'))$('chooseLogoCameraBtn').onclick=()=>openLogoFilePicker(camera);

 const bindInput=input=>{
   if(!input||input.dataset.brandReady==='1')return;
   input.dataset.brandReady='1';
   input.addEventListener('change',async()=>{
     const file=input.files?.[0];
     try{if(file)await prepareLogoCropFromFile(file)}
     catch(e){brandingStatus(e.message,true);note(e.message,true)}
     finally{input.value=''}
   });
 };
 bindInput(gallery);bindInput(device);bindInput(camera);

 if(saveBtn)saveBtn.onclick=uploadSelectedLogo;
 if($('resetLogoBtn'))$('resetLogoBtn').onclick=resetLogo;
 if(!logoCropState.image)updateBrandingPreviews();
}

function applyAppSettings(s={}){
 appSettings={...defaultAppSettings,...s};
 const r=document.documentElement;
 r.style.setProperty('--p',appSettings.primary_color);
 r.style.setProperty('--bg',appSettings.background_color);
 r.style.setProperty('--card',appSettings.card_color);
 document.querySelector('header').style.background=`linear-gradient(135deg,${appSettings.header_color},${appSettings.primary_color})`;
 document.querySelector('.wrap').style.maxWidth=appSettings.max_width+'px';
 document.body.classList.toggle('compact',appSettings.density==='compact');
 document.body.classList.toggle('square-ui',appSettings.corners==='square');
 const dark=appSettings.theme==='dark'||(appSettings.theme==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);
 document.documentElement.classList.toggle('dark-ui',dark);
 $('appTitle').textContent=appSettings.app_name;
 $('appSubtitle').textContent=appSettings.app_subtitle;
 $('appFooter').textContent=appSettings.footer_text;
 const help=document.querySelector('#studentLoginBox .status');
 if(help)help.textContent=appSettings.student_help_text;
 applyPwaBranding();
 updateBrandingPreviews();

 updateOfficialLogo();
}
async function loadPublicAppSettings(){if(!sb)return;const{data,error}=await sb.from('app_settings').select('settings').eq('id',1).maybeSingle();if(!error&&data?.settings)applyAppSettings(data.settings);else applyAppSettings(defaultAppSettings)}
function fillAppSettingsForm(){const s=appSettings;const map={cfgAppName:'app_name',cfgAppSubtitle:'app_subtitle',cfgStudentHelp:'student_help_text',cfgFooterText:'footer_text',cfgOrganization:'organization_name',cfgPrimary:'primary_color',cfgHeader:'header_color',cfgBackground:'background_color',cfgCard:'card_color',cfgTheme:'theme',cfgDensity:'density',cfgCorners:'corners',cfgMaxWidth:'max_width',cfgShowResult:'show_result',cfgConfirmSubmit:'confirm_submit',cfgTimerWarning:'timer_warning_minutes'};for(const[id,key]of Object.entries(map)){const el=$(id);if(el)el.value=typeof s[key]==='boolean'?String(s[key]):s[key]??''}updateSettingsPreview();setupBrandingControls()}
function readAppSettingsForm(){
 return{
   app_name:$('cfgAppName').value.trim(),
   app_subtitle:$('cfgAppSubtitle').value.trim(),
   logo_url:appSettings.logo_url||'',
   logo_path:appSettings.logo_path||'',
   branding_bucket:appSettings.branding_bucket||'branding',
   student_help_text:$('cfgStudentHelp').value.trim(),
   footer_text:$('cfgFooterText').value.trim(),
   organization_name:$('cfgOrganization').value.trim(),
   primary_color:$('cfgPrimary').value,
   header_color:$('cfgHeader').value,
   background_color:$('cfgBackground').value,
   card_color:$('cfgCard').value,
   theme:$('cfgTheme').value,
   density:$('cfgDensity').value,
   corners:$('cfgCorners').value,
   max_width:+$('cfgMaxWidth').value,
   show_result:bool($('cfgShowResult').value),
   immediate_feedback:true,
   show_explanation:true,
   confirm_submit:bool($('cfgConfirmSubmit').value),
   timer_warning_minutes:+$('cfgTimerWarning').value,
   allow_mistap_report:false
 };
}
function updateSettingsPreview(){
 if(!$('previewTitle'))return;
 $('previewTitle').textContent=$('cfgAppName').value||'K9 Academy';
 $('previewSubtitle').textContent=$('cfgAppSubtitle').value;
 const l=$('logoPreview');
 if(appSettings.logo_url){l.src=appSettings.logo_url;l.style.display='block'}
 else{l.removeAttribute('src');l.style.display='none'}
 updateBrandingPreviews();
}
function applyRoleVisual(role){
 document.body.classList.remove('role-super_admin','role-vice_admin','role-teacher','role-examiner','role-student');
 if(role)document.body.classList.add('role-'+role);
 const names={
  super_admin:['Super Amministratore','Controllo completo'],
  vice_admin:['Vice Amministratore','Area dedicata configurabile'],
  teacher:['Docente','Area dedicata configurabile'],
  examiner:['Esaminatore','Area dedicata configurabile'],
  student:['Corsista','Area personale d’esame']
 };
 let box=$('roleVisualIdentity');
 if(!box){box=document.createElement('div');box.id='roleVisualIdentity';box.className='role-identity';const slot=$('roleVisualSlot');if(slot)slot.appendChild(box);else $('role')?.insertAdjacentElement('afterend',box)}
 const d=names[role];box.innerHTML=d?`<span class="role-identity-dot"></span><span>${d[0]} · ${d[1]}</span>`:'';
 const sr=$('systemSummaryRole');if(sr)sr.textContent=d?d[0]:'Account e automazioni';
}
async function boot(){
 const connected=await ensureSupabase();
 if(!connected){
   $('systemStatusDetails')?.removeAttribute('open');
   $('authCard')?.classList.remove('hidden');
   $('who').textContent='Non autenticato';
   $('role').textContent='';
   return note('Connessione non disponibile. Contatta l’amministratore.');
 }
 await loadPublicAppSettings();
 // 1.82.1: all'apertura può non esistere ancora alcuna sessione Auth.
 // getUser() senza sessione produce AuthSessionMissingError: non è un errore applicativo,
 // è semplicemente lo stato normale prima del login. Verifichiamo prima getSession().
 const{data:sessionData,error:sessionError}=await sb.auth.getSession();
 if(sessionError)return note(sessionError.message,true);
 let u=null;
 if(sessionData?.session){
   const{data:{user:verifiedUser},error:authError}=await sb.auth.getUser();
   if(authError)return note(authError.message,true);
   u=verifiedUser;
 }
 user=u;['studentPanel','staffPanel','adminPanel'].forEach(x=>$(x).classList.add('hidden'));
 if(!u){document.body.classList.remove('student-mode');applyRoleVisual('');$('authCard').classList.remove('hidden');$('logoutBtn').classList.add('hidden');$('ownProfilePhotoBtn').classList.add('hidden');renderAvatarBox($('systemProfileAvatarBox'),'Utente','');$('who').textContent='Non autenticato';$('role').textContent='';$('systemStatusDetails')?.removeAttribute('open');note('');return}
 $('authCard').classList.add('hidden');$('logoutBtn').classList.remove('hidden');$('ownProfilePhotoBtn').classList.remove('hidden');
 const{data,error}=await sb.from('profiles').select('*').eq('id',u.id).single();
 if(error)return note(error.message,true);
 if(data.archived_at){await sb.auth.signOut();user=null;profile=null;$('authCard').classList.remove('hidden');$('logoutBtn').classList.add('hidden');$('who').textContent='Non autenticato';$('role').textContent='';return note('Account archiviato. Contatta il Super Amministratore.',true)}
 profile=data;await loadMyRolePermissions();applyRoleVisual(data.role);$('systemStatusDetails')?.removeAttribute('open');$('who').textContent=data.full_name||data.email;await refreshOwnProfileAvatar();$('role').textContent='— '+({student:'Corsista',teacher:'Docente',examiner:'Esaminatore',vice_admin:'Vice Amministratore',super_admin:'Super Amministratore'}[data.role]||data.role);note('');
 await loadExamSettingsCache();
 if(data.role==='student'){
   document.body.classList.add('student-mode');
   $('topWorkspace')?.classList.add('hidden');
   $('systemStatusDetails')?.classList.add('hidden');
   $('studentPanel').classList.remove('hidden');
   $('studentSimpleName').textContent=data.full_name||'Corsista';
   await loadAssignment();
 }else{
   document.body.classList.remove('student-mode');
   $('staffPanel').classList.remove('hidden');
   $('adminPanel').classList.remove('hidden');
   document.querySelectorAll('#adminPanel .super-only').forEach(el=>el.classList.toggle('hidden',data.role!=='super_admin'));
   const staffSelect=$('newStaffRole');
   [...(staffSelect?.options||[])].forEach(o=>{if(['super_admin','vice_admin'].includes(o.value))o.hidden=data.role!=='super_admin'});
   if(data.role!=='super_admin'&&['super_admin','vice_admin'].includes(staffSelect?.value))staffSelect.value='teacher';

   const jobs=[];
   if(can('students_view')||can('assign_exam'))jobs.push(loadStudents());
   if(can('exam_management')||can('exam_history')||can('analytics')||can('documents_view')||can('document_archive'))jobs.push(loadExams());
   if(can('dashboard'))jobs.push(loadDashboard());
   if(can('sessions_manage')||can('candidates_create'))jobs.push(loadSessions());
   if(can('assign_evaluator'))jobs.push(loadExaminers());
   if(can('question_bank'))jobs.push(qbLoadSummary());
   if(data.role==='super_admin'){
     jobs.push(loadSettings(),loadUsers(),loadAllRolePermissions());
   }
   await Promise.all(jobs);
   if(data.role==='super_admin'){fillAppSettingsForm();setupRolePermissionsEditor();}
   if(can('sessions_manage'))generateSessionIdentity(false);
   if(can('candidates_create'))prepareCandidateCredentials(false);
   if(can('users_create'))prepareStaffPassword(false);
 }
 if(data.role!=='student'){
   buildSidePages();
   applyRolePermissionsToUI();
   refreshSideNavigation();
   if(can('assign_exam'))applyExamDefaults($('assignDiscipline')?.value,'assign');
   startAutoRefresh();
 }else{
   $('topWorkspace')?.classList.add('hidden');
 }
}
let k9OpeningExam=false,k9AnswerBusy=false;
async function openAssignedExam(){
 if(k9OpeningExam||!assignment?.id)return;k9OpeningExam=true;try{
 const{data,error}=await sb.rpc('start_assigned_exam',{p_assignment_id:assignment.id});
 if(error){$('assignmentCard').classList.remove('hidden');$('startBtn').textContent='Riprendi esame';$('startBtn').classList.remove('hidden');return note(error.message,true);}
 if(data?.status==='expired'){
   exam={assignment_id:assignment.id,discipline:assignment.discipline,questions:[]};
   await finalize(true);
   return;
 }
 exam=data;
 syncExamClock(data);
 let remembered=-1;
 try{const x=JSON.parse(localStorage.getItem(K9_EXAM_POS_KEY)||'null');if(x&&String(x.assignment_id)===String(exam.assignment_id))remembered=Number(x.index)}catch(_){}
 const first=(exam.questions||[]).findIndex(q=>q.selected_option===null);
 currentQuestionIndex=remembered>=0&&remembered<(exam.questions||[]).length?remembered:Math.max(0,first);
 $('assignmentCard').classList.add('hidden');$('examHeader').classList.remove('hidden');$('examNavCard').classList.remove('hidden');
 $('examTitle').textContent='Esame '+labels[exam.discipline];$('examMeta').textContent=exam.question_count+' domande';
 await loadAutoRetryState();
 renderExam();runTimer();
 }finally{k9OpeningExam=false;}
}
window.addEventListener('online',()=>{if(profile?.role==='student'&&assignment?.id)loadAssignment().catch(e=>note(e.message,true))});
async function loadAssignment(){
 const{data,error}=await sb.rpc('get_my_assigned_exam');if(error)return note(error.message,true);
 assignment=data;
 if($('studentSimpleDiscipline'))$('studentSimpleDiscipline').textContent=data?.discipline?(labels[data.discipline]||data.discipline):'';
 if(!data){$('assignmentInfo').innerHTML='<b>Nessun esame disponibile.</b><p>Quando il Super Amministratore assegnerà una prova, comparirà qui automaticamente.</p>';return}
 if(['submitted','expired'].includes(data.status)){exam={assignment_id:data.id,discipline:data.discipline,questions:[]};$('assignmentCard').classList.add('hidden');await finalize(data.status==='expired');return;}
 $('assignmentInfo').innerHTML=`<p><span class="badge">${labels[data.discipline]}</span></p><p><b>${data.question_count} domande</b> · ${data.duration_minutes} minuti · soglia ${data.pass_percentage}%</p>${data.notes?`<p>${k9EscapeHtml(data.notes)}</p>`:''}`;
 if(data.status==='in_progress'){$('startBtn').classList.add('hidden');await openAssignedExam()}
 else{$('startBtn').textContent='Inizia esame';$('startBtn').classList.remove('hidden')}
}
$('startBtn').onclick=openAssignedExam;



function retryDeclinedKey(){return `k9_exam_retry_declined_${exam?.assignment_id||'none'}`}
function loadRetryDeclined(){
 autoRetryDeclinedPositions=new Set();
 try{const a=JSON.parse(localStorage.getItem(retryDeclinedKey())||'[]');if(Array.isArray(a))a.forEach(x=>autoRetryDeclinedPositions.add(Number(x)))}catch(_){}
}
function saveRetryDeclined(){
 try{localStorage.setItem(retryDeclinedKey(),JSON.stringify([...autoRetryDeclinedPositions]))}catch(_){}
}
async function loadAutoRetryState(){
 autoRetryUsed=0;autoRetryPositions=new Set();currentRetryPosition=null;loadRetryDeclined();
 if(!exam?.assignment_id)return;
 const{data,error}=await sb.from('answer_correction_reports').select('position,status').eq('assignment_id',exam.assignment_id).eq('reported_by',user.id);
 if(error)return;
 (data||[]).filter(x=>x.status==='accepted').forEach(x=>autoRetryPositions.add(Number(x.position)));
 autoRetryUsed=autoRetryPositions.size;
}
function autoRetryLimit(){
 const raw=exam?.auto_retry_limit;
 return raw!==null&&raw!==undefined&&Number.isInteger(Number(raw))&&Number(raw)>=0?Math.min(Number(raw),Number(exam?.question_count)||200):Math.min(K9_LEGACY_AUTO_RETRY_MAX,Number(exam?.question_count)||200);
}
function autoRetryRemaining(){return Math.max(0,autoRetryLimit()-autoRetryUsed)}
function nextUnansweredAfterCurrent(){
 const questions=exam?.questions||[];
 let next=questions.findIndex((x,i)=>i>currentQuestionIndex&&x.selected_option===null);
 if(next<0)next=questions.findIndex((x,i)=>i<currentQuestionIndex&&x.selected_option===null);
 return next;
}
function goNextUnanswered(delay=450){
 const next=nextUnansweredAfterCurrent();
 if(next>=0){currentQuestionIndex=next;setTimeout(renderExam,delay)}
}
function beginAutoRetry(position){
 const pos=Number(position),q=(exam?.questions||[]).find(x=>Number(x.position)===pos);
 if(!q||q.is_correct||q.selected_option===null)return;
 if(autoRetryPositions.has(pos))return note('La correzione automatica è già stata utilizzata per questa domanda.',true);
 if(autoRetryRemaining()<=0)return note('Limite di correzioni automatiche raggiunto.',true);
 currentRetryPosition=pos;
 renderExam();
}
function declineAutoRetry(position){
 const pos=Number(position);autoRetryDeclinedPositions.add(pos);saveRetryDeclined();currentRetryPosition=null;renderExam();goNextUnanswered(350);
}

function answeredCount(){
 return (exam?.questions||[]).filter(q=>q.selected_option!==null).length;
}
function updateQuestionNavigator(){
 const questions=exam?.questions||[];
 const nav=$('questionNavigator');
 if(!nav)return;
 const previous=String(currentQuestionIndex);
 nav.innerHTML=questions.map((q,i)=>{
   const answered=q.selected_option!==null;
   return `<option value="${i}" ${i===currentQuestionIndex?'selected':''}>${answered?'✓':'○'} Domanda ${i+1}</option>`;
 }).join('');
 nav.value=previous;
 const answered=answeredCount(),unanswered=Math.max(0,questions.length-answered);
 $('answered').textContent=answered;
 $('unansweredCount').textContent=unanswered+' '+(unanswered===1?'non risposta':'non risposte');
 $('progress').style.width=(questions.length?answered/questions.length*100:0)+'%';
 $('questionPositionLabel').textContent=`Domanda ${currentQuestionIndex+1} di ${questions.length||1}`;
 $('prevQuestionBtn').disabled=currentQuestionIndex<=0;
 $('nextQuestionBtn').disabled=currentQuestionIndex>=questions.length-1;
 $('firstUnansweredBtn').disabled=unanswered===0;
}

function renderExam(){
 try{if(exam?.assignment_id)localStorage.setItem(K9_EXAM_POS_KEY,JSON.stringify({assignment_id:exam.assignment_id,index:currentQuestionIndex}))}catch(_){}
 const questions=exam?.questions||[];
 if(!questions.length){$('questions').innerHTML='<div class="card">Nessuna domanda disponibile.</div>';return}
 currentQuestionIndex=Math.max(0,Math.min(currentQuestionIndex,questions.length-1));
 const q=questions[currentQuestionIndex],pos=Number(q.position);
 const quadrettoLabel=({1:'Domanda diretta',2:'Vero o Falso',3:'Affermazione corretta',4:'Affermazione errata'})[Number(q.quadretto_mode)]||'';
 const retryMode=currentRetryPosition===pos&&!q.is_correct&&!autoRetryPositions.has(pos)&&autoRetryRemaining()>0;
 const canOfferRetry=q.selected_option!==null&&!q.is_correct&&!autoRetryPositions.has(pos)&&!autoRetryDeclinedPositions.has(pos)&&autoRetryRemaining()>0;
 const retryFinished=autoRetryPositions.has(pos);
 $('questions').innerHTML=`<article class="q card" data-pos="${q.position}">
   <div class="meta">${k9EscapeHtml(q.category)}</div>
   ${quadrettoLabel?`<div class="meta" style="margin-top:5px"><span class="badge">${k9EscapeHtml(quadrettoLabel)}</span></div>`:''}
   <h3${quadrettoLabel?' style="white-space:pre-line"':''}>${q.position}. ${k9EscapeHtml(q.question_text)}</h3>
   <div class="options">
     ${q.options.map((o,i)=>{let cls='';if(q.selected_option!==null&&q.selected_option===i)cls=q.is_correct?'correct':'wrong';const disabled=retryMode?'':(q.selected_option!==null?'disabled':'');return `<button class="opt ${cls}" data-i="${i}" ${disabled}>${String.fromCharCode(65+i)}. ${k9EscapeHtml(o)}</button>`}).join('')}
   </div>
   ${q.selected_option!==null?`<div class="feedback ${q.is_correct?'ok':'err'}">${q.is_correct?'Risposta corretta':'Risposta errata'}</div>`:''}
   ${retryMode?`<div class="card" style="margin-top:10px;background:#fff7ed;border-color:#fdba74"><b>Correzione automatica ${autoRetryUsed+1} di ${autoRetryLimit()}</b><div class="meta" style="margin-top:4px">Seleziona nuovamente una risposta. Questo secondo tentativo sarà registrato automaticamente.</div></div>`:''}
   ${canOfferRetry&&!retryMode?`<div class="card" style="margin-top:10px;background:#fff7ed;border-color:#fdba74"><b>Vuoi ripetere la risposta?</b><div class="meta" style="margin:5px 0 10px">Puoi usare la correzione automatica su massimo ${autoRetryLimit()} domande. Te ne restano ${autoRetryRemaining()}.</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="button" onclick="beginAutoRetry(${q.position})">Sì, ripeti</button><button class="btn ghost" type="button" onclick="declineAutoRetry(${q.position})">No, continua</button></div></div>`:''}
   ${retryFinished?`<div class="meta" style="margin-top:9px"><b>Correzione automatica registrata.</b> Questa domanda ha utilizzato uno dei ${autoRetryLimit()} tentativi consentiti.</div>`:''}
 </article>`;
 $('questions').querySelectorAll('.opt:not(:disabled)').forEach(b=>b.onclick=retryMode?retryAnswer:answer);
 updateQuestionNavigator();
 window.scrollTo({top:$('examHeader')?.offsetTop||0,behavior:'smooth'});
}

async function answer(e){
 if(k9AnswerBusy)return;k9AnswerBusy=true;try{
 const card=e.target.closest('.q'),pos=+card.dataset.pos,sel=+e.target.dataset.i;
 card.querySelectorAll('button').forEach(x=>x.disabled=true);
 const{data,error}=await sb.rpc('answer_exam_question',{p_assignment_id:exam.assignment_id,p_position:pos,p_selected_option:sel});
 if(error){await openAssignedExam();return note('Risposta non confermata: '+error.message,true)}
 if(data?.status==='expired'){await finalize(true);return}
 const q=exam.questions.find(x=>x.position===pos);
 Object.assign(q,{selected_option:sel,is_correct:data.is_correct});
 try{localStorage.setItem(K9_EXAM_POS_KEY,JSON.stringify({assignment_id:exam.assignment_id,index:currentQuestionIndex}))}catch(_){}
 currentRetryPosition=null;
 renderExam();
 if(q.is_correct)goNextUnanswered(450);
 else if(autoRetryRemaining()<=0)goNextUnanswered(900);
 }finally{k9AnswerBusy=false;}
}

async function retryAnswer(e){
 if(k9AnswerBusy)return;k9AnswerBusy=true;try{
 const card=e.target.closest('.q'),pos=+card.dataset.pos,sel=+e.target.dataset.i;
 card.querySelectorAll('button').forEach(x=>x.disabled=true);
 const{data,error}=await sb.rpc('retry_exam_question',{p_assignment_id:exam.assignment_id,p_position:pos,p_selected_option:sel});
 if(error){currentRetryPosition=null;await openAssignedExam();return note('Correzione non confermata: '+error.message,true)}
 if(data?.status==='expired'){await finalize(true);return}
 const q=exam.questions.find(x=>x.position===pos);
 Object.assign(q,{selected_option:sel,is_correct:data.is_correct});
 autoRetryPositions.add(pos);autoRetryUsed=Number(data.retry_used||autoRetryPositions.size);currentRetryPosition=null;
 renderExam();
 goNextUnanswered(q.is_correct?450:900);
 }finally{k9AnswerBusy=false;}
}

$('questionNavigator').onchange=e=>{currentQuestionIndex=Number(e.target.value)||0;currentRetryPosition=null;renderExam()};
$('prevQuestionBtn').onclick=()=>{if(currentQuestionIndex>0){currentQuestionIndex--;currentRetryPosition=null;renderExam()}};
$('nextQuestionBtn').onclick=()=>{if(currentQuestionIndex<(exam?.questions?.length||1)-1){currentQuestionIndex++;currentRetryPosition=null;renderExam()}};
$('firstUnansweredBtn').onclick=()=>{
 const i=(exam?.questions||[]).findIndex(q=>q.selected_option===null);
 if(i>=0){currentQuestionIndex=i;currentRetryPosition=null;renderExam()}
};

let examDeadlineMono=0,finalizeInFlight=false;
function syncExamClock(data){
 const remaining=Date.parse(data.ends_at)-Date.parse(data.server_now);
 if(!Number.isFinite(remaining))throw new Error('Ora server non disponibile. Riapri la prova.');
 examDeadlineMono=performance.now()+Math.max(0,remaining);
}
function runTimer(){
 clearInterval(tick);
 const f=()=>{
   const seconds=Math.max(0,Math.ceil((examDeadlineMono-performance.now())/1000));
   $('timer').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
   $('timer').classList.toggle('danger',seconds<Number(appSettings.timer_warning_minutes||5)*60);
   if(!seconds&&!finalizeInFlight)finalize(true);
 };
 tick=setInterval(f,1000);f();
}

$('submitBtn').onclick=()=>{
 const unanswered=(exam?.questions||[]).filter(q=>q.selected_option===null).length;
 let message='Confermi la consegna definitiva della prova?';
 if(unanswered)message=`Hai ancora ${unanswered} ${unanswered===1?'domanda senza risposta':'domande senza risposta'}.\n\nConfermi comunque la consegna definitiva?`;
 if(bool(appSettings.confirm_submit)&&!confirm(message))return;
 finalize(false);
};

async function finalize(expired){
 if(finalizeInFlight||!exam?.assignment_id)return;
 finalizeInFlight=true;
 let data;
 try{
   const result=await sb.rpc('finalize_exam',{p_assignment_id:exam.assignment_id,p_expired:expired});
   if(result.error)throw result.error;
   data=result.data;
   if(data?.status==='in_progress'){syncExamClock(data);return;}
   if(!['submitted','expired'].includes(data?.status))throw new Error('La prova non risulta consegnata.');
 }catch(error){note('Consegna non confermata: '+(error.message||'connessione assente')+'. Riprova.',true);if(expired)examDeadlineMono=performance.now()+5000;return;}
 finally{finalizeInFlight=false;}
 clearInterval(tick);
 try{localStorage.removeItem(K9_EXAM_POS_KEY)}catch(_){}
 $('examHeader').classList.add('hidden');
 $('examNavCard').classList.add('hidden');
 $('questions').innerHTML='';
 const card=$('resultCard'),visual=$('resultVisual'),box=$('result');
 card.classList.remove('hidden','passed','failed');
 if(bool(appSettings.show_result)){
   const passed=data.passed===true;
   card.classList.add(passed?'passed':'failed');
   visual.textContent=passed?'✓':'×';
   const candidate=profile?.full_name||'Corsista';
   const discipline=labels[exam?.discipline]||exam?.discipline||'';
   box.innerHTML=`
     <h1 class="exam-result-title">${passed?'PROVA TEORICA SUPERATA':'PROVA TEORICA NON SUPERATA'}</h1>
     <p class="exam-result-subtitle">${k9EscapeHtml(candidate)}${discipline?' · '+k9EscapeHtml(discipline):''}</p>
     <div class="exam-result-score">
       <span>Risultato finale</span>
       <strong>${data.score_percentage}%</strong>
       <span>${data.correct_answers}/${data.question_count} risposte corrette</span>
     </div>
     ${passed?'<p class="status" style="margin-top:18px">La valutazione dell’esame sarà completata con la prova pratica.</p>':''}
     ${data.status==='expired'?'<p class="status" style="margin-top:18px">Tempo scaduto: la prova è stata consegnata automaticamente.</p>':''}
   `;
 }else{
   card.classList.add('passed');
   visual.textContent='✓';
   box.innerHTML='<h1 class="exam-result-title">PROVA CONSEGNATA</h1><p class="exam-result-subtitle">Il risultato sarà comunicato dal Docente.</p>';
 }
}
async function loadStudents(){
 const select=$('studentSelect'),button=$('assignBtn');
 select.innerHTML='<option value="">Caricamento Corsisti…</option>';select.disabled=true;button.disabled=true;
 let data;
 try{data=await fetchAllRows('profiles','id,email,full_name,fiscal_code,birth_date,birth_place,archived_at',q=>q.eq('role','student').is('archived_at',null).order('full_name',{ascending:true}))}
 catch(error){setSelectState(select,button,false,'Errore nel caricamento');return note('Impossibile caricare i Corsisti: '+error.message,true)}
 const students=(data||[]).filter(x=>isUuid(x.id));
 if(!students.length){setSelectState(select,button,false,'Nessun Corsista disponibile');renderCourseStudentList([]);return}
 select.innerHTML='<option value="">Seleziona un Corsista</option>'+students.map(x=>`<option value="${x.id}">${k9EscapeHtml(x.full_name||x.email)}</option>`).join('');
 select.disabled=false;button.disabled=false;renderCourseStudentList(students);setTimeout(restoreUiDraft,0);
}
function updateCourseStudentCount(){const n=document.querySelectorAll('#courseStudentList input[type=checkbox]:checked').length;if($('courseStudentCount'))$('courseStudentCount').textContent=`${n} selezionat${n===1?'o':'i'}`}
function htmlSafe(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c))}
function renderCourseStudentList(students){const box=$('courseStudentList');if(!box)return;box.innerHTML=students.length?students.map(x=>`<label class="course-student-row"><input type="checkbox" value="${x.id}"><span><strong>${htmlSafe(x.full_name||x.email||'Corsista')}</strong><small>${htmlSafe(x.fiscal_code||'Codice fiscale non presente')}</small></span></label>`).join(''):'<div class="empty-state">Nessun Corsista disponibile. Completa prima la fase 1.</div>';box.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.onchange=updateCourseStudentCount);updateCourseStudentCount()}
$('selectAllCourseStudents')?.addEventListener('click',()=>{document.querySelectorAll('#courseStudentList input[type=checkbox]').forEach(x=>x.checked=true);updateCourseStudentCount()});
$('clearCourseStudents')?.addEventListener('click',()=>{document.querySelectorAll('#courseStudentList input[type=checkbox]').forEach(x=>x.checked=false);updateCourseStudentCount()});
$('studentSelect').onchange=()=>setInvalid($('studentSelect'),!isUuid($('studentSelect').value));
let retryDefaultLoadedFor=null,retryDefaultLoading=false;
function readRetryLimit(value,max){const s=String(value??'').trim();return /^\d+$/.test(s)&&Number.isSafeInteger(Number(s))&&Number(s)<=max?Number(s):null;}
function showRetryDefault(n){
 if($('retryDefaultValue'))$('retryDefaultValue').value=String(n);
 if($('assignRetryDefaultInfo'))$('assignRetryDefaultInfo').textContent=`Vuoto = predefinito (${n}); massimo pari alle domande.`;
}
async function loadRetryDefault(){
 if(profile?.role!=='super_admin'||!user?.id||retryDefaultLoadedFor===user.id||retryDefaultLoading)return;
 retryDefaultLoading=true;const uid=user.id;
 try{const {data,error}=await sb.rpc('k9_get_retry_default');if(error)throw error;if(user?.id!==uid||profile?.role!=='super_admin')return;showRetryDefault(data);retryDefaultLoadedFor=uid;$('saveRetryDefaultBtn').disabled=false;}
 finally{retryDefaultLoading=false;}
}
$('saveRetryDefaultBtn').onclick=async()=>{
 if(profile?.role!=='super_admin')return;
 const n=readRetryLimit($('retryDefaultValue').value,200);if(n===null)return note('Inserisci un numero intero da 0 a 200.',true);
 $('saveRetryDefaultBtn').disabled=true;
 try{const{data,error}=await sb.rpc('k9_set_retry_default',{p_limit:n});if(error)throw error;showRetryDefault(data);saveNote('Limite predefinito salvato per le nuove prove.');}
 catch(e){note(e.message,true)}finally{$('saveRetryDefaultBtn').disabled=false;}
};
$('assignQuestions').addEventListener('change',()=>{$('assignRetryLimit').max=$('assignQuestions').value;});
$('assignBtn').onclick=async()=>{
 if(!requirePermission('assign_exam','Assegnazione esami non abilitata per questo ruolo.'))return;
 if(profile?.role==='super_admin'&&!validateQuestionAvailability($('assignDiscipline').value,$('assignQuestions').value))return;
 const studentId=$('studentSelect').value,questions=positiveInt($('assignQuestions').value,1,200),duration=positiveInt($('assignDuration').value,1,300),pass=positiveInt($('assignPass').value,1,100);
 setInvalid($('studentSelect'),!isUuid(studentId));setInvalid($('assignQuestions'),!questions);setInvalid($('assignDuration'),!duration);setInvalid($('assignPass'),!pass);
 if(!isUuid(studentId))return note('Seleziona un Corsista valido prima di assegnare l’esame.',true);
 if(!questions||!duration||!pass)return note('Controlla numero di domande, timer e soglia di superamento.',true);
 $('assignBtn').disabled=true;
 const raw=profile?.role==='super_admin'?$('assignRetryLimit').value.trim():'';
 const retryLimit=raw===''?null:readRetryLimit(raw,questions);
 if(raw!==''&&retryLimit===null){$('assignBtn').disabled=false;return note(`Inserisci un numero intero da 0 a ${questions} per le correzioni.`,true);}
 const params={p_student_id:studentId,p_discipline:$('assignDiscipline').value,p_question_count:questions,p_duration_minutes:duration,p_pass_percentage:pass,p_notes:$('assignNotes').value.trim()||null};
 if(retryLimit!==null)params.p_retry_limit=retryLimit;
 const{error}=await sb.rpc(retryLimit===null?'assign_exam':'k9_assign_exam_with_retry',params);
 $('assignBtn').disabled=false;if(error)note(error.message,true);else saveNote('Salvataggio completato — esame assegnato correttamente.');if(!error){clearUiDraftFields(['studentSelect','assignNotes','assignRetryLimit']);$('assignNotes').value='';$('assignRetryLimit').value='';await Promise.all([loadExams(),loadDashboard()])}
};
async function loadDashboard(){
 if(!sb||!profile||profile.role==='student'||!can('dashboard'))return;
 const{data,error}=await sb.rpc('get_role_dashboard');
 const ids=['dashStudents','dashOpenExams','dashCompletedExams','dashActiveSessions'];
 if(error){ids.forEach(id=>{if($(id))$(id).textContent='—'});console.warn('Dashboard ruolo:',error);return}
 const x=data||{};
 if($('dashStudents'))$('dashStudents').textContent=String(x.students??0);
 if($('dashOpenExams'))$('dashOpenExams').textContent=String(x.open_exams??0);
 if($('dashCompletedExams'))$('dashCompletedExams').textContent=String(x.completed_exams??0);
 if($('dashActiveSessions'))$('dashActiveSessions').textContent=String(x.active_sessions??0);
}

let examinerOptions=[];
async function loadExaminers(){
 let data;
 try{data=await fetchAllRows('profiles','id,full_name,email,role,archived_at',q=>q.in('role',['examiner','teacher']).is('archived_at',null).order('full_name'))}
 catch(error){return note(error.message,true)}
 examinerOptions=data||[];
}
async function setEvaluator(assignmentId,evaluatorId,event=null){
 if(event&&event.isTrusted===false){
   console.warn('Cambio esaminatore sintetico ignorato.');
   return;
 }
 if(!requirePermission('assign_evaluator','Assegnazione valutatore non abilitata per questo ruolo.'))return;
 const{error}=await sb.rpc('set_exam_evaluator',{p_assignment_id:assignmentId,p_evaluator_id:evaluatorId||null});
 if(error)return note(error.message,true);
 saveNote(evaluatorId
   ?'Salvataggio completato — esaminatore assegnato.'
   :'Salvataggio completato — esaminatore rimosso.');
 await loadExams();
}



function pdfSafe(value){
 return String(value??'')
  .replace(/[‘’]/g,"'").replace(/[“”]/g,'"')
  .replace(/[‐‑‒–—]/g,'-').replace(/…/g,'...')
  .replace(/[•·]/g,'-').replace(/[^\x20-\x7EÀ-ÿ]/g,' ');
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
// Preserve full names / organization labels inside their allotted width.
function pdfFittedText(doc,text,x,y,size,maxWidth,minSize=7,style='bold',rgb=[35,35,45],options={}){
 const normalized=pdfSafe(text);
 let fitted=size;
 doc.setFont('helvetica',style);
 while(fitted>minSize){
  doc.setFontSize(fitted);
  if(doc.getTextWidth(normalized)<=maxWidth)break;
  fitted=Math.max(minSize,fitted-.5);
 }
 if(doc.getTextWidth(normalized)>maxWidth){
  // Even at the minimum font size, do not draw beyond the printable area.
  let shortened=normalized;
  while(shortened.length>1&&doc.getTextWidth(shortened+'...')>maxWidth)shortened=shortened.slice(0,-1);
  pdfText(doc,shortened+'...',x,y,fitted,style,rgb,options);
 }else pdfText(doc,normalized,x,y,fitted,style,rgb,options);
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
async function k9DownloadOriginal(id,generation=null){
 try{
  const{data,error}=await sb.rpc('k9_download_pdf',{p_document:id,p_generation:generation});
  if(error)throw error;
  if((data.status==='revoked'||data.status==='superseded')&&!confirm('Documento revocato o superato: scaricare solo per archivio?'))return;
  const bytes=Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0));
  downloadExactPdfBuffer(bytes.buffer,data.file_name);
 }catch(e){
  const message=String(e.message||e);
  if(/originale non conservato/i.test(message)){
   note('PDF originale non conservato per questa generazione storica. La registrazione resta consultabile, ma il file non può essere ricostruito automaticamente.',true);
  }else note(message,true);
 }
}
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
   box.innerHTML=`<b>Verifica non riuscita</b><p class="status">${htmlSafe(String(e.message||e))}</p>`;
   return null;
 }finally{
   if(btn){btn.disabled=false;btn.textContent='Verifica codice'}
 }
}

function certificateEligible(x){
 return x?.passed===true && x?.practical_outcome==='idoneo' && !!x?.practical_completed_at && x?.practical_score!=null && x?.professional_score!=null && mantrailingComponentsComplete(x);
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
 pdfFittedText(doc,brand.issuer,40,18,14.5,107,7.5,'bold',[255,255,255]);
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
 item(x.evaluator_id?'Esito del valutatore':'Esito pratica registrato',displayedPracticeOutcome(x),115,72,{size:9.5});
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
 pdfText(doc,x.practical_completed_at?'L’esito conclusivo è registrato nella scheda.':'Indicazione orientativa: esito ancora da registrare.',81,y+5.1,7.3,'normal',muted);
 pdfText(doc,adviceLines,19,y+10.4,7.7,'normal',ink,{lineHeightFactor:1.15});
 y+=adviceH+3.5;

 section('Esito conclusivo registrato');
 pdfStatusPill(doc,final.label,15,y-4.7,52,brand,ftype);
 pdfText(doc,x.evaluator_id?'DECISIONE DEL VALUTATORE':'ESITO PRATICA REGISTRATO',78,y-1.2,6.9,'bold',muted);
 pdfText(doc,displayedPracticeOutcome(x),78,y+3.8,8.8,'bold',ink);
 pdfText(doc,'DATA DI COMPLETAMENTO',136,y-1.2,6.9,'bold',muted);
 pdfText(doc,x.practical_completed_at?new Date(x.practical_completed_at).toLocaleString('it-IT'):'Non finalizzata',136,y+3.8,8.2,'bold',ink);
 y+=11.0;

 section(x.evaluator_id?'Osservazioni dell’esaminatore':'Osservazioni della valutazione');
 const observationText=pdfSafe(x.practical_notes||'Nessuna osservazione registrata.');
 const maxObsWidth=170;
 // A4 in una pagina: misura il testo alle dimensioni effettivamente usate.
 // Se le note sono troppo estese, indica esplicitamente la continuazione nel report.
 const validationReserve=43;
 const obsBottomLimit=H-20-validationReserve;
 const obsTop=y-3;
 const obsAvailable=Math.max(24,obsBottomLimit-obsTop);
 let obsSize=8.6,obs=[],obsLineHeight=0,obsHeight=0;
 const minObsSize=6.4;
 while(obsSize>=minObsSize){
   doc.setFont('helvetica','normal');doc.setFontSize(obsSize);
   obs=doc.splitTextToSize(observationText,maxObsWidth);
   obsLineHeight=obsSize*0.35278*1.18;
   obsHeight=Math.max(24,9+obs.length*obsLineHeight);
   if(obsHeight<=obsAvailable)break;
   obsSize=Math.round((obsSize-.2)*10)/10;
 }
 if(obsHeight>obsAvailable){
   obsSize=minObsSize;
   doc.setFont('helvetica','normal');doc.setFontSize(obsSize);
   const allLines=doc.splitTextToSize(observationText,maxObsWidth);
   obsLineHeight=obsSize*0.35278*1.18;
   const limit=Math.max(1,Math.floor((obsAvailable-9)/obsLineHeight));
   if(allLines.length>limit){
     const continuation='[Osservazioni integrali nel report completo]';
     obs=allLines.slice(0,Math.max(0,limit-1));
     obs.push(continuation);
   }else obs=allLines;
   obsHeight=Math.max(24,9+obs.length*obsLineHeight);
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
   pdfFittedText(doc,brand.issuer,38,17,12.5,105,7.5,'bold',[255,255,255]);
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
 const scorePct=(v,max)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&max?Math.round(Number(v)*100/max):null;
 const buildProfessionalAssessment=()=>{
   const pPct=scorePct(detail.practical_score,50);
   const profPct=scorePct(detail.professional_score,20);
   const initialErrors=Number(detail.initial_error_count||0);
   const retries=Number(detail.retry_used||0);
   const validPractice=practiceRows.filter(r=>r?.score!==null&&r?.score!==undefined&&r?.score!==''&&Number.isFinite(Number(r.score)));
   const validProfessional=professionalRows.filter(r=>r?.score!==null&&r?.score!==undefined&&r?.score!==''&&Number.isFinite(Number(r.score)));
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
   // Il giudizio tecnico registrato e il risultato complessivo vanno descritti distintamente.
   if(detail.practical_outcome==='idoneo')overall+=' Il giudizio della pratica registrato è IDONEO.';
   else if(detail.practical_outcome==='non_idoneo')overall+=' Il giudizio della pratica registrato è NON IDONEO; questa decisione non è deducibile dal solo punteggio e la relativa motivazione va verificata nelle osservazioni.';
   else if(detail.practical_outcome==='da_rivedere')overall+=' Il giudizio della pratica è DA RIVEDERE.';
   if(detail.passed===false)overall+=` L'ESAME COMPLESSIVO NON È SUPERATO perché la teoria (${Number(detail.score_percentage||0)}%) non raggiunge la soglia richiesta (${Number(detail.pass_percentage||0)}%), indipendentemente dai punteggi pratici.`;

   let improve='Non emergono, dai punteggi registrati, aree tecniche specifiche sotto il massimo previsto.';
   if(consolidate.length)improve=`Le priorità di consolidamento riguardano ${joinList(consolidate.slice(0,5))}. Su queste aree è opportuno ricercare maggiore precisione, continuità esecutiva e capacità di mantenere lo standard anche al variare delle condizioni operative.${refine.length?` Gli altri criteri valutati 4/5 risultano positivi e richiedono soprattutto affinamento, non un recupero di base.`:''}`;
   if(detail.passed===false)improve=`È prioritario consolidare la preparazione teorica: risultato ${Number(detail.score_percentage||0)}% contro soglia ${Number(detail.pass_percentage||0)}%. ${improve}`;

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
   if(detail.passed===false)adviceParts.push(`riprendere il programma teorico e prepararsi a una nuova prova per raggiungere almeno la soglia del ${Number(detail.pass_percentage||0)}%`);
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
 await line('Esito pratica (registrato)',displayedPracticeOutcome({...x,practical_outcome:detail.practical_outcome}));
 if(detail.passed===false)await line('Motivo esame non superato',`Teoria ${Number(detail.score_percentage||0)}% inferiore alla soglia ${Number(detail.pass_percentage||0)}%`);
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
   await reportSubheading(detail.evaluator_name||x.evaluator_id?'Note registrate dal valutatore':'Note registrate nella valutazione');
   await reportParagraph(detail.practical_notes);
 }
 await heading('Esito complessivo');
 await line('Stato finale',finalExamStatus({...x,passed:detail.passed,practical_outcome:detail.practical_outcome,practical_components:detail.practical_components}).label);

 if(y>243)await addPage('DETTAGLIO DOMANDE E RISPOSTE');
 else await heading('Dettaglio domande e risposte');
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
     // Each answer is flowed line-by-line across pages; long explanations are never lost.
     const writeLines=async(lines,x0,sz,sty,color,step)=>{
       for(const textLine of lines){
         await ensure(step+2);
         pdfText(doc,textLine,x0,y,sz,sty,color);
         y+=step;
       }
       y+=1;
     };
     await ensure(24);
     pdfText(doc,`${q.code||'DOMANDA'} · ${q.category||'Senza categoria'}`,15,y,6.2,'bold',brand.primary);
     pdfText(doc,state,195,y,6.6,'bold',q.is_correct===true?[22,101,52]:[153,27,27],{align:'right'});
     y+=5;
     await writeLines(questionLines,15,7.8,'bold',ink,4);
     await writeLines(firstLines,19,7.1,'normal',correction?[153,27,27]:(q.is_correct===true?[22,101,52]:[153,27,27]),3.8);
     if(selectedLines.length)await writeLines(selectedLines,19,7.1,'bold',q.is_correct===true?[22,101,52]:[153,27,27],3.8);
     await writeLines(correctLines,19,7.1,'bold',[22,101,52],3.8);
     await writeLines(explLines,19,6.8,'normal',muted,3.8);
     await ensure(7);
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
 pdfFittedText(doc,brand.issuer,51,25,17,177,8,'bold',brand.dark);
 if(brand.subtitle)pdfText(doc,brand.subtitle,51,33,8,'normal',muted);
 pdfText(doc,`N. ${code}`,W-20,25,6.2,'bold',muted,{align:'right'});
 pdfText(doc,examDateHuman(x),W-43,33,7.5,'normal',muted,{align:'right'});
 doc.setDrawColor(...brand.primary);doc.setLineWidth(.32);doc.line(20,40,W-20,40);

 // Titolo.
 pdfText(doc,'ATTESTATO DI IDONEITÀ',W/2,58,29,'bold',brand.dark,{align:'center'});
 pdfText(doc,'rilasciato a',W/2,70,11.5,'normal',muted,{align:'center'});
 pdfFittedText(doc,candidate,W/2,89,32,244,16,'bold',accent,{align:'center'});

 // Formula istituzionale.
 const statement1='per aver completato con esito positivo il percorso di valutazione teorica e pratica';
 const statement2='e aver dimostrato il possesso delle competenze previste per la disciplina';
 pdfText(doc,statement1,W/2,103,12,'normal',ink,{align:'center'});
 pdfText(doc,statement2,W/2,112,12,'normal',ink,{align:'center'});
 pdfFittedText(doc,discipline,W/2,128,25,214,15,'bold',brand.dark,{align:'center'});

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
 pdfFittedText(doc,brand.issuer,W-20,H-12.5,6.5,68,5,'bold',brand.dark,{align:'right'});
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
async function loadDidacticStats(){
 if(!can('analytics'))return;
 let box=$('k9DidacticStats');
 if(!box){box=document.createElement('div');box.id='k9DidacticStats';box.className='card';$('analyticsCard').appendChild(box);}
 box.textContent='Caricamento indicatori didattici…';
 const {data,error}=await sb.rpc('k9_didactic_stats');
 if(error){box.textContent=error.message;return;}
 const d=data||{};
 // Tabella semantica su desktop; schede leggibili su smartphone, senza scroll orizzontale.
 const table=(title,headers,rows)=>`<section class="k9-didactic-section"><h3>${qbEscape(title)}</h3><div class="k9-didactic-table-wrap"><table class="k9-didactic-table" aria-label="${qbEscape(title)}"><thead><tr>${headers.map(x=>`<th scope="col">${qbEscape(x)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${headers.map((head,i)=>`<td data-label="${qbEscape(head)}">${qbEscape(row[i]??'—')}</td>`).join('')}</tr>`).join(''):`<tr class="k9-didactic-empty"><td colspan="${headers.length}">Nessun dato disponibile</td></tr>`}</tbody></table></div></section>`;
 const mean=d.mean_seconds_from_start==null?'non disponibile':`${Number(d.mean_seconds_from_start)} secondi`;
 box.innerHTML=`<h2>Analisi didattica</h2><p class="block-hint">Prove concluse: errori iniziali e finali distinti. Tempo medio tra l'avvio e la prima risposta: ${qbEscape(mean)}. Non indica il tempo impiegato per ogni domanda.</p><div class="k9-didactic-actions"><button type="button" class="btn ghost" id="k9RefreshDidactic">Aggiorna</button><button type="button" class="btn ghost" id="k9ExportStats">Esporta indicatori JSON</button></div>`
 +table('Domande (prime 100 per errori iniziali)',['Disciplina','Codice','Utilizzi','Errori iniziali','Errori finali','Correzioni'],(d.questions||[]).map(x=>[labels[x.discipline]||x.discipline,x.code,x.uses,x.initial_errors,x.final_errors,x.retries]))
 +table('Argomenti',['Disciplina','Categoria','Utilizzi','Errori iniziali','Errori finali','Correzioni'],(d.categories||[]).map(x=>[labels[x.discipline]||x.discipline,x.category,x.uses,x.initial_errors,x.final_errors,x.retries]))
 +table('Alternative errate (ordine originale della banca)',['Disciplina','Codice','Alternativa','Selezioni'],(d.wrong_choices||[]).map(x=>[labels[x.discipline]||x.discipline,x.code,Number.isInteger(Number(x.original_choice))&&Number(x.original_choice)>=0&&Number(x.original_choice)<=3?String.fromCharCode(65+Number(x.original_choice)):'—',x.uses]));
 $('k9RefreshDidactic').onclick=loadDidacticStats;
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
 return `<p class="status">Le registrazioni storiche non garantiscono che il relativo PDF sia stato conservato. Se il file originale manca, non è ricostruibile automaticamente.</p><div class="document-generation-list">${list.map(g=>`
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
 // Un giudizio pratico positivo non puo' trasformare una teoria senza esito in un esame superato.
 if(x.passed!==true)return{code:'waiting',label:'Esito teorico da verificare'};
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
 <div class="result-summary"><h3>Stato finale</h3><span class="result-state ${statusClass}">${status.label}</span>${x.passed===false?`<p class="status">Motivo del mancato superamento: teoria ${theoryPct}% inferiore alla soglia del ${Number(x.pass_percentage||0)}%. Il giudizio pratico è distinto dall'esito complessivo.</p>`:''}</div>
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
  <div class="result-list-row"><b>Esito pratica registrato</b><span>${displayedPracticeOutcome(x)} (giudizio del valutatore, non dedotto dal punteggio)</span></div>
  ${x.practical_outcome==='non_idoneo'&&Number(x.practical_score)>=30&&Number(x.professional_score)>=12&&mantrailingComponentsComplete(x)?`<div class="result-list-row"><b>Verifica coerenza</b><span>NON IDONEO registrato nonostante punteggi pratici almeno sufficienti e componenti superate. Verificare la motivazione nelle osservazioni; la decisione registrata non viene modificata automaticamente.</span></div>`:''}
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
 // Il DB conserva 0% fino alla consegna: non equivale a un punteggio calcolato.
 const provisional=d.passed!==true&&d.passed!==false;

 // Gli identificativi tecnici restano nel database ma non vengono esposti nella vista ordinaria.
 const map={discipline:'Disciplina',question_count:'Domande',duration_minutes:'Durata (minuti)',pass_percentage:'Soglia di superamento',position:'Numero domanda',selected_option:'Risposta selezionata',is_correct:'Risposta corretta',from:'Da',to:'A',correct_answers:'Risposte corrette',answered_questions:'Risposte date',score_percentage:'Punteggio',passed:'Teoria superata',practical_score:'Punteggio pratica',professional_score:'Professionalità',outcome:'Esito pratica',document_type:'Documento',document_code:'Codice documento',generation_count:'Numero generazioni',file_name:'Nome file PDF',file_size_bytes:'Dimensione PDF (byte)',status:'Stato'};
 Object.keys(map).forEach(k=>{
  if(d[k]===undefined||d[k]===null||d[k]===''||Array.isArray(d[k])||typeof d[k]==='object')return;
  if(k==='score_percentage'&&provisional)return;
  let value=auditValueLabel(k,d[k]);
  if(k==='score_percentage'||k==='pass_percentage')value=`${value}%`;
  parts.push(`${map[k]}: ${value}`);
 });
 if(provisional&&d.correct_answers!==undefined&&d.answered_questions!==undefined)parts.push('Punteggio definitivo: disponibile dopo la consegna');
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
 if(e?.event_type==='theory_result'&&e?.event_data?.passed!==true&&e?.event_data?.passed!==false)return 'Avanzamento delle risposte registrato';
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
  course_created:'Corso preparato',
  theory_result:'Risultato teorico consolidato'
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
 // Il consiglio sulla pratica non deve essere trasformato in NON IDONEO soltanto
 // per il mancato superamento della teoria: sono due valutazioni autonome.
 if(practicalPct<60||professionalPct<60){
   const parts=[];
   if(practicalPct<60)parts.push(`pratica ${practicalPct}%`);
   if(professionalPct<60)parts.push(`professionalità ${professionalPct}%`);
   return{code:'bad',label:'CONSIGLIO: NON IDONEO',reason:`L'indicazione orientativa segnala valori inferiori al livello sufficiente del 60%: ${parts.join(' e ')}.`};
 }
 const theoryNote=theoryPassed?'Teoria superata.':`ATTENZIONE: teoria non superata (${Number(exam?.score_percentage||0)}%; soglia ${Number(exam?.pass_percentage||0)}%): l'esame complessivo rimane NON SUPERATO.`;
 return{code:'ok',label:'PRATICA: POSITIVA',reason:`Valutazione pratica orientativa: tecnica ${practicalPct}% e professionalità ${professionalPct}%, entrambe almeno al livello sufficiente del 60%; componenti obbligatorie valutate. ${theoryNote} Il giudizio pratico resta del valutatore.`};
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
 // Distinguere sempre il giudizio della pratica dall'esito complessivo.
 const praticaAdeguata=practicalScore>=30&&professionalScore>=12&&(disc!=='mantrailing'||(components.length===2&&components.every(c=>c.status==='superata')));
 let conclusion=outcome==='idoneo'?' La prova pratica è stata valutata IDONEA.':outcome==='non_idoneo'?(praticaAdeguata?' La prova pratica è stata registrata NON IDONEA nonostante punteggi pratici sufficienti e componenti obbligatorie superate. Il motivo specifico di tale giudizio deve essere documentato dal valutatore; i punteggi da soli non consentono di ricostruirlo.':' La prova pratica è stata registrata NON IDONEA; si raccomanda un consolidamento mirato prima di una nuova valutazione.'):outcome==='da_rivedere'?' La prova pratica è DA RIVEDERE e richiede una successiva rivalutazione.':' Il giudizio conclusivo della pratica deve ancora essere registrato.';
 if(exam.passed===false)conclusion+=` L'ESAME COMPLESSIVO NON È SUPERATO: la teoria (${Math.round(theoryPct)}%) non raggiunge la soglia del ${Number(exam.pass_percentage||0)}%, indipendentemente dai punteggi della pratica.`;
 let text=(opening+theory+detail+professional+componentText+conclusion).replace(/\s+/g,' ').trim();
 return text;
}
let k9LastAutoGeneratedPracticeNotes='';
function generateProfessionalAssessment(){
 if(!currentPractice)return note('Apri prima una valutazione pratica.',true);
 const missingPractice=practical[currentPractice.disc].some((_,i)=>!practiceValues[i]), missingProfessional=professionalCriteria.some((_,i)=>!professionalValues[i]);
 if(missingPractice||missingProfessional)return note('Assegna prima tutti i punteggi pratici e di professionalità.',true);
 k9LastAutoGeneratedPracticeNotes=generateProfessionalAssessmentText();
 $('practiceNotes').value=k9LastAutoGeneratedPracticeNotes;
 note('Valutazione professionale generata. Puoi modificarla prima di salvare.');
}

window.openPractice=(id,disc,criteriaEncoded,professionalEncoded,notesEncoded,outcomeEncoded,componentsEncoded)=>{
 if(!requirePermission('practice_evaluation','Valutazione pratica non abilitata per questo ruolo.'))return;
 currentPractice={id,disc,components:normalizePracticalComponents(JSON.parse(decodeURIComponent(componentsEncoded||'%5B%5D')))};
 k9LastAutoGeneratedPracticeNotes='';
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
 const actualPracticeScore=Object.values(practiceValues).reduce((a,v)=>a+Number(v),0);
 const actualProfessionalScore=Object.values(professionalValues).reduce((a,v)=>a+Number(v),0);
 const rec=examAdvisoryRecommendation((examArchiveData||[]).find(x=>String(x.id)===String(currentPractice.id))||{},actualPracticeScore,actualProfessionalScore,currentPractice.disc,currentPractice.components,true,true);
 const notes=$('practiceNotes').value.trim();
 if(((outcome==='idoneo'&&rec.code!=='ok')||(outcome==='non_idoneo'&&rec.code==='ok'))&&!notes)return note('Motiva nelle osservazioni il giudizio diverso dal consiglio automatico.',true);
 // Un rapporto autogenerato non costituisce, da solo, motivazione di un NON IDONEO
 // con punteggi elevati e componenti obbligatorie superate.
 const practiceLooksPositive=actualPracticeScore>=30&&actualProfessionalScore>=12&&(currentPractice.disc!=='mantrailing'||(currentPractice.components.length===2&&currentPractice.components.every(c=>c.status==='superata')));
 if(outcome==='non_idoneo'&&practiceLooksPositive&&(!notes||notes===generateProfessionalAssessmentText()||(!!k9LastAutoGeneratedPracticeNotes&&notes===k9LastAutoGeneratedPracticeNotes))){
   return note('La pratica ha punteggi sufficienti ma è stata dichiarata NON IDONEA. Inserisci una motivazione specifica e personale, oltre al testo generato automaticamente.',true);
 }
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
     const counts=qbSummary.find(x=>x.discipline===discipline)||{};
     const easyNote=counts.easy==null?'':` / ${Number(counts.easy)} facili attive`;
     summary.innerHTML=`<b>${qbEscape(labels[discipline]||discipline)}</b> · ${qbTotal} risultati su ${totalDisc} · ${rows.length} in pagina · ${Number(counts.medium||0)} medie / ${Number(counts.hard||0)} difficili${easyNote} · priorità medie/difficili`;
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
     <td data-label="Livello"><strong>${x.difficulty==='difficile'?'Difficile':x.difficulty==='medio'?'Media':'Facile · priorità ridotta'}</strong></td>
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
   else if(r.difficulty&&!['facile','medio','difficile'].includes(r.difficulty))reason='livello non valido: usare facile, medio o difficile';
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
function renderAvatarBox(box,name,url=''){
 if(!box)return;
 if(url){
   box.classList.remove('placeholder');
   box.innerHTML=`<img src="${url}" alt="Foto profilo" style="width:100%;height:100%;border-radius:inherit;object-fit:cover">`;
 }else{
   box.classList.add('placeholder');
   box.textContent=profileInitials(name);
 }
}
async function signedProfilePhotoUrl(path){
 if(!path)return '';
 const cached=profilePhotoUrlCache.get(path);
 if(cached&&cached.expires>Date.now())return cached.url;
 const{data,error}=await sb.storage.from(PROFILE_PHOTO_BUCKET).createSignedUrl(path,1800);
 if(error){console.warn('Foto profilo non disponibile',error);return ''}
 const url=data?.signedUrl||'';
 if(url)profilePhotoUrlCache.set(path,{url,expires:Date.now()+25*60*1000});
 return url;
}
async function hydrateProfileAvatars(root=document){
 if(!root)return;
 const nodes=[...root.querySelectorAll('[data-avatar-path]')];
 await Promise.all(nodes.map(async box=>{
   const path=box.dataset.avatarPath||'';
   const name=box.dataset.avatarName||'Utente';
   renderAvatarBox(box,name,path?await signedProfilePhotoUrl(path):'');
 }));
}
async function refreshOwnProfileAvatar(){
 if(!profile)return;
 const url=profile.avatar_path?await signedProfilePhotoUrl(profile.avatar_path):'';
 renderAvatarBox($('systemProfileAvatarBox'),profile.full_name||profile.email||'Utente',url);
 renderAvatarBox($('studentProfileAvatarBox'),profile.full_name||profile.email||'Utente',url);
}
let profileCropState={
 image:null,
 sourceUrl:'',
 naturalWidth:0,
 naturalHeight:0,
 baseScale:1,
 zoom:1,
 x:0,
 y:0,
 dragging:false,
 pointerId:null,
 startX:0,
 startY:0,
 startOffsetX:0,
 startOffsetY:0
};

function clearProfileCropSource(){
 if(profileCropState.sourceUrl){
   URL.revokeObjectURL(profileCropState.sourceUrl);
 }
 profileCropState={image:null,sourceUrl:'',naturalWidth:0,naturalHeight:0,baseScale:1,zoom:1,x:0,y:0,dragging:false,pointerId:null,startX:0,startY:0,startOffsetX:0,startOffsetY:0};
 $('profilePhotoCropControls')?.classList.add('hidden');
 $('profilePhotoPreviewBox')?.classList.remove('crop-active','crop-dragging');
}

function profileCropViewportSize(){
 const box=$('profilePhotoPreviewBox');
 return Math.max(1,Math.min(box?.clientWidth||230,box?.clientHeight||230));
}

function clampProfileCropPosition(){
 const s=profileCropState;
 if(!s.image)return;
 const boxSize=profileCropViewportSize();
 const scale=s.baseScale*s.zoom;
 const dw=s.naturalWidth*scale,dh=s.naturalHeight*scale;
 const maxX=Math.max(0,(dw-boxSize)/2);
 const maxY=Math.max(0,(dh-boxSize)/2);
 s.x=Math.max(-maxX,Math.min(maxX,s.x));
 s.y=Math.max(-maxY,Math.min(maxY,s.y));
}

function renderProfileCrop(){
 const s=profileCropState,box=$('profilePhotoPreviewBox');
 if(!s.image||!box)return;
 clampProfileCropPosition();
 const img=box.querySelector('.profile-crop-image');
 if(!img)return;
 const scale=s.baseScale*s.zoom;
 img.style.width=`${s.naturalWidth*scale}px`;
 img.style.height=`${s.naturalHeight*scale}px`;
 img.style.transform=`translate(calc(-50% + ${s.x}px),calc(-50% + ${s.y}px))`;
 const z=$('profilePhotoZoom');
 if(z)z.value=String(Math.round(s.zoom*100));
}

function resetProfileCrop(){
 const s=profileCropState;
 if(!s.image)return;
 s.zoom=1;s.x=0;s.y=0;
 renderProfileCrop();
}

function setProfileCropZoom(nextZoom){
 const s=profileCropState;
 if(!s.image)return;
 s.zoom=Math.max(1,Math.min(4,Number(nextZoom)||1));
 renderProfileCrop();
}

async function prepareProfileCropFromFile(file){
 if(!file)throw new Error('Nessuna immagine selezionata.');
 const mime=String(file.type||'').toLowerCase();
 const name=String(file.name||'').toLowerCase();
 const imageExt=/\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(name);
 if(!mime.startsWith('image/')&&!imageExt)throw new Error('Seleziona un file immagine.');
 if(file.size>15*1024*1024)throw new Error('La foto è troppo grande. Massimo 15 MB.');

 clearProfileCropSource();
 const sourceUrl=URL.createObjectURL(file);
 const image=await new Promise((resolve,reject)=>{
   const el=new Image();
   el.onload=()=>resolve(el);
   el.onerror=()=>reject(new Error('Immagine non leggibile dal dispositivo.'));
   el.src=sourceUrl;
 });
 const nw=image.naturalWidth||image.width,nh=image.naturalHeight||image.height;
 const boxSize=profileCropViewportSize();
 profileCropState.image=image;
 profileCropState.sourceUrl=sourceUrl;
 profileCropState.naturalWidth=nw;
 profileCropState.naturalHeight=nh;
 profileCropState.baseScale=Math.max(boxSize/nw,boxSize/nh);
 profileCropState.zoom=1;
 profileCropState.x=0;
 profileCropState.y=0;

 const box=$('profilePhotoPreviewBox');
 box.classList.remove('placeholder');
 box.classList.add('crop-active');
 box.innerHTML=`<img class="profile-crop-image" src="${sourceUrl}" alt="Anteprima foto da ritagliare" draggable="false">`;
 $('profilePhotoCropControls')?.classList.remove('hidden');
 renderProfileCrop();
 $('saveProfilePhotoBtn').disabled=false;
}

async function profileCropToBlob(){
 const s=profileCropState;
 if(!s.image)throw new Error('Seleziona prima una foto.');
 clampProfileCropPosition();
 const out=640,canvas=document.createElement('canvas');
 canvas.width=out;canvas.height=out;
 const ctx=canvas.getContext('2d');
 if(!ctx)throw new Error('Impossibile preparare la foto.');
 const boxSize=profileCropViewportSize();
 const displayScale=s.baseScale*s.zoom;
 const displayedW=s.naturalWidth*displayScale;
 const displayedH=s.naturalHeight*displayScale;
 const left=(boxSize-displayedW)/2+s.x;
 const top=(boxSize-displayedH)/2+s.y;
 const ratio=out/boxSize;
 ctx.imageSmoothingEnabled=true;
 ctx.imageSmoothingQuality='high';
 ctx.drawImage(
   s.image,
   left*ratio,
   top*ratio,
   displayedW*ratio,
   displayedH*ratio
 );
 return await new Promise((resolve,reject)=>canvas.toBlob(
   b=>b?resolve(b):reject(new Error('Impossibile creare il ritaglio della foto.')),
   'image/webp',
   0.9
 ));
}

function setupProfileCropEvents(){
 const box=$('profilePhotoPreviewBox');
 if(!box||box.dataset.cropReady==='1')return;
 box.dataset.cropReady='1';

 box.addEventListener('pointerdown',e=>{
   const s=profileCropState;
   if(!s.image)return;
   s.dragging=true;s.pointerId=e.pointerId;
   s.startX=e.clientX;s.startY=e.clientY;
   s.startOffsetX=s.x;s.startOffsetY=s.y;
   box.classList.add('crop-dragging');
   try{box.setPointerCapture(e.pointerId)}catch(_){}
   e.preventDefault();
 });
 box.addEventListener('pointermove',e=>{
   const s=profileCropState;
   if(!s.dragging||s.pointerId!==e.pointerId)return;
   s.x=s.startOffsetX+(e.clientX-s.startX);
   s.y=s.startOffsetY+(e.clientY-s.startY);
   renderProfileCrop();
   e.preventDefault();
 });
 const stop=e=>{
   const s=profileCropState;
   if(!s.dragging)return;
   if(e?.pointerId!=null&&s.pointerId!==e.pointerId)return;
   s.dragging=false;s.pointerId=null;
   box.classList.remove('crop-dragging');
 };
 box.addEventListener('pointerup',stop);
 box.addEventListener('pointercancel',stop);

 $('profilePhotoZoom')?.addEventListener('input',e=>setProfileCropZoom(Number(e.target.value)/100));
 $('profilePhotoZoomOut')?.addEventListener('click',()=>setProfileCropZoom(profileCropState.zoom-0.1));
 $('profilePhotoZoomIn')?.addEventListener('click',()=>setProfileCropZoom(profileCropState.zoom+0.1));
 $('profilePhotoResetCrop')?.addEventListener('click',resetProfileCrop);
}

async function openProfilePhotoManager(id,name,currentPath=''){
 if(!isUuid(id))return note('Utente non valido.',true);
 profilePhotoTarget={id,name,currentPath};
 profilePhotoPendingBlob=null;
 clearProfileCropSource();
 if(profilePhotoPendingObjectUrl){URL.revokeObjectURL(profilePhotoPendingObjectUrl);profilePhotoPendingObjectUrl=''}
 $('profilePhotoTargetName').textContent=name;
 $('saveProfilePhotoBtn').disabled=true;
 $('removeProfilePhotoBtn').disabled=!currentPath;
 const url=currentPath?await signedProfilePhotoUrl(currentPath):'';
 renderAvatarBox($('profilePhotoPreviewBox'),name,url);
 $('profilePhotoDialog').showModal();
}
async function handleProfilePhotoSelection(file){
 try{
   profilePhotoPendingBlob=null;
   if(profilePhotoPendingObjectUrl){URL.revokeObjectURL(profilePhotoPendingObjectUrl);profilePhotoPendingObjectUrl=''}
   await prepareProfileCropFromFile(file);
 }catch(e){note(e.message,true)}
 finally{
   if($('profileGalleryInput'))$('profileGalleryInput').value='';
   if($('profileDeviceFileInput'))$('profileDeviceFileInput').value='';
   if($('profileCameraInput'))$('profileCameraInput').value='';
 }
}
async function saveProfilePhoto(){
 if(!profilePhotoTarget||!profileCropState.image)return;
 const target=profilePhotoTarget;
 const path=`${target.id}/profile.webp`;
 $('saveProfilePhotoBtn').disabled=true;
 try{
   profilePhotoPendingBlob=await profileCropToBlob();
   const{error:uploadError}=await sb.storage.from(PROFILE_PHOTO_BUCKET).upload(path,profilePhotoPendingBlob,{
     upsert:true,contentType:'image/webp',cacheControl:'3600'
   });
   if(uploadError)throw uploadError;
   const{error:rpcError}=await sb.rpc('set_profile_photo_path',{p_user_id:target.id,p_path:path});
   if(rpcError)throw rpcError;
   profilePhotoUrlCache.delete(path);
   if(profile?.id===target.id){profile.avatar_path=path;await refreshOwnProfileAvatar()}
   profilePhotoTarget.currentPath=path;
   $('removeProfilePhotoBtn').disabled=false;
   clearProfileCropSource();
   note('Foto profilo salvata.');
   $('profilePhotoDialog').close();
   if(profile?.role==='super_admin')await loadUsers();
 }catch(e){note(e.message||'Salvataggio foto non riuscito.',true);$('saveProfilePhotoBtn').disabled=false}
}
async function removeProfilePhoto(){
 if(!profilePhotoTarget)return;
 const target=profilePhotoTarget;
 if(!confirm(`Rimuovere la foto profilo di ${target.name}?`))return;
 try{
   if(target.currentPath){
     const{error:removeError}=await sb.storage.from(PROFILE_PHOTO_BUCKET).remove([target.currentPath]);
     if(removeError)throw removeError;
     profilePhotoUrlCache.delete(target.currentPath);
   }
   const{error:rpcError}=await sb.rpc('set_profile_photo_path',{p_user_id:target.id,p_path:null});
   if(rpcError)throw rpcError;
   if(profile?.id===target.id){profile.avatar_path=null;await refreshOwnProfileAvatar()}
   target.currentPath='';
   note('Foto profilo rimossa.');
   $('profilePhotoDialog').close();
   if(profile?.role==='super_admin')await loadUsers();
 }catch(e){note(e.message||'Rimozione foto non riuscita.',true)}
}

function openCandidateDataEditor(id,rows){
 const x=(rows||[]).find(r=>r.id===id);if(!x)return;
 $('candidateDataUserId').value=x.id;$('candidateDataName').value=x.full_name||'';$('candidateDataFiscalCode').value=x.fiscal_code||'';$('candidateDataBirthDate').value=x.birth_date||'';$('candidateDataBirthPlace').value=x.birth_place||'';$('candidateDataDialog').showModal();
}
async function saveCandidateData(){
 try{
  const id=$('candidateDataUserId').value,name=$('candidateDataName').value.trim(),fiscal=$('candidateDataFiscalCode').value.trim().toUpperCase(),birthDate=$('candidateDataBirthDate').value,birthPlace=$('candidateDataBirthPlace').value.trim();
  if(!isUuid(id))throw new Error('Corsista non valido.');if(!name)throw new Error('Inserisci nome e cognome.');if(!/^[A-Z0-9]{16}$/.test(fiscal))throw new Error('Il codice fiscale deve avere 16 caratteri alfanumerici.');if(!birthDate)throw new Error('Inserisci la data di nascita.');if(!birthPlace)throw new Error('Inserisci il luogo di nascita.');
  const{error}=await sb.from('profiles').update({full_name:name,fiscal_code:fiscal,birth_date:birthDate,birth_place:birthPlace,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;
  $('candidateDataDialog').close();saveNote('Salvataggio completato — anagrafica Corsista aggiornata.');await Promise.all([loadUsers(),loadStudents(),loadExams()]);
 }catch(e){note(e.message,true)}
}
$('saveCandidateDataBtn').onclick=saveCandidateData;
// Escaping contestuale: contenuti provenienti da profili o quiz mai inseriti come HTML non filtrato.
function k9EncodeInline(value){return encodeURIComponent(value).replace(/'/g,'%27')}
function k9EscapeHtml(value){
 return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function loadUsers(){
 if(profile?.role!=='super_admin')return;
 let data;
 try{data=await fetchAllRows('profiles','*',q=>q.order('full_name').order('email'))}
 catch(error){return note(error.message,true)}
 let creds=[];try{creds=await fetchAllRows('student_credentials','student_id,username',q=>q.order('student_id'))}catch(e){note(e.message,true)}
 const usernames=new Map(creds.map(c=>[c.student_id,c.username]));
 const showArchived=$('showArchivedUsers')?.checked===true;
 const roleFilter=$('userRoleFilter')?.value||'';
 const names={student:'Corsista',teacher:'Docente',examiner:'Esaminatore',vice_admin:'Vice Amministratore',super_admin:'Super Amministratore'};
 const active=(data||[]).filter(x=>!x.archived_at);
 const roleCounts={vice_admin:0,teacher:0,examiner:0,student:0};
 active.forEach(x=>{if(Object.prototype.hasOwnProperty.call(roleCounts,x.role))roleCounts[x.role]++});
 if($('userCountVice'))$('userCountVice').textContent=String(roleCounts.vice_admin);
 if($('userCountTeachers'))$('userCountTeachers').textContent=String(roleCounts.teacher);
 if($('userCountExaminers'))$('userCountExaminers').textContent=String(roleCounts.examiner);
 if($('userCountStudents'))$('userCountStudents').textContent=String(roleCounts.student);
 if($('dashViceUsers'))$('dashViceUsers').textContent=String(roleCounts.vice_admin);
 if($('dashTeacherUsers'))$('dashTeacherUsers').textContent=String(roleCounts.teacher);
 if($('dashExaminerUsers'))$('dashExaminerUsers').textContent=String(roleCounts.examiner);
 if($('dashStudentUsers'))$('dashStudentUsers').textContent=String(roleCounts.student);
 const rows=(data||[]).filter(x=>(showArchived||!x.archived_at)&&(!roleFilter||x.role===roleFilter));
 $('userRows').innerHTML=rows.length?rows.map(x=>{
   const archived=!!x.archived_at,self=x.id===user?.id,protectedUser=x.role==='super_admin';
   const safeName=k9EscapeHtml(x.full_name||x.email||'Utente');
   const safeFullName=k9EscapeHtml(x.full_name||'-');
   const safeEmail=k9EscapeHtml(x.email||'-');
   const safeAvatarPath=k9EscapeHtml(x.avatar_path||'');
   const account=x.role==='student'?k9EscapeHtml(usernames.get(x.id)||'Username non disponibile'):safeEmail;
   const roleControl=archived||protectedUser||x.role==='student'?`<b>${names[x.role]||x.role}</b>`:`<select class="role-select" data-id="${x.id}">${Object.keys(names).filter(r=>r!=='super_admin'&&r!=='student').map(r=>`<option value="${r}" ${x.role===r?'selected':''}>${names[r]}</option>`).join('')}</select>`;
   const passwordBtn=!archived?`<button type="button" class="btn ghost reset-user-password" data-id="${x.id}" data-name="${safeName}">Cambia password</button>`:'—';
   let actions=`<div class="user-actions"><button type="button" class="btn ghost profile-photo-btn" data-id="${x.id}" data-name="${safeName}" data-path="${safeAvatarPath}">Foto</button>${x.role==='student'?`<button type="button" class="btn ghost candidate-data-btn" data-id="${x.id}">Anagrafica</button>`:''}</div>`;
   if(!protectedUser&&!self){
     actions=archived
       ? `<div class="user-actions"><button type="button" class="btn ghost profile-photo-btn" data-id="${x.id}" data-name="${safeName}" data-path="${safeAvatarPath}">Foto</button>${x.role==='student'?`<button type="button" class="btn ghost candidate-data-btn" data-id="${x.id}">Anagrafica</button>`:''}<button type="button" class="btn ghost restore-user" data-id="${x.id}" data-name="${safeName}">Ripristina</button><button type="button" class="btn danger delete-user" data-id="${x.id}" data-name="${safeName}">Elimina</button></div>`
       : `<div class="user-actions"><button type="button" class="btn ghost profile-photo-btn" data-id="${x.id}" data-name="${safeName}" data-path="${safeAvatarPath}">Foto</button>${x.role==='student'?`<button type="button" class="btn ghost candidate-data-btn" data-id="${x.id}">Anagrafica</button>`:''}<button type="button" class="btn ghost archive-user" data-id="${x.id}" data-name="${safeName}">Archivia</button><button type="button" class="btn danger delete-user" data-id="${x.id}" data-name="${safeName}">Elimina</button></div>`;
   }
   const initials=profileInitials(x.full_name||x.email||'U');
   return `<tr class="${archived?'archived-user-row':''}"><td data-label="Nome"><div class="profile-name-cell"><div class="profile-avatar placeholder user-avatar" data-avatar-path="${safeAvatarPath}" data-avatar-name="${safeName}">${k9EscapeHtml(initials)}</div><div class="profile-name-copy">${safeFullName}</div></div></td><td data-label="Account">${account}</td><td data-label="Ruolo">${roleControl}</td><td data-label="Stato"><span class="user-status ${archived?'archived':''}">${archived?'Archiviato':'Attivo'}</span></td><td data-label="Password">${passwordBtn}</td><td data-label="Azioni">${actions}</td></tr>`;
 }).join(''):'<tr><td colspan="6" class="empty-state">Nessun utente da visualizzare.</td></tr>';
 $('userRows').querySelectorAll('.role-select').forEach(s=>s.onchange=async()=>{const{error}=await sb.from('profiles').update({role:s.value,updated_at:new Date().toISOString()}).eq('id',s.dataset.id);if(error)note(error.message,true);else{saveNote('Salvataggio completato — ruolo aggiornato.');await loadUsers()}});
 $('userRows').querySelectorAll('.profile-photo-btn').forEach(b=>b.onclick=()=>openProfilePhotoManager(b.dataset.id,b.dataset.name,b.dataset.path||''));
 $('userRows').querySelectorAll('.candidate-data-btn').forEach(b=>b.onclick=()=>openCandidateDataEditor(b.dataset.id,data));
 await hydrateProfileAvatars($('userRows'));
 $('userRows').querySelectorAll('.reset-user-password').forEach(b=>b.onclick=()=>openAdminPasswordReset(b.dataset.id,b.dataset.name));
 $('userRows').querySelectorAll('.archive-user').forEach(b=>b.onclick=()=>archiveManagedUser(b.dataset.id,b.dataset.name));
 $('userRows').querySelectorAll('.restore-user').forEach(b=>b.onclick=()=>restoreManagedUser(b.dataset.id,b.dataset.name));
 $('userRows').querySelectorAll('.delete-user').forEach(b=>b.onclick=()=>deleteManagedUser(b.dataset.id,b.dataset.name));
}
async function openUserManagement(role=''){
 if(profile?.role!=='super_admin')return;
 const filter=$('userRoleFilter');if(filter)filter.value=role||'';
 await loadUsers();
 const page=$('userManagementCard');if(page?.dataset?.pageId)showAppPage(page.dataset.pageId);
}

async function archiveManagedUser(id,name){
 if(!confirm(`Archiviare ${name}?\n\nL’utente non potrà più accedere. Esami, valutazioni e documenti resteranno conservati.`))return;
 try{await invokeAccessManager({action:'archive_user',user_id:id});note(`${name} archiviato correttamente.`);await loadUsers();await refreshAll(true)}catch(e){note(e.message,true)}
}
async function restoreManagedUser(id,name){
 if(!confirm(`Ripristinare ${name}?\n\nL’account tornerà ad avere accesso con le credenziali esistenti.`))return;
 try{await invokeAccessManager({action:'restore_user',user_id:id});note(`${name} ripristinato correttamente.`);await loadUsers();await refreshAll(true)}catch(e){note(e.message,true)}
}
async function deleteManagedUser(id,name){
 if(!confirm(`ELIMINAZIONE DEFINITIVA di ${name}.\n\nQuesta operazione non è reversibile. Se esistono dati storici collegati, il sistema bloccherà l’eliminazione e ti chiederà di usare Archivia.`))return;
 if(!confirm(`Conferma una seconda volta: eliminare definitivamente l’account di ${name}?`))return;
 try{await invokeAccessManager({action:'delete_user',user_id:id});note(`${name} eliminato definitivamente.`);await loadUsers();await refreshAll(true)}catch(e){note(e.message,true)}
}
async function invokeAccessManager(body){
  const{data,error}=await sb.functions.invoke('manage-exam-access',{body});
  if(error){
    let message='Servizio amministrativo non disponibile.';
    try{
      if(error.context instanceof Response){
        const payload=await error.context.clone().json();
        if(payload?.error)message=payload.error;
      }else if(error.context?.body){
        const payload=typeof error.context.body==='string'?JSON.parse(error.context.body):error.context.body;
        if(payload?.error)message=payload.error;
      }else if(error.message){
        message=error.message;
      }
    }catch(_){
      if(error?.message)message=error.message;
    }
    throw new Error(message);
  }
  if(data?.error)throw new Error(data.error);
  return data;
}
function validateNewPassword(p,c){if(p.length<8)throw new Error('La password deve contenere almeno 8 caratteri.');if(p!==c)throw new Error('Le password non coincidono.')}
function openAdminPasswordReset(id,name){$('resetPasswordUserId').value=id;$('resetPasswordUser').textContent='Utente: '+name;$('adminNewPassword').value='';$('adminNewPasswordConfirm').value='';$('resetPasswordDialog').showModal()}

function prepareStaffPassword(force=false){const p=$('newStaffPassword');if(!p)return;if(force||!p.value)p.value=makePassword(12)}
if($('showArchivedUsers'))$('showArchivedUsers').onchange=loadUsers;
if($('userRoleFilter'))$('userRoleFilter').onchange=loadUsers;
if($('refreshUsersBtn'))$('refreshUsersBtn').onclick=loadUsers;
if($('openUserManagementBtn'))$('openUserManagementBtn').onclick=()=>openUserManagement('');
document.querySelectorAll('.dashboard-user-role').forEach(b=>b.onclick=()=>openUserManagement(b.dataset.role||''));
$('saveSuperOwnPassword').onclick=async()=>{try{if(profile?.role!=='super_admin')throw new Error('Funzione riservata al Super Amministratore.');const p=$('superOwnNewPassword').value,c=$('superOwnNewPasswordConfirm').value;validateNewPassword(p,c);await invokeAccessManager({action:'reset_user_password',user_id:user.id,password:p});$('superOwnNewPassword').value='';$('superOwnNewPasswordConfirm').value='';note('Password del Super Amministratore aggiornata.')}catch(e){note(e.message,true)}};
$('createStaffUserBtn').onclick=async()=>{try{if(!requirePermission('users_create','Creazione utenti non abilitata per questo ruolo.'))return;const full_name=$('newStaffName').value.trim(),email=$('newStaffEmail').value.trim(),role=$('newStaffRole').value,password=$('newStaffPassword').value;if(!full_name)throw new Error('Inserisci nome e cognome.');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Inserisci un indirizzo email valido.');if(profile.role!=='super_admin'&&['super_admin','vice_admin'].includes(role))throw new Error('Solo il Super Amministratore può creare Super o Vice Amministratori.');validateNewPassword(password,password);$('createStaffUserBtn').disabled=true;await invokeAccessManager({action:'create_staff_user',full_name,email,role,password});$('newStaffName').value='';$('newStaffEmail').value='';prepareStaffPassword(true);note('Utente creato correttamente.');if(profile.role==='super_admin')await loadUsers()}catch(e){note(e.message,true)}finally{$('createStaffUserBtn').disabled=false}};
$('saveAdminPassword').onclick=async()=>{try{const id=$('resetPasswordUserId').value,p=$('adminNewPassword').value,c=$('adminNewPasswordConfirm').value;if(!isUuid(id))throw new Error('Utente non valido.');validateNewPassword(p,c);await invokeAccessManager({action:'reset_user_password',user_id:id,password:p});$('resetPasswordDialog').close();note('Password utente aggiornata.')}catch(e){note(e.message,true)}};
$('createSessionBtn').onclick=async()=>{try{if(!requirePermission('sessions_manage','Preparazione corsi non abilitata per questo ruolo.'))return;if(profile?.role==='super_admin'&&!validateQuestionAvailability($('sessionDiscipline').value,$('sessionQuestions').value))return;const studentIds=[...document.querySelectorAll('#courseStudentList input[type=checkbox]:checked')].map(x=>x.value).filter(isUuid);if(!studentIds.length)throw new Error('Seleziona almeno un Corsista da inserire nel corso.');if(!$('sessionTitle').value.trim()||!$('commonUsername').value.trim())generateSessionIdentity(true);$('createSessionBtn').disabled=true;const d=await invokeAccessManager({action:'create_course_with_students',title:$('sessionTitle').value.trim(),common_username:$('commonUsername').value.trim(),discipline:$('sessionDiscipline').value,question_count:+$('sessionQuestions').value,duration_minutes:+$('sessionDuration').value,pass_percentage:+$('sessionPass').value,notes:$('sessionNotes').value.trim()||null,student_ids:studentIds});lastSessionCreatedId=d.session?.id||null;note(`Corso preparato: ${d.assigned_count||studentIds.length} Corsisti inseriti e prove assegnate.`);$('sessionNotes').value='';generateSessionIdentity(true);await refreshAll(true)}catch(e){note(e.message,true)}finally{$('createSessionBtn').disabled=false}};

let lastCreatedCandidateCredentials=null;

function buildCandidateCredentialMessage(c){
  return [
    'K9 Academy — Credenziali Corsista',
    '',
    `Corsista: ${c.full_name}`,
    `Username: ${c.username}`,
    `Password: ${c.password}`,
    '',
    `Link accesso: ${c.access_url||candidateAccessUrl()}`,
    '',
    'Apri il link direttamente nel browser. Non è necessario installare l’app.',
    'Per sicurezza non salvare username e password nel browser o in un gestore password.',
    'Conserva queste credenziali e non condividerle con altre persone.'
  ].join('\n');
}

async function shareCandidateCredentials(){
  const c=lastCreatedCandidateCredentials;
  if(!c)return note('Nessuna credenziale appena creata disponibile.',true);
  const text=buildCandidateCredentialMessage(c);
  try{
    if(navigator.share){
      await navigator.share({title:'K9 Academy — Credenziali Corsista',text});
      note('Credenziali condivise.');
    }else{
      await navigator.clipboard.writeText(text);
      note('Condivisione non disponibile: credenziali copiate.');
    }
  }catch(e){
    if(e?.name!=='AbortError')note('Condivisione non riuscita.',true);
  }
}

function whatsappCandidateCredentials(){
  const c=lastCreatedCandidateCredentials;
  if(!c)return note('Nessuna credenziale appena creata disponibile.',true);
  const text=encodeURIComponent(buildCandidateCredentialMessage(c));
  window.open(`https://wa.me/?text=${text}`,'_blank','noopener');
}

function emailCandidateCredentials(){
  const c=lastCreatedCandidateCredentials;
  if(!c)return note('Nessuna credenziale appena creata disponibile.',true);
  const subject=encodeURIComponent('K9 Academy — Credenziali Corsista');
  const body=encodeURIComponent(buildCandidateCredentialMessage(c));
  window.location.href=`mailto:?subject=${subject}&body=${body}`;
}

async function copyCandidateCredentials(){
  const c=lastCreatedCandidateCredentials;
  if(!c)return note('Nessuna credenziale appena creata disponibile.',true);
  const text=buildCandidateCredentialMessage(c);
  try{
    await navigator.clipboard.writeText(text);
    note('Credenziali copiate.');
  }catch(_){
    const ta=document.createElement('textarea');
    ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();
    document.execCommand('copy');ta.remove();
    note('Credenziali copiate.');
  }
}

function renderCandidateCredentialDelivery(c){
  const box=$('credentialResult');
  if(!box)return;
  box.innerHTML=`
    <div class="credential-delivery">
      <h3>Credenziali pronte</h3>
      <p><b>${k9EscapeHtml(c.full_name)}</b> può riceverle direttamente dal telefono.</p>
      <div class="credential-data">
        <div class="credential-row"><span>Username</span><b>${k9EscapeHtml(c.username)}</b></div>
        <div class="credential-row"><span>Password</span><b>${k9EscapeHtml(c.password)}</b></div>
        <div class="credential-row"><span>Link accesso</span><b style="font-size:12px">${k9EscapeHtml(c.access_url||candidateAccessUrl())}</b></div>
      </div>
      <div class="credential-actions">
        <button type="button" class="btn primary" id="shareCandidateCredentialsBtn">Invia</button>
        <button type="button" class="btn" id="whatsappCandidateCredentialsBtn">WhatsApp</button>
        <button type="button" class="btn" id="emailCandidateCredentialsBtn">Email</button>
        <button type="button" class="btn" id="copyCandidateCredentialsBtn">Copia</button>
      </div>
      <p class="credential-security">Il link apre l’area Corsista direttamente nel browser e non propone l’installazione dell’app. Username e password non vengono salvati dall’app. Il browser o eventuali password manager esterni potrebbero comunque proporre il salvataggio: il Corsista deve rifiutarlo.</p>
    </div>`;
  $('shareCandidateCredentialsBtn').onclick=shareCandidateCredentials;
  $('whatsappCandidateCredentialsBtn').onclick=whatsappCandidateCredentials;
  $('emailCandidateCredentialsBtn').onclick=emailCandidateCredentials;
  $('copyCandidateCredentialsBtn').onclick=copyCandidateCredentials;
}

$('toggleCandidatePassword').onclick=()=>{const x=$('newCandidatePassword');const showing=x.type==='text';x.type=showing?'password':'text';$('toggleCandidatePassword').textContent=showing?'Mostra password':'Nascondi password'};
$('createCandidateBtn').onclick=async()=>{try{if(!requirePermission('candidates_create','Creazione corsisti non abilitata per questo ruolo.'))return;
 const name=$('candidateName').value.trim(),fiscalCode=$('candidateFiscalCode').value.trim().toUpperCase(),birthDate=$('candidateBirthDate').value,birthPlace=$('candidateBirthPlace').value.trim(),code=$('candidateCode').value.trim().toLowerCase(),p=$('newCandidatePassword').value;
 const fiscalOk=/^[A-Z0-9]{16}$/.test(fiscalCode);
 setInvalid($('candidateName'),!name);setInvalid($('candidateFiscalCode'),!fiscalOk);setInvalid($('candidateBirthDate'),!birthDate);setInvalid($('candidateBirthPlace'),!birthPlace);setInvalid($('candidateCode'),code.length<4);setInvalid($('newCandidatePassword'),p.length<8);
 if(!name)throw new Error('Inserisci nome e cognome.');if(!fiscalOk)throw new Error('Inserisci un codice fiscale di 16 caratteri alfanumerici.');if(!birthDate)throw new Error('Inserisci la data di nascita.');if(!birthPlace)throw new Error('Inserisci il luogo di nascita.');if(code.length<4)throw new Error('Username Corsista minimo 4 caratteri.');if(p.length<8)throw new Error('Password minima 8 caratteri.');
 $('createCandidateBtn').disabled=true;const d=await invokeAccessManager({action:'create_student_account',full_name:name,fiscal_code:fiscalCode,birth_date:birthDate,birth_place:birthPlace,candidate_code:code,password:p});
 lastCreatedCandidateCredentials={full_name:d.student.full_name,username:d.username,password:p,access_url:candidateAccessUrl()};renderCandidateCredentialDelivery(lastCreatedCandidateCredentials);
 $('candidateName').value='';$('candidateFiscalCode').value='';$('candidateBirthDate').value='';$('candidateBirthPlace').value='';$('candidateCode').value='';$('newCandidatePassword').value='';prepareCandidateCredentials(true);await refreshAll(true);saveNote('Corsista preparato. Ora puoi inserirlo in uno o più corsi dalla fase 2.')
 }catch(e){note(e.message,true)}finally{$('createCandidateBtn').disabled=false}};
async function setSessionArchived(sessionId,archive,title){
 try{
  if(!requirePermission('sessions_manage','Gestione corsi non abilitata per questo ruolo.'))return;
  if(!isUuid(sessionId))throw new Error('Sessione non valida.');
  const verb=archive?'Archiviare':'Ripristinare';
  const detail=archive?'Il corso sarà archiviato. Non possono esserci prove aperte; gli account personali resteranno disponibili.':'La sessione tornerà attiva e nuovamente utilizzabile.';
  if(!confirm(`${verb} la sessione “${title||'selezionata'}”?\n\n${detail}`))return;
  const now=new Date().toISOString();
  const payload=archive?{archived_at:now,active:false,updated_at:now}:{archived_at:null,active:true,updated_at:now};
  const{error}=await sb.from('exam_sessions').update(payload).eq('id',sessionId);
  if(error)throw error;
  note(archive?'Sessione archiviata. Storico conservato.':'Sessione ripristinata e nuovamente attiva.');
  await refreshAll(true);
 }catch(e){note(e.message||'Operazione sulla sessione non riuscita.',true)}
}
window.setSessionArchived=setSessionArchived;

async function loadSessions(){
 let data;
 try{data=await fetchAllRows('exam_session_overview','*',q=>q.order('created_at',{ascending:false}))}
 catch(error){return note(error.message,true)}
 const rows=data||[],active=rows.filter(x=>x.active&&!x.archived_at&&isUuid(x.id));
 if(lastSessionCreatedId&&active.some(x=>x.id===lastSessionCreatedId))lastSessionCreatedId=null;
 const ds=$('sessionDeleteSelect');
 if(ds){
   const prev=ds.value;
   ds.innerHTML=rows.length?rows.map(x=>`<option value="${x.id}">${k9EscapeHtml(x.title)} — ${labels[x.discipline]} — ${x.candidate_count} corsisti${x.archived_at?' — ARCHIVIATA':''}</option>`).join(''):'<option value="">Nessuna sessione creata</option>';
   if(rows.length){ds.value=rows.some(x=>x.id===prev)?prev:rows[0].id;$('deleteSelectedSession').disabled=false}else $('deleteSelectedSession').disabled=true;
 }
 const showArchived=!!$('showArchivedSessions')?.checked;
 const visible=showArchived?rows:rows.filter(x=>!x.archived_at);
 $('sessionRows').innerHTML=visible.length?visible.map(x=>{
   const archived=!!x.archived_at;
   const action=can('sessions_manage')
    ? `<button type="button" class="btn ${archived?'ghost':'primary'}" data-session-action="${archived?'restore':'archive'}" data-id="${x.id}" data-title="${String(x.title||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">${archived?'Ripristina':'Archivia'}</button>`
    : '<span class="meta">—</span>';
   return `<tr data-session-id="${x.id}" class="${archived?'archived-session-row':''}"><td data-label="Corso">${k9EscapeHtml(x.title)}</td><td data-label="Codice"><b>${k9EscapeHtml(x.common_username)}</b></td><td data-label="Disciplina">${labels[x.discipline]}</td><td data-label="Corsisti">${x.active_candidate_count}/${x.candidate_count}</td><td data-label="Stato"><span class="badge">${archived?'Archiviata':(x.active?'Attiva':'Disattivata')}</span></td><td data-label="Azioni">${action}</td></tr>`
 }).join(''):'<tr><td colspan="6"><div class="empty-state">'+(showArchived?'Nessun corso preparato.':'Nessun corso attivo. Attiva “Mostra archiviate” per vedere lo storico.')+'</div></td></tr>';
 $('sessionRows').querySelectorAll('tr[data-session-id]').forEach(row=>row.onclick=()=>{if(ds){ds.value=row.dataset.sessionId;row.parentElement.querySelectorAll('tr').forEach(r=>r.classList.toggle('selected-card',r===row))}});
 $('sessionRows').querySelectorAll('[data-session-action]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();setSessionArchived(btn.dataset.id,btn.dataset.sessionAction==='archive',btn.dataset.title)});
}
if($('showArchivedSessions'))$('showArchivedSessions').onchange=()=>loadSessions();

document.querySelectorAll('.settings-tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.settings-tab').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.settings-pane').forEach(p=>p.classList.toggle('active',p.id===b.dataset.pane))});
['cfgAppName','cfgAppSubtitle'].forEach(id=>$(id)?.addEventListener('input',updateSettingsPreview));
$('saveAllSettings').onclick=async()=>{
 const ui=readAppSettingsForm();
 const{error}=await sb.from('app_settings').upsert({id:1,settings:ui,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:'id'});
 if(error)return note(error.message,true);
 for(const d of Object.keys(examSettingsCache))await persistExamConfig(d);
 applyAppSettings(ui);
 saveNote('Salvataggio completato — impostazioni sincronizzate in tutta l’app.');
};
$('resetAppSettings').onclick=()=>{appSettings={...defaultAppSettings};applyAppSettings(appSettings);fillAppSettingsForm();note('Grafica predefinita ripristinata in anteprima. Premi Salva per renderla definitiva.')};
$('refreshSessions').onclick=()=>refreshAll(false);
$('deleteSelectedSession').onclick=async()=>{
 try{
  if(!requirePermission('sessions_manage','Gestione corsi non abilitata per questo ruolo.'))return;
  const sessionId=$('sessionDeleteSelect').value;if(!isUuid(sessionId))throw new Error('Seleziona una sessione valida.');
  const label=$('sessionDeleteSelect').selectedOptions[0]?.textContent||'questa sessione';
  if(!confirm(`Eliminare definitivamente ${label}?\n\nSaranno rimosse le prove non iniziate e i collegamenti al corso. Gli account personali dei Corsisti resteranno attivi.`))return;
  $('deleteSelectedSession').disabled=true;
  const result=await invokeAccessManager({action:'delete_session',session_id:sessionId});
  note("Corso eliminato. Gli account personali dei Corsisti sono stati conservati.");
  await refreshAll(true);
 }catch(e){note(e.message,true)}
 finally{if($('sessionDeleteSelect')?.value)$('deleteSelectedSession').disabled=false}
};
function openFilePickerInput(input){
 if(!input)return;
 try{
   if(typeof input.showPicker==='function')input.showPicker();
   else input.click();
 }catch(_){input.click()}
}
function setupProfilePhotoEvents(){
 try{
  setupProfileCropEvents();
  $('chooseProfileGalleryBtn')?.addEventListener('click',()=>openFilePickerInput($('profileGalleryInput')));
  $('chooseProfileDeviceBtn')?.addEventListener('click',()=>openFilePickerInput($('profileDeviceFileInput')));
  $('chooseProfileCameraBtn')?.addEventListener('click',()=>openFilePickerInput($('profileCameraInput')));
  $('profileGalleryInput')?.addEventListener('change',e=>handleProfilePhotoSelection(e.target.files?.[0]));
  $('profileDeviceFileInput')?.addEventListener('change',e=>handleProfilePhotoSelection(e.target.files?.[0]));
  $('profileCameraInput')?.addEventListener('change',e=>handleProfilePhotoSelection(e.target.files?.[0]));
  $('saveProfilePhotoBtn')?.addEventListener('click',saveProfilePhoto);
  $('removeProfilePhotoBtn')?.addEventListener('click',removeProfilePhoto);
  $('ownProfilePhotoBtn')?.addEventListener('click',()=>profile&&openProfilePhotoManager(profile.id,profile.full_name||profile.email||'Utente',profile.avatar_path||''));
  $('studentOwnPhotoBtn')?.addEventListener('click',()=>profile&&openProfilePhotoManager(profile.id,profile.full_name||profile.email||'Corsista',profile.avatar_path||''));
 }catch(e){console.error('Inizializzazione foto profilo non riuscita:',e)}
}
setupProfilePhotoEvents();

// RELEASE 1.79 — navigazione sequenziale a pulsanti.
// Lo swipe tra le schermate è disattivato: ogni cambio pagina avviene solo tramite un comando esplicito.

$('refreshDashboard').onclick=()=>refreshAll(false);setupAutomationEvents();showLoginMode('student');
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js?v=210-20261119',{updateViaCache:'none'}).then(r=>r.update()).catch(e=>console.warn('Service worker:',e)))}
boot();
