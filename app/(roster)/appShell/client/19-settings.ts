// The admin Settings screen.
// Part of the roster's client script; see ./index.ts.
export const SETTINGS = `// ── SETTINGS PAGE (admin) ─────────────────────────────────────
async function openSettings() {
  if (!currentUser || currentUser.role !== 'admin') { showToast('Admin access required','error'); return; }
  showScreen('settings');
  showToast('Loading settings…');
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    settingsData = data.settings;
    settingsOriginal = JSON.parse(JSON.stringify(settingsData));
    populateSettingsUI();
    settingsDirty = false;
    updateSettingsSaveBtn();
    document.getElementById('settings-topbar-name').textContent = settingsData.ministryName || '';
  } catch(e) { showToast('Failed to load settings','error'); }
}

function closeSettings() {
  if (settingsDirty) {
    if (!confirm('You have unsaved changes. Discard them?')) return;
  }
  showScreen('app');
}

function switchSettingsTab(tab, btn) {
  document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
  const pane = document.getElementById('settings-'+tab);
  if (pane) pane.classList.add('active');
  document.querySelectorAll('.settings-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function markSettingsDirty() {
  settingsDirty = true;
  updateSettingsSaveBtn();
}

function updateSettingsSaveBtn() {
  const btns = [document.getElementById('settings-save-btn'), document.getElementById('settings-save-topbar')];
  btns.forEach(b => { if (b) b.disabled = !settingsDirty; });
}

function toggleSettingsSwitch(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('on');
  markSettingsDirty();
  // Special: show/hide conditional sections
  if (id === 's-logo-toggle') {
    const area = document.getElementById('s-logo-upload-area');
    if (area) area.style.display = el.classList.contains('on') ? 'flex' : 'none';
  }
  if (id === 's-auto-archive') {
    const row = document.getElementById('s-archive-weeks-row');
    if (row) row.style.display = el.classList.contains('on') ? 'block' : 'none';
  }
}

function setSettingsSwitch(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('on', on);
}

// ── Populate Settings UI from data ────────────────────────────
function populateSettingsUI() {
  const s = settingsData;
  if (!s) return;

  // General
  sv('s-ministry-name', s.ministryName || '');
  sv('s-campus', s.campus || '');
  setSettingsSwitch('s-logo-toggle', s.logoEnabled || false);
  const logoArea = document.getElementById('s-logo-upload-area');
  if (logoArea) logoArea.style.display = s.logoEnabled ? 'flex' : 'none';
  const logoImg = document.getElementById('s-logo-img');
  if (logoImg && s.logoUrl) { logoImg.src = s.logoUrl; logoImg.style.display = ''; }
  else if (logoImg) { logoImg.style.display = 'none'; }

  // Grades
  renderGradeChips(s);
  sv('s-hs-label', s.gradeTabs?.hs?.label || 'High School');
  sv('s-ms-label', s.gradeTabs?.ms?.label || 'Middle School');
  renderGradeTabChips(s);

  // Default week
  sv('s-meeting-day', s.meetingDay || 'sunday');
  sv('s-week-start', s.weekStartsOn || 'sunday');

  // Tracking
  const tr = s.tracking || {};
  setSettingsSwitch('s-track-hangoutNotes', tr.hangoutNotes !== false);
  setSettingsSwitch('s-track-tags', tr.tags || false);
  setSettingsSwitch('s-track-birthdays', tr.birthdays !== false);
  setSettingsSwitch('s-track-showGrade', tr.showGrade !== false);
  setSettingsSwitch('s-track-school', tr.school !== false);
  setSettingsSwitch('s-track-age', tr.age !== false);

  // Parent connections
  sv('s-conn-months', s.connections?.resetAfterMonths || 3);
  setSettingsSwitch('s-conn-auto-reset', s.connections?.autoReset !== false);

  // Defaults
  sv('s-default-status', s.defaults?.newStudentStatus || 'new');
  setSettingsSwitch('s-auto-archive', s.defaults?.autoArchive || false);
  sv('s-archive-weeks', s.defaults?.autoArchiveWeeks || 8);
  const archRow = document.getElementById('s-archive-weeks-row');
  if (archRow) archRow.style.display = s.defaults?.autoArchive ? 'block' : 'none';

  // Access
  const acc = s.access || {};
  const radios = document.querySelectorAll('input[name="access-mode"]');
  radios.forEach(r => { r.checked = r.value === (acc.mode || 'leaders-only'); });
  onAccessModeChange();
  sv('s-passcode', acc.passcode || '');
  sv('s-request-emails', acc.requestEmails || '');
  const perms = acc.passcodePermissions || {};
  ['viewRoster','viewAttendance','viewNotes','viewPrayer'].forEach(k => {
    const cb = document.getElementById('s-perm-'+k);
    if (cb) cb.checked = perms[k] || false;
  });

  // Appearance
  const currentTheme = localStorage.getItem('asm-theme') || 'auto';
  selectSettingsTheme(currentTheme, true);
  setSettingsSwitch('s-compact-mode', s.appearance?.compactMode || false);
  setSettingsSwitch('s-sticky-tabs', s.appearance?.stickyBottomTabs !== false);
}

// ── Grade Chips ───────────────────────────────────────────────
function renderGradeChips(s) {
  const container = document.getElementById('s-grades-chips');
  if (!container) return;
  const allGrades = [6,7,8,9,10,11,12];
  const hsGrades = s.gradeTabs?.hs?.grades || [9,10,11,12];
  const msGrades = s.gradeTabs?.ms?.grades || [6,7,8];
  const selected = [...new Set([...hsGrades, ...msGrades])];
  container.innerHTML = allGrades.map(g =>
    '<div class="s-chip'+(selected.includes(g)?' selected':'')+'" data-grade="'+g+'" onclick="toggleGradeChip(this)">Grade '+g+'</div>'
  ).join('');
}

function toggleGradeChip(el) {
  el.classList.toggle('selected');
  markSettingsDirty();
  syncGradeTabChips();
}

function renderGradeTabChips(s) {
  const hsGrades = s.gradeTabs?.hs?.grades || [9,10,11,12];
  const msGrades = s.gradeTabs?.ms?.grades || [6,7,8];
  renderGradeTabGroup('s-hs-grades', hsGrades);
  renderGradeTabGroup('s-ms-grades', msGrades);
}

function renderGradeTabGroup(containerId, grades) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = grades.map(g =>
    '<div class="s-chip selected" data-grade="'+g+'" onclick="moveGradeChip(this)">'+g+'</div>'
  ).join('');
}

function moveGradeChip(el) {
  const grade = +el.dataset.grade;
  const parent = el.parentElement;
  const isHs = parent.id === 's-hs-grades';
  const target = document.getElementById(isHs ? 's-ms-grades' : 's-hs-grades');
  if (target) {
    el.remove();
    target.appendChild(el);
    markSettingsDirty();
  }
}

function syncGradeTabChips() {
  const selected = [...document.querySelectorAll('#s-grades-chips .s-chip.selected')].map(c => +c.dataset.grade);
  const hsEl = document.getElementById('s-hs-grades');
  const msEl = document.getElementById('s-ms-grades');
  if (!hsEl || !msEl) return;
  // Keep existing assignment where possible
  const currentHs = [...hsEl.querySelectorAll('.s-chip')].map(c => +c.dataset.grade).filter(g => selected.includes(g));
  const currentMs = [...msEl.querySelectorAll('.s-chip')].map(c => +c.dataset.grade).filter(g => selected.includes(g));
  const assigned = new Set([...currentHs, ...currentMs]);
  selected.forEach(g => {
    if (!assigned.has(g)) {
      if (g >= 9) currentHs.push(g); else currentMs.push(g);
    }
  });
  renderGradeTabGroup('s-hs-grades', currentHs.sort((a,b)=>a-b));
  renderGradeTabGroup('s-ms-grades', currentMs.sort((a,b)=>a-b));
}

// ── Access Mode ───────────────────────────────────────────────
function onAccessModeChange() {
  const mode = document.querySelector('input[name="access-mode"]:checked')?.value || 'leaders-only';
  const passConfig = document.getElementById('s-passcode-config');
  const leadersInfo = document.getElementById('s-leaders-only-info');
  if (passConfig) passConfig.style.display = mode === 'shared-passcode' ? 'block' : 'none';
  if (leadersInfo) leadersInfo.style.display = mode === 'leaders-only' ? 'block' : 'none';
}

function togglePasscodeVisibility() {
  const inp = document.getElementById('s-passcode');
  const btn = inp?.parentElement?.querySelector('.s-show-pass');
  if (!inp || !btn) return;
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = 'Hide'; }
  else { inp.type = 'password'; btn.textContent = 'Show'; }
}

// ── Theme Selector (settings) ─────────────────────────────────
function selectSettingsTheme(theme, skipDirty) {
  document.querySelectorAll('.s-theme-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === theme);
  });
  applyTheme(theme);
  if (!skipDirty) markSettingsDirty();
}

// ── Logo Upload ───────────────────────────────────────────────
async function uploadSettingsLogo(input) {
  if (!input.files.length) return;
  const file = input.files[0]; input.value = '';
  showToast('Uploading logo…');
  const fd = new FormData(); fd.append('file', file, 'logo.jpg'); fd.append('type', 'logo');
  try {
    const res = await fetch('/api/upload-photo', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.url) {
      const img = document.getElementById('s-logo-img');
      if (settingsData) settingsData.logoTone = data.logoTone || settingsData.logoTone || 'light';
      if (img) { img.src = data.url; img.style.display = 'block'; img.previousElementSibling.style.display = 'none'; }
      if (settingsData) settingsData.logoUrl = data.url;
      markSettingsDirty();
      showToast('✓ Logo uploaded', 'ok');
    } else showToast(data.error || 'Upload failed', 'error');
  } catch(e) { showToast('Upload error', 'error'); }
}

function removeSettingsLogo() {
  const img = document.getElementById('s-logo-img');
  if (img) { img.src = ''; img.style.display = 'none'; img.previousElementSibling.style.display = ''; }
  if (settingsData) settingsData.logoUrl = '';
  markSettingsDirty();
}

// ── Save / Cancel ─────────────────────────────────────────────
async function saveSettings() {
  if (!settingsData) return;
  const btn = document.getElementById('settings-save-btn');
  const topBtn = document.getElementById('settings-save-topbar');
  [btn, topBtn].forEach(b => { if (b) { b.disabled = true; b.textContent = 'Saving…'; } });

  // Gather values from UI
  const s = {
    ministryName: v('s-ministry-name') || 'Anthem Students',
    campus: v('s-campus'),
    logoEnabled: document.getElementById('s-logo-toggle')?.classList.contains('on') || false,
    logoUrl: settingsData.logoUrl || '',
    logoTone: settingsData.logoTone || 'light',
    gradeTabs: {
      hs: {
        label: v('s-hs-label') || 'High School',
        grades: [...document.querySelectorAll('#s-hs-grades .s-chip')].map(c => +c.dataset.grade),
      },
      ms: {
        label: v('s-ms-label') || 'Middle School',
        grades: [...document.querySelectorAll('#s-ms-grades .s-chip')].map(c => +c.dataset.grade),
      },
    },
    meetingDay: v('s-meeting-day'),
    weekStartsOn: v('s-week-start'),
    tracking: {
      hangoutNotes: document.getElementById('s-track-hangoutNotes')?.classList.contains('on') || false,
      tags: document.getElementById('s-track-tags')?.classList.contains('on') || false,
      birthdays: document.getElementById('s-track-birthdays')?.classList.contains('on') || false,
      showGrade: document.getElementById('s-track-showGrade')?.classList.contains('on') || false,
      school: document.getElementById('s-track-school')?.classList.contains('on') || false,
      age: document.getElementById('s-track-age')?.classList.contains('on') || false,
    },
    defaults: {
      newStudentStatus: v('s-default-status') || 'new',
      autoArchive: document.getElementById('s-auto-archive')?.classList.contains('on') || false,
      autoArchiveWeeks: parseInt(v('s-archive-weeks')) || 8,
    },
    connections: {
      // Clamped rather than trusted: a 0 here would mark every family as
      // needing a connection the instant one was logged.
      resetAfterMonths: Math.min(36, Math.max(1, parseInt(v('s-conn-months')) || 3)),
      autoReset: document.getElementById('s-conn-auto-reset')?.classList.contains('on') || false,
    },
    access: {
      mode: document.querySelector('input[name="access-mode"]:checked')?.value || 'leaders-only',
      passcode: v('s-passcode'),
      requestEmails: v('s-request-emails'),
      passcodePermissions: {
        viewRoster: document.getElementById('s-perm-viewRoster')?.checked || false,
        viewAttendance: document.getElementById('s-perm-viewAttendance')?.checked || false,
        viewNotes: document.getElementById('s-perm-viewNotes')?.checked || false,
        viewPrayer: document.getElementById('s-perm-viewPrayer')?.checked || false,
      },
    },
    appearance: {
      theme: localStorage.getItem('asm-theme') || 'auto',
      compactMode: document.getElementById('s-compact-mode')?.classList.contains('on') || false,
      stickyBottomTabs: document.getElementById('s-sticky-tabs')?.classList.contains('on') || false,
    },
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    });
    const data = await res.json();
    if (data.success) {
      settingsData = data.settings || s;
      settingsOriginal = JSON.parse(JSON.stringify(settingsData));
      settingsDirty = false;
      updateSettingsSaveBtn();
      // Refresh public settings cache
      orgSettings = {
        ministryName: s.ministryName, campus: s.campus,
        logoUrl: s.logoEnabled ? s.logoUrl : '',
        logoEnabled: s.logoEnabled, gradeTabs: s.gradeTabs,
        tracking: s.tracking, connections: s.connections, appearance: s.appearance,
      };
      localStorage.setItem('asm-org-settings', JSON.stringify(orgSettings));
      applyBranding();
      document.getElementById('settings-topbar-name').textContent = s.ministryName;
      showToast('✓ Settings saved', 'ok');
    } else showToast(data.error || 'Save failed', 'error');
  } catch(e) { showToast('Network error', 'error'); }
  [btn, topBtn].forEach(b => { if (b) { b.disabled = false; b.textContent = b.id === 'settings-save-topbar' ? 'Save' : 'Save Changes'; } });
}

function cancelSettings() {
  if (!settingsOriginal) { closeSettings(); return; }
  settingsData = JSON.parse(JSON.stringify(settingsOriginal));
  populateSettingsUI();
  settingsDirty = false;
  updateSettingsSaveBtn();
  showToast('Changes reverted');
}

`;
