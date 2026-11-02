// Auth modal, change password and the leader's own profile modal.
// Part of the roster's client script; see ./index.ts.
export const ACCOUNT = `// ── AUTH MODAL ───────────────────────────────────────────────
function openAuthModal(tab='login') { switchAuthTab(tab); openModal('auth-modal'); }
function closeAuthModal() { closeModal('auth-modal'); }
function switchAuthTab(tab) {
  // The success panel replaces the signup form after a request goes through;
  // switching tabs puts the form back.
  document.getElementById('auth-signup-done').style.display = 'none';
  document.getElementById('auth-login-form').style.display  = tab==='login'  ? 'flex' : 'none';
  document.getElementById('auth-signup-form').style.display = tab==='signup' ? 'flex' : 'none';
  document.getElementById('tab-login-btn').classList.toggle('active', tab==='login');
  document.getElementById('tab-signup-btn').classList.toggle('active', tab==='signup');
  document.getElementById('auth-modal-title').textContent = tab==='login' ? 'Welcome Back' : 'Request Access';
  ['login-msg','signup-msg'].forEach(id => { const el=document.getElementById(id); el.textContent=''; el.className='auth-msg'; });
}

// ── CHANGE PASSWORD ──────────────────────────────────────────
// forced=true is the invite path: the account has a password someone else
// chose, so the modal can't be dismissed until it's replaced.
let passwordChangeForced = false;
function openChangePassword(forced) {
  passwordChangeForced = !!forced;
  ['pw-old','pw-new','pw-confirm'].forEach(id => { document.getElementById(id).value=''; });
  const msg = document.getElementById('pw-msg'); msg.textContent=''; msg.className='auth-msg';
  document.getElementById('password-modal-title').textContent = forced ? 'Set Your Own Password' : 'Change Password';
  document.getElementById('password-modal-sub').textContent = forced
    ? 'This account was set up with a temporary password. Choose your own to continue.'
    : 'Choose a new password for your account';
  document.getElementById('password-modal-close').style.display = forced ? 'none' : '';
  openModal('password-modal');
}

async function doChangePassword() {
  const oldPassword=v('pw-old'), newPassword=v('pw-new'), confirmPassword=v('pw-confirm');
  const msg=document.getElementById('pw-msg'), btn=document.getElementById('pw-submit');
  if (!oldPassword||!newPassword||!confirmPassword) { setMsg(msg,'Please fill in all fields.','error'); return; }
  const problem = passwordProblem(newPassword);
  if (problem) { setMsg(msg, problem, 'error'); return; }
  if (newPassword!==confirmPassword) { setMsg(msg,"Those passwords don't match.",'error'); return; }

  btn.disabled=true; btn.textContent='Updating…'; msg.textContent='';
  try {
    const res = await fetch('/api/auth/change-password', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({oldPassword,newPassword,confirmPassword}),
    });
    const data = await res.json();
    if (data.success) {
      closeModal('password-modal');
      showToast('✓ Password updated','ok');
      if (passwordChangeForced) { passwordChangeForced=false; await initApp(); }
    } else setMsg(msg, data.error||'Could not update your password.','error');
  } catch(_) { setMsg(msg,'Network error. Please try again.','error'); }
  btn.disabled=false; btn.textContent='Update Password';
}

async function doLogin() {
  const email = v('login-email').trim().toLowerCase(), password = v('login-password');
  const msg = document.getElementById('login-msg');
  const btn = document.getElementById('login-submit');
  if (!email||!password) { setMsg(msg,'Please fill in all fields.','error'); return; }
  btn.disabled=true; btn.textContent='Logging in…'; msg.textContent='';
  try {
    const res = await fetch('/api/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email,password}),
    });
    const data = await res.json();
    btn.disabled=false; btn.textContent='Log In';
    if (data.success) {
      currentUser=data.user; canEdit=['approved','admin','leader'].includes(currentUser.role);
      closeAuthModal();
      // Same entry point the gate's Sign In uses. This branch used to call
      // renderAll() directly, which drew the empty in-memory DATA and left the
      // roster reading "No students here yet" until the page was reloaded —
      // loadRoster() is only ever called from initApp().
      await afterLogin();
      showToast('✓ Welcome back, '+currentUser.name+'!','ok');
    } else setMsg(msg, data.error||'Login failed.','error');
  } catch(_) {
    btn.disabled=false; btn.textContent='Log In';
    setMsg(msg,'Network error. Please try again.','error');
  }
}

async function doSignup() {
  const name=v('signup-name').trim(), email=v('signup-email').trim().toLowerCase(), password=v('signup-password');
  const msg=document.getElementById('signup-msg'), btn=document.getElementById('signup-submit');
  if (!name||!email||!password) { setMsg(msg,'Please fill in all fields.','error'); return; }
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) { setMsg(msg,'That email address doesn\\'t look right.','error'); return; }
  const problem = passwordProblem(password);
  if (problem) { setMsg(msg, problem, 'error'); return; }

  btn.disabled=true; btn.textContent='Sending…'; msg.textContent='';
  try {
    const res = await fetch('/api/auth/signup', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name,email,password}),
    });
    const data = await res.json();
    btn.disabled=false; btn.textContent='Request Access';
    if (data.success) {
      // Swap the filled-in form for a confirmation, so it's obvious the
      // request went somewhere and there's nothing left to do.
      ['signup-name','signup-email','signup-password'].forEach(id=>{ document.getElementById(id).value=''; });
      document.getElementById('auth-signup-form').style.display='none';
      document.getElementById('auth-done-body').textContent = data.message || "A team admin will review it. You'll get an email as soon as it's approved.";
      document.getElementById('auth-signup-done').style.display='flex';
    } else setMsg(msg,data.error||'Could not send your request.','error');
  } catch(_) {
    btn.disabled=false; btn.textContent='Request Access';
    setMsg(msg,'Network error. Please try again.','error');
  }
}

async function logout() {
  await fetch('/api/auth/logout',{method:'POST'});
  currentUser=null; canEdit=false;
  showScreen('gate'); showLanes();
  showToast('Logged out');
}

// ── PROFILE MODAL ─────────────────────────────────────────────
function openProfileModal() {
  if (!currentUser) { openAuthModal('login'); return; }
  document.getElementById('profile-av-initials').textContent = initials(currentUser.name);
  document.getElementById('profile-display-name').textContent = currentUser.name;
  document.getElementById('profile-display-email').textContent = currentUser.email;
  sv('profile-name-input', currentUser.name||'');
  sv('profile-since-input', currentUser.leaderSince||'');
  sv('profile-funfact-input', currentUser.funFact||'');
  paintProfileAvatar();
  openModal('profile-modal');
}

// Everything in the profile modal that depends on whether there's a photo.
function paintProfileAvatar() {
  if (!currentUser) return;
  const has=!!currentUser.photoUrl;
  const img=document.getElementById('profile-av-img');
  const thumb=driveThumb(currentUser.photoUrl);
  if(img){
    if(thumb){
      img.dataset.crop=currentUser.photoCrop?JSON.stringify(currentUser.photoCrop):'';
      if(img.getAttribute('src')!==thumb){ img.classList.remove('loaded'); img.src=thumb; }
      img.style.display='';
      applyCropFromDataset(img); // same src → onload won't refire
    } else {
      img.style.display='none'; img.removeAttribute('src'); img.classList.remove('loaded');
    }
  }
  const show=(id,on)=>{ const el=document.getElementById(id); if(el) el.style.display=on?'':'none'; };
  show('profile-remove-photo-btn', has);
  show('profile-photo-hint', !has);
  const label=document.getElementById('profile-photo-label');
  if(label) label.textContent=has?'📸 Change Photo':'📸 Add Photo';
}
// The avatar itself is the obvious thing to tap.
function profileAvatarClick() {
  if (currentUser && currentUser.photoUrl) recropProfilePhoto();
  else { const input=document.getElementById('profile-photo-input'); if(input) input.click(); }
}
async function removeProfilePhoto() {
  if (await saveOwnPhoto('', null)) showToast('Photo removed','ok');
}
function closeProfileModal() { closeModal('profile-modal'); }

async function saveProfile() {
  if (!currentUser) return;
  const name=v('profile-name-input'), leaderSince=v('profile-since-input'), funFact=v('profile-funfact-input');
  const res=await fetch('/api/profile/update',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name,leaderSince,funFact}),
  });
  const data=await res.json();
  if (data.success) {
    Object.assign(currentUser,{name,leaderSince,funFact});
    updateNav(); closeProfileModal(); showToast('✓ Profile updated','ok');
  } else showToast(data.error||'Update failed','error');
}

function uploadProfilePhoto(input) {
  if (!input.files.length) return;
  const file=input.files[0]; input.value='';
  if(file.size>40*1024*1024){showToast('Photo is too large — try a smaller photo','error');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      cropImg=img; cropZoom=1; cropOffX=0; cropOffY=0; cropPendingFile=file;
      cropCallback=profileCropCallback;
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

`;
