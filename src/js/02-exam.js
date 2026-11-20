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
function autoRetryRemaining(){return Math.max(0,K9_AUTO_RETRY_MAX-autoRetryUsed)}
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
 if(autoRetryRemaining()<=0)return note('Hai già utilizzato le 3 correzioni automatiche disponibili.',true);
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
 const retryMode=currentRetryPosition===pos&&!q.is_correct&&!autoRetryPositions.has(pos)&&autoRetryRemaining()>0;
 const canOfferRetry=q.selected_option!==null&&!q.is_correct&&!autoRetryPositions.has(pos)&&!autoRetryDeclinedPositions.has(pos)&&autoRetryRemaining()>0;
 const retryFinished=autoRetryPositions.has(pos);
 $('questions').innerHTML=`<article class="q card" data-pos="${q.position}">
   <div class="meta">${k9EscapeHtml(q.category)}</div>
   <h3>${q.position}. ${k9EscapeHtml(q.question_text)}</h3>
   <div class="options">
     ${q.options.map((o,i)=>{let cls='';if(q.selected_option!==null&&q.selected_option===i)cls=q.is_correct?'correct':'wrong';const disabled=retryMode?'':(q.selected_option!==null?'disabled':'');return `<button class="opt ${cls}" data-i="${i}" ${disabled}>${String.fromCharCode(65+i)}. ${k9EscapeHtml(o)}</button>`}).join('')}
   </div>
   ${q.selected_option!==null?`<div class="feedback ${q.is_correct?'ok':'err'}">${q.is_correct?'Risposta corretta':'Risposta errata'}</div>`:''}
   ${retryMode?`<div class="card" style="margin-top:10px;background:#fff7ed;border-color:#fdba74"><b>Correzione automatica ${autoRetryUsed+1} di ${K9_AUTO_RETRY_MAX}</b><div class="meta" style="margin-top:4px">Seleziona nuovamente una risposta. Questo secondo tentativo sarà registrato automaticamente.</div></div>`:''}
   ${canOfferRetry&&!retryMode?`<div class="card" style="margin-top:10px;background:#fff7ed;border-color:#fdba74"><b>Vuoi ripetere la risposta?</b><div class="meta" style="margin:5px 0 10px">Puoi usare la correzione automatica su massimo ${K9_AUTO_RETRY_MAX} domande. Te ne restano ${autoRetryRemaining()}.</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="button" onclick="beginAutoRetry(${q.position})">Sì, ripeti</button><button class="btn ghost" type="button" onclick="declineAutoRetry(${q.position})">No, continua</button></div></div>`:''}
   ${retryFinished?`<div class="meta" style="margin-top:9px"><b>Correzione automatica registrata.</b> Questa domanda ha utilizzato uno dei ${K9_AUTO_RETRY_MAX} tentativi consentiti.</div>`:''}
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
$('assignBtn').onclick=async()=>{
 if(!requirePermission('assign_exam','Assegnazione esami non abilitata per questo ruolo.'))return;
 if(profile?.role==='super_admin'&&!validateQuestionAvailability($('assignDiscipline').value,$('assignQuestions').value))return;
 const studentId=$('studentSelect').value,questions=positiveInt($('assignQuestions').value,1,200),duration=positiveInt($('assignDuration').value,1,300),pass=positiveInt($('assignPass').value,1,100);
 setInvalid($('studentSelect'),!isUuid(studentId));setInvalid($('assignQuestions'),!questions);setInvalid($('assignDuration'),!duration);setInvalid($('assignPass'),!pass);
 if(!isUuid(studentId))return note('Seleziona un Corsista valido prima di assegnare l’esame.',true);
 if(!questions||!duration||!pass)return note('Controlla numero di domande, timer e soglia di superamento.',true);
 $('assignBtn').disabled=true;
 const{error}=await sb.rpc('assign_exam',{p_student_id:studentId,p_discipline:$('assignDiscipline').value,p_question_count:questions,p_duration_minutes:duration,p_pass_percentage:pass,p_notes:$('assignNotes').value.trim()||null});
 $('assignBtn').disabled=false;if(error)note(error.message,true);else saveNote('Salvataggio completato — esame assegnato correttamente.');if(!error){clearUiDraftFields(['studentSelect','assignNotes']);$('assignNotes').value='';await Promise.all([loadExams(),loadDashboard()])}
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



