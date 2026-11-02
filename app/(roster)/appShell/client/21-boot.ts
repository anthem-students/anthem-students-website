// DOMContentLoaded: wires global listeners and starts the app.
// Part of the roster's client script; see ./index.ts.
export const BOOT = `// ── BOOT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Theme
  initTheme();

  // Auto-year
  const yr = new Date().getFullYear();
  ['year-gate','year-sub','year-footer','year-auth'].forEach(id => {
    const el=document.getElementById(id); if(el) el.textContent=yr;
  });
  ['year-nav','year-student-nav'].forEach(id => {
    const el=document.getElementById(id); if(el) el.textContent='\u00a0'+yr;
  });

  // Load org settings for branding (before gate)
  loadOrgSettings();
  loadLeaderDirectory();

  // Swipe back
  initSwipeBack();

  // Wire up modal close-on-backdrop for ALL modals, and make sure every closed
  // one starts with its fields switched off — the markup already says so for
  // the credential fields, this covers the rest.
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => { if(e.target===el) dismissModal(el.id); });
    if (!el.classList.contains('open')) setModalInputsEnabled(el, false);
  });
  hideGateForms();

  // Chrome fires this instead of showing its own install bar; holding onto it
  // is what turns "Save As App" into one tap rather than three written steps.
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });
  window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; });

  // Returning to a backgrounded home-screen app must never come back with a
  // keyboard up over the roster.
  window.addEventListener('pageshow', blurActiveInput);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !document.querySelector('.modal-overlay.open')) blurActiveInput();
  });
  // Wire up ef-name input preview
  const efName=document.getElementById('ef-name');
  if(efName) efName.addEventListener('input',updateEditPhotoPreview);
  // Enter key to add goals
  const goalInput=document.getElementById('new-goal-input');
  if(goalInput) goalInput.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();addGoal();} });
  // Escape key to close topmost modal
  document.addEventListener('keydown', e => {
    if(e.key==='Escape'){
      const dp=document.getElementById('dp-popover');
      if(dp && dp.classList.contains('open')){ closeDatePicker(); return; }
      if(isMentorPickerOpen()){ closeMentorPicker(); return; }
      const open=document.querySelector('.modal-overlay.open');
      if(open) dismissModal(open.id);
    }
  });

  // Date picker: click/focus a .dp-input to open it, Enter/Space too since
  // it's readonly and gives the native click nothing to fire from on
  // keyboard-only navigation. Click-away and window resize close it; a
  // scroll closes it too (capture:true so it also catches scrolling inside
  // a modal's own overflow, which never bubbles) rather than trying to keep
  // a fixed-position popover glued to an input that just moved.
  document.addEventListener('click', e => {
    const inp = e.target.closest && e.target.closest('.dp-input');
    if (inp) { openDatePicker(inp); return; }
    const pop = document.getElementById('dp-popover');
    if (pop && pop.classList.contains('open') && !pop.contains(e.target)) closeDatePicker();
    const mp = document.getElementById('mp-popover');
    if (mp && mp.classList.contains('open') && !mp.contains(e.target)) closeMentorPicker();
  });
  window.addEventListener('resize', () => { if (isMentorPickerOpen()) positionMentorPicker(); });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('dp-input')) {
      e.preventDefault();
      openDatePicker(e.target);
    }
  });
  document.addEventListener('scroll', e => {
    const pop = document.getElementById('dp-popover');
    if (pop && pop.classList.contains('open')) closeDatePicker();
    // The mentor picker's own list scrolls, and on a phone it's a bottom sheet
    // that doesn't follow anything — only a desktop page scroll strands it.
    const mp = document.getElementById('mp-popover');
    if (mp && isMentorPickerOpen() && !mp.contains(e.target) && !window.matchMedia('(max-width: 680px)').matches) closeMentorPicker();
  }, true);
  window.addEventListener('resize', closeDatePicker);

  // A password-reset email lands here as /?resetToken=… . Take the token into
  // memory and strip it from the address bar before anything else runs, so it
  // can't leak through browser history, a bookmark, or a Referer header.
  // ?from=roster is the marker next.config.mjs adds when redirecting the old
  // /roster URL here; it only exists to dodge a cached redirect, so drop it too.
  const params = new URLSearchParams(location.search);
  const token = params.get('resetToken');
  if (token || params.has('from')) {
    params.delete('resetToken');
    params.delete('from');
    const query = params.toString();
    history.replaceState({}, '', location.pathname + (query ? '?' + query : ''));
  }
  if (token) {
    showResetForm(token);
    return;
  }

  initGate();
});
`;
