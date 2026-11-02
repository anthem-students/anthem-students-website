// The sign-in gate, password reset form, and initApp(): who is signed in, what they may do, and the first roster load.
// Part of the roster's client script; see ./index.ts.
export const GATE_AND_INIT = `// ── GATE ─────────────────────────────────────────────────────
async function initGate() {
  // Check for an existing server-side session (passcode or leader)
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    if (data.user) { currentUser = data.user; canEdit = ['approved','admin','leader'].includes(currentUser.role); initApp(); return; }
  } catch(_) {}
  showScreen('gate');
  showLanes();
}

// Every gate sub-form lives in the DOM at once and is toggled by display, so
// switching between them means hiding all of them first.
const GATE_FORMS = ['gate-passcode-form','gate-leader-form','gate-forgot-form','gate-reset-form'];
function hideGateForms() {
  GATE_FORMS.forEach(id => {
    const el=document.getElementById(id);
    if (!el) return;
    el.style.display='none';
    setModalInputsEnabled(el, false);
  });
}
function openGateForm(id) {
  const la = document.getElementById('gate-lanes');
  if (la) la.style.display = 'none';
  hideGateForms();
  const el = document.getElementById(id);
  if (el) { el.style.display = 'flex'; setModalInputsEnabled(el, true); }
  return el;
}
function clearGateMsg(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent=''; el.className='gate-error'; }
}
// tone: '' (error, the default red), 'info' or 'ok'
function setGateMsg(id, text, tone) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'gate-error' + (tone ? ' ' + tone : '');
}

function showLanes() {
  hideGateForms();
  const la = document.getElementById('gate-lanes');
  if (la) la.style.display = 'flex';
  // Hide passcode lane if access mode is leaders-only
  const passcodeLane = document.getElementById('gate-lane-passcode');
  if (passcodeLane) {
    const mode = orgSettings?.accessMode || 'leaders-only';
    passcodeLane.style.display = mode === 'shared-passcode' ? '' : 'none';
  }
}

function showPasscodeForm() {
  openGateForm('gate-passcode-form');
  clearGateMsg('gate-error');
  const input = document.getElementById('gate-input');
  input.focus();
  input.onkeydown = e => { if (e.key==='Enter') checkPasscode(); };
}

function showLeaderForm() {
  openGateForm('gate-leader-form');
  clearGateMsg('gate-leader-error');
  const email = document.getElementById('gate-leader-email');
  const pw = document.getElementById('gate-leader-password');
  email.focus();
  // Enter submits from either field — previously only the password did.
  email.onkeydown = e => { if (e.key==='Enter') doGateLeaderLogin(); };
  pw.onkeydown = e => { if (e.key==='Enter') doGateLeaderLogin(); };
}

function showForgotForm() {
  openGateForm('gate-forgot-form');
  clearGateMsg('gate-forgot-error');
  // Carry over whatever they already typed on the sign-in form.
  const typed = (document.getElementById('gate-leader-email')||{}).value || '';
  const input = document.getElementById('gate-forgot-email');
  if (typed && !input.value) input.value = typed;
  input.focus();
  input.onkeydown = e => { if (e.key==='Enter') doForgotPassword(); };
}

function showResetForm(token) {
  showScreen('gate');
  resetToken = token;
  openGateForm('gate-reset-form');
  clearGateMsg('gate-reset-error');
  const pw = document.getElementById('gate-reset-password');
  const confirm = document.getElementById('gate-reset-confirm');
  pw.value=''; confirm.value='';
  confirm.onkeydown = e => { if (e.key==='Enter') doResetPassword(); };
  pw.focus();
}

// ── PASSWORD HELPERS ─────────────────────────────────────────
// The server is the authority; this only saves a round trip on an empty field.
function passwordProblem(pw) {
  return (pw||'') ? null : 'Enter a password.';
}
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.textContent = show ? 'Hide' : 'Show';
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
}

async function doForgotPassword() {
  const email = ((document.getElementById('gate-forgot-email')||{}).value||'').trim().toLowerCase();
  const btn = document.getElementById('gate-forgot-btn');
  if (!email) { setGateMsg('gate-forgot-error','Enter your email address.'); return; }
  btn.disabled=true; btn.textContent='Sending…'; clearGateMsg('gate-forgot-error');
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email}),
    });
    const data = await res.json();
    if (res.status === 429) setGateMsg('gate-forgot-error', data.error||'Too many requests. Try again later.');
    // The server answers the same way whether or not the account exists, so
    // this message can't be used to find out who has an account.
    else setGateMsg('gate-forgot-error', data.message||'If that account exists, a reset link is on its way.', 'ok');
  } catch(_) { setGateMsg('gate-forgot-error','Network error. Please try again.'); }
  btn.disabled=false; btn.textContent='Send reset link →';
}

async function doResetPassword() {
  const pw = (document.getElementById('gate-reset-password')||{}).value||'';
  const confirm = (document.getElementById('gate-reset-confirm')||{}).value||'';
  const btn = document.getElementById('gate-reset-btn');
  const problem = passwordProblem(pw);
  if (problem) { setGateMsg('gate-reset-error', problem); return; }
  if (pw !== confirm) { setGateMsg('gate-reset-error', "Those passwords don't match."); return; }

  btn.disabled=true; btn.textContent='Saving…'; clearGateMsg('gate-reset-error');
  try {
    const res = await fetch('/api/auth/reset-password', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({token: resetToken, newPassword: pw, confirmPassword: confirm}),
    });
    const data = await res.json();
    if (data.success) {
      resetToken = null;
      showLeaderForm();
      if (data.email) document.getElementById('gate-leader-email').value = data.email;
      setGateMsg('gate-leader-error','Password updated. Sign in with your new password.','ok');
      showToast('✓ Password updated','ok');
    } else {
      setGateMsg('gate-reset-error', data.error||'Could not reset your password.');
    }
  } catch(_) { setGateMsg('gate-reset-error','Network error. Please try again.'); }
  btn.disabled=false; btn.textContent='Set password →';
}

async function checkPasscode() {
  const val = document.getElementById('gate-input').value;
  const btn = document.getElementById('gate-btn');
  const err = document.getElementById('gate-error');
  btn.disabled=true; err.textContent='';
  try {
    const res = await fetch('/api/auth/passcode', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({passcode:val}),
    });
    const data = await res.json();
    if (data.ok) {
      currentUser = null; canEdit = false; // will be set by refreshCurrentUser in initApp
      initApp();
      showToast(data.message || 'View-only access enabled', 'ok');
    } else {
      err.textContent = 'Wrong passcode. Try again.';
      document.getElementById('gate-input').value = '';
      document.getElementById('gate-input').focus();
    }
  } catch(_) { err.textContent = 'Network error. Please try again.'; }
  btn.disabled=false;
}

async function doGateLeaderLogin() {
  const email = ((document.getElementById('gate-leader-email')||{}).value||'').trim().toLowerCase();
  const password = (document.getElementById('gate-leader-password')||{}).value||'';
  const btn = document.getElementById('gate-leader-btn');
  if (!email||!password) { setGateMsg('gate-leader-error','Please fill in all fields.'); return; }
  btn.disabled=true; btn.textContent='Signing in…'; clearGateMsg('gate-leader-error');
  try {
    const res = await fetch('/api/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email,password}),
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user; canEdit = ['approved','admin','leader'].includes(currentUser.role);
      await afterLogin();
      showToast('Welcome back, '+currentUser.name+'!', 'ok');
    } else {
      // A pending account isn't a failed sign-in — the password was right, the
      // request just hasn't been approved yet. Say so in a non-alarming tone.
      setGateMsg('gate-leader-error', data.error || 'Login failed.', data.reason==='pending' ? 'info' : '');
    }
  } catch(_) { setGateMsg('gate-leader-error','Network error. Please try again.'); }
  btn.disabled=false; btn.textContent='Sign In →';
}

// Shared tail for both sign-in paths (gate form and auth modal). An account
// created through an invite carries mustChangePassword — it has a password
// somebody else chose, so it can't be allowed into the app as-is.
async function afterLogin() {
  if (currentUser && currentUser.mustChangePassword) {
    openChangePassword(true);
    return;
  }
  await initApp();
}

// ── INIT ─────────────────────────────────────────────────────
async function initApp() {
  showScreen('app');
  // Whatever the browser decided to focus while the gate was on screen — an
  // autofilled login field, most of the time — has no business holding the
  // keyboard open over the roster.
  blurActiveInput();
  await refreshCurrentUser();
  await loadOrgSettings();
  await loadRoster();
  applyLastTab();
  maybeShowTour();
}

async function refreshCurrentUser() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    currentUser = data.user;
    canEdit = currentUser && ['approved','admin','leader'].includes(currentUser.role);
  } catch(e) { currentUser=null; canEdit=false; }
  updateNav();
}

function updateNav() {
  const buildRight = () => {
    if (!currentUser) {
      return '<button class="nav-btn" onclick="openAuthModal(\\'signup\\')">Sign Up</button>' +
             '<button class="nav-btn primary" onclick="openAuthModal(\\'login\\')">Log In</button>';
    }
    const adminlandBtn = currentUser.role==='admin'
      ? '<button class=\"nav-btn\" onclick=\"openAdminland()\">Adminland</button>' : '';
    const thumb = currentUser.photoUrl||null;
    const avatarInner = thumb
      ? '<img class=\"nav-avatar-img\" src=\"'+esc(thumb)+'\" alt=\"'+esc(currentUser.name||'User')+'\" onerror=\"this.style.display=\\'none\\';this.parentElement.classList.remove(\\'has-photo\\')\">'
      : initials(currentUser.name);
    // No photo yet: a dashed ring and a title that says what tapping does —
    // the profile modal is the only place a leader can add one.
    const photoClass = thumb ? ' has-photo' : (currentUser.email ? ' no-photo' : '');
    const avTitle = thumb || !currentUser.email ? currentUser.name : currentUser.name+' · Add your photo';
    return adminlandBtn + '<button class=\"nav-avatar'+photoClass+'\" onclick=\"openProfileModal()\" title=\"'+esc(avTitle)+'\">'+avatarInner+'</button>';
  };
  ['nav-right','student-nav-right'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = buildRight();
    const navImg = el.querySelector('.nav-avatar-img');
    if (navImg) navImg.onload = () => applyCropToImg(navImg, currentUser && currentUser.photoCrop);
  });
  const rb = document.getElementById('readonly-banner');
  if (rb) {
    if (!currentUser) {
      rb.style.display='flex';
      rb.querySelector('p').innerHTML='You\\'re viewing in <strong>read-only mode</strong>. Log in to edit.';
      rb.querySelector('button').style.display=''; rb.querySelector('button').textContent='Log In';
      rb.querySelector('button').onclick=()=>openAuthModal('login');
    } else if (currentUser.role==='viewer') {
      rb.style.display='flex';
      let msg = 'View-only mode.';
      if (currentUser.expiresAt) {
        const t = new Date(currentUser.expiresAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
        msg = 'View-only mode.';
      }
      rb.querySelector('p').innerHTML=msg;
      rb.querySelector('button').style.display=''; rb.querySelector('button').textContent='Leader Login';
      rb.querySelector('button').onclick=()=>openAuthModal('login');
    } else if (currentUser.role==='pending') {
      rb.style.display='flex';
      rb.querySelector('p').innerHTML='<strong>Account pending.</strong> You\\'ll get an email when approved.';
      rb.querySelector('button').style.display='none';
    } else {
      rb.style.display='none';
    }
  }
  document.querySelectorAll('.edit-gated').forEach(el => {
    el.style.display = canEdit ? '' : 'none';
  });
}

`;
