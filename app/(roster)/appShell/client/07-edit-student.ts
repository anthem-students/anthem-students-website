// Add / edit / delete student modal.
// Part of the roster's client script; see ./index.ts.
export const EDIT_STUDENT = `// ── EDIT STUDENT MODAL ────────────────────────────────────────
function openEditModal(sk, index) {
  if (!canEdit) return;
  const p = DATA[sk].students[index];
  editState={mode:'edit',sk,index};
  document.getElementById('edit-modal-title').textContent='Edit Student';
  document.getElementById('edit-modal-sub').textContent=(sk==='hs'?'High School':'Middle School')+' · '+STATUS_LABELS[statusOf(p)];
  sv('ef-name',p.name||''); sv('ef-grade',p.grade||''); sv('ef-school',p.school||'');
  sv('ef-birthday',p.birthday||''); sv('ef-notes',p.notes||'');
  sv('ef-photoUrl',p.photoUrl||''); sv('ef-primary-goal',p.primaryGoal||'');
  sv('ef-status',statusOf(p));
  setConnected(p.connected||false);
  setApprenticeField(!!p.apprentice);
  efPhotoCrop=p.photoCrop||null;
  efThumbUrl=null; efThumbFor=null;
  updateEditPhotoPreview();
  document.getElementById('ef-delete-btn').style.display='inline-block';
  document.getElementById('ef-save-btn').textContent='Save Changes';
  openModal('edit-modal');
}

function openAddModal(sk) {
  if (!canEdit) return;
  editState={mode:'add',sk,index:-1};
  document.getElementById('edit-modal-title').textContent='Add Student';
  document.getElementById('edit-modal-sub').textContent=(sk==='hs'?'High School':'Middle School');
  ['ef-name','ef-grade','ef-school','ef-birthday','ef-notes','ef-photoUrl','ef-primary-goal'].forEach(id=>sv(id,''));
  sv('ef-status','core');
  efPhotoCrop=null;
  efThumbUrl=null; efThumbFor=null;
  setConnected(false); setApprenticeField(false); updateEditPhotoPreview();
  document.getElementById('ef-delete-btn').style.display='none';
  document.getElementById('ef-save-btn').textContent='Add Student';
  openModal('edit-modal');
  document.getElementById('ef-name').focus();
}

function closeEditModal() { closeModal('edit-modal'); }
function setConnected(val) {
  connectedVal=val;
  const el=document.getElementById('ef-connected-toggle');
  el.classList.toggle('on',val);
  el.querySelector('.toggle-label').textContent=val?'Family Connected With':'Not Connected';
}
function toggleConnected() { setConnected(!connectedVal); }
let efApprentice = false;
function setApprenticeField(val) {
  efApprentice=val;
  const el=document.getElementById('ef-apprentice-toggle');
  if(!el) return;
  el.classList.toggle('on',val);
  el.querySelector('.toggle-label').textContent=val?'Student Apprentice':'Not an Apprentice';
}
function toggleApprenticeField() { setApprenticeField(!efApprentice); }
function updateEditPhotoPreview() {
  const url=v('ef-photoUrl'), name=v('ef-name')||'?';
  document.getElementById('edit-pv-fallback').textContent=initials(name);
  const img=document.getElementById('edit-pv-img');
  const thumb=driveThumb(url);
  if(thumb){
    img.dataset.crop=efPhotoCrop?JSON.stringify(efPhotoCrop):'';
    img.style.display='';img.classList.remove('loaded');img.src=thumb;
    applyCropFromDataset(img);
  }
  else img.style.display='none';
}

function uploadStudentPhoto(input) {
  if (!input.files.length) return;
  const file=input.files[0]; input.value='';
  if(file.size>40*1024*1024){showToast('Photo is too large — try a smaller photo','error');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      cropImg=img; cropZoom=1; cropOffX=0; cropOffY=0; cropPendingFile=file;
      cropCallback=editFormCropCallback;
      cropReplaceInputId=null;
      setCropReplaceRowVisible(false);
      openModal('crop-modal');
      renderCropPreview(); initCropDrag();
      const zoomEl=document.getElementById('crop-zoom');
      zoomEl.max=cropZoomBounds().max; zoomEl.value=1;
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}

function triggerStudentDetailPhotoUpload(sk, index) {
  if (!canEdit) return;
  cropCallback=studentDetailCropCallback(sk,index);
  cropReplaceInputId=null;
  const input=document.getElementById('shared-photo-input');
  if(input){input.value='';input.click();}
}

async function saveEdit() {
  const name=v('ef-name');
  if (!name) { showToast('Name is required','error'); return; }
  const btn=document.getElementById('ef-save-btn');
  const origText=btn.textContent;
  btn.disabled=true; btn.textContent='Saving…';
  // The primary goal is the one field on this form that isn't a student column
  // any more — it goes to roster_kv with the rest of the student's goals.
  const primaryGoal=v('ef-primary-goal');
  const fields={
    name, grade:v('ef-grade'), school:v('ef-school'), birthday:v('ef-birthday'),
    notes:v('ef-notes'), photoUrl:v('ef-photoUrl'),
    status:v('ef-status')||'core', connected:connectedVal,
  };
  const {mode,sk,index}=editState;
  // Stamp the leader's local "today" when Connected is switched on, rather
  // than leave it to the server's UTC date (a day ahead on a US evening).
  const wasConnected = mode==='edit' && !!(DATA[sk].students[index]||{}).connected;
  if (fields.connected && !wasConnected) fields.lastConnected=todayISO();
  if (efThumbUrl && fields.photoUrl===efThumbFor) fields.thumbUrl=efThumbUrl;
  try {
    if (mode==='edit') {
      const person=DATA[sk].students[index];
      const params=new URLSearchParams({action:'update',payload:JSON.stringify({sheet:sk,id:person.id,rowIndex:person.rowIndex,fields})});
      const res=await fetch('/api/students/write', writeInit(params));
      const data=await res.json().catch(()=>({error:'Save failed ('+res.status+')'}));
      if (!res.ok || data.error) throw new Error(data.error||'Save failed');
      const photoChanged = fields.photoUrl!==person.photoUrl;
      Object.assign(person, fields);
      if (photoChanged) person.thumbUrl = fields.thumbUrl || null;
      // The server stamps the date when connected flips on — take its answer.
      if (data.lastConnected!==undefined) person.lastConnected=data.lastConnected;
      person.photoCrop=efPhotoCrop;
      await Promise.all([
        saveGoals(sk,person,primaryGoal,person.goals||[]),
        savePhotoCrop(sk,person.id,fields.photoUrl?efPhotoCrop:null),
        efApprentice!==!!person.apprentice ? setApprentice(sk,index,efApprentice) : null,
      ]);
      showToast('✓ Saved','ok');
    } else {
      const params=new URLSearchParams({action:'add',payload:JSON.stringify({sheet:sk,person:fields})});
      const res=await fetch('/api/students/write', writeInit(params));
      const data=await res.json().catch(()=>({error:'Save failed ('+res.status+')'}));
      if (!res.ok || data.error || !data.id) throw new Error(data.error||'Save failed');
      const person={...fields,thumbUrl:fields.thumbUrl||null,goals:[],primaryGoal:'',photoCrop:efPhotoCrop,lastConnected:data.lastConnected||''};
      if (data.newRowIndex!==undefined) person.rowIndex=data.newRowIndex;
      if (data.id) person.id=data.id;
      DATA[sk].students.push(person);
      await Promise.all([
        saveGoals(sk,person,primaryGoal,[]),
        savePhotoCrop(sk,person.id,fields.photoUrl?efPhotoCrop:null),
        efApprentice && person.id ? setApprentice(sk,DATA[sk].students.length-1,true) : null,
      ]);
      showToast('✓ Student added','ok');
    }
  } catch(e) {
    // Nothing was saved — keep the form open so the leader's edits aren't lost.
    showToast((e && e.message) || 'Could not save — check your connection and try again','error');
    btn.disabled=false; btn.textContent=origText;
    return;
  }
  renderAll(); closeEditModal(); btn.disabled=false; btn.textContent=origText;
}

function confirmDelete() {
  const {sk,index}=editState;
  const name=DATA[sk].students[index].name;
  document.getElementById('confirm-student-delete-name').textContent=name;
  openModal('confirm-student-delete-modal');
}
async function doConfirmDeleteStudent() {
  const {sk,index}=editState;
  const name=DATA[sk].students[index].name;
  const person=DATA[sk].students[index];
  const params=new URLSearchParams({action:'delete',payload:JSON.stringify({sheet:sk,id:person.id,rowIndex:person.rowIndex,studentName:name})});
  try {
    const res=await fetch('/api/students/write', writeInit(params));
    const data=await res.json().catch(()=>({error:'Delete failed ('+res.status+')'}));
    if (!res.ok || data.error) throw new Error(data.error||'Delete failed');
  } catch(e) {
    closeModal('confirm-student-delete-modal');
    showToast((e && e.message) || 'Could not remove '+name,'error');
    return;
  }
  const at=DATA[sk].students.indexOf(person);
  if (at!==-1) DATA[sk].students.splice(at,1);
  closeModal('confirm-student-delete-modal');
  renderAll(); closeEditModal(); showToast('Removed '+name,'ok');
}

`;
