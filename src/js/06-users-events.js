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
