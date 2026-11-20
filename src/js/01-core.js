

window.addEventListener('error',e=>{
  console.error('Errore applicazione:',e.error||e.message);
});
window.addEventListener('unhandledrejection',e=>{
  console.error('Errore asincrono applicazione:',e.reason);
});
let sb,user,profile,assignment,exam,tick,currentPractice=null,practiceValues={},professionalValues={},appSettings={},rolePermissions={},allRolePermissions={},currentQuestionIndex=0,examArchiveData=[],documentArchiveData=[],documentArchiveLoadPromise=null,documentArchiveLastOk=0,currentResultExam=null,analyticsLastUpdated=null,questionBankData=[];
let examSettingsCache={},autoRefreshTimer=null,lastSessionCreatedId=null;
const K9_AUTO_RETRY_MAX=3;
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
   if(permission)wrap.dataset.embeddedPermission=permission;
   const head=document.createElement('div');head.className='workflow-section-head';
   head.innerHTML=`<div><h3>${title}</h3>${subtitle?`<p>${subtitle}</p>`:''}</div>`;
   wrap.appendChild(head);
   while(source.firstChild)wrap.appendChild(source.firstChild);
   target.appendChild(wrap);source.remove();
 };
 const legacy=$('assignExamCard');if(legacy&&can('sessions_manage')){legacy.dataset.navExclude='1';legacy.classList.add('workflow-legacy-hidden');legacy.setAttribute('aria-hidden','true')}
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
 if(['Corsisti','Corsi','Esami e valutazioni','Documenti e archivio'].includes(t))return 'Percorso esame';
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
 const pageOrder=['Area personale','Dashboard','Corsisti','Corsi','Esami e valutazioni','Documenti e archivio','Banca domande','Statistiche','Crea utente','Gestione utenti','Ruoli e permessi','Impostazioni'];
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

const defaultAppSettings={app_name:'K9 Academy',app_subtitle:'Dogsitter · Mantrailing · HRDD · Detection',organization_name:'K9 Academy',logo_url:'',footer_text:'K9 Academy — Piattaforma esami · Release 2.2.0',student_help_text:'Usa le credenziali fornite dal Super Amministratore.',primary_color:'#5b21b6',header_color:'#35106f',background_color:'#f5f3f8',card_color:'#ffffff',theme:'light',density:'comfortable',corners:'rounded',max_width:1150,show_result:true,immediate_feedback:true,show_explanation:true,confirm_submit:true,timer_warning_minutes:5,teacher_can_assign:true,allow_mistap_report:true,doc_issuer_name:'K9 Academy',doc_issue_place:'',doc_signer_name:'',doc_signer_role:'',icon_192_url:'',icon_512_url:'',branding_bucket:'branding',logo_path:''};
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
   const superOption=$('newStaffRole')?.querySelector('[data-super-option="1"]');
   if(superOption)superOption.hidden=data.role!=='super_admin';
   if(data.role!=='super_admin'&&$('newStaffRole')?.value==='super_admin')$('newStaffRole').value='teacher';

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
