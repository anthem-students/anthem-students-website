// Toasts and modal open/close helpers.
// Part of the roster's client script; see ./index.ts.
export const UI = `// ── TOAST ─────────────────────────────────────────────────────
function showToast(msg, type='') {
  const el=document.getElementById('toast');
  el.textContent=msg;
  el.className='toast'+(type?' '+type:'');
  void el.offsetHeight;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),3000);
}

// ── MODAL HELPERS ─────────────────────────────────────────────
// Fields inside a closed modal or a hidden gate form are left disabled, so
// no browser password manager can find a login form to fill on a page the
// leader is already signed in to. See the note above .modal-overlay in css.ts
// for what that was doing on a phone.
function setModalInputsEnabled(root, enabled) {
  if (!root) return;
  root.querySelectorAll('input, textarea, select').forEach(el => { el.disabled = !enabled; });
}

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  setModalInputsEnabled(el, true);
  el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  blurActiveInput();
  // After the fade, so the fields don't visibly grey out on the way out.
  setTimeout(() => { if (!el.classList.contains('open')) setModalInputsEnabled(el, false); }, 260);
}

// A keyboard left open over the roster is the whole symptom, so it's dismissed
// at every point the app moves off a form rather than only where it was raised.
function blurActiveInput() {
  const el = document.activeElement;
  if (el && typeof el.blur === 'function' && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.blur();
}
function v(id) { return (document.getElementById(id)||{}).value?.trim()||''; }
function sv(id,val) { const el=document.getElementById(id); if(el) el.value=val; }
function setMsg(el,msg,type) { el.textContent=msg; el.className='auth-msg '+(type||''); }

`;
