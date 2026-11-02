// Primary/secondary mentors: card pills, picker, bulk select, My students, Adminland mentor hand-off.
// Part of the roster's client script; see ./index.ts.
export const MENTORS = `// ── MENTORS ──────────────────────────────────────────────────
// Each student can have a primary and an optional secondary mentor, kept in
// roster_kv (see /api/student/mentors) and delivered with everything
// else by /api/bootstrap. A mentor is either an app leader (email set —
// name and face come from the leader directory, so a rename shows up
// everywhere) or a free-text name for a volunteer who has no account.
let selectMode = false;
const selectedCards = new Set(); // 'sk:idx' — position in DATA, like the cards
let mpState = null;              // the open mentor picker: { mode, sk, idx, slot, anchor }
let mpOptions = [];              // mentors currently listed in the picker, by row
let adminMentorRows = [];        // Adminland → Mentors rows, for Replace…
let replaceFrom = null;
let replaceTargets = [];
let myStudentsRestored = false;

function mentorsOf(p) { return (p && p.mentors) || { primary:null, secondary:null }; }
// Same rule as mentorIdentity() in lib/mentors.ts — the account when there is
// one, otherwise the name, case-insensitively.
function mentorKey(m) {
  if (!m) return '';
  return m.email ? String(m.email).toLowerCase() : 'name:'+String(m.name||'').trim().toLowerCase();
}
function mentorName(m) {
  if (!m) return '';
  const l = m.email ? findLeaderByEmail(m.email) : null;
  return (l && l.name) || m.name || m.email || '';
}
function firstName(n) { return String(n||'').trim().split(/\\s+/)[0]; }
function myMentorKey() { return currentUser && currentUser.email ? String(currentUser.email).toLowerCase() : ''; }
function matchesMentorFilter(p, f) {
  const ms = mentorsOf(p);
  if (f === '__none') return !ms.primary;
  return mentorKey(ms.primary) === f || mentorKey(ms.secondary) === f;
}

// Everyone who is or could be a mentor — every leader account, plus any
// volunteer name already in use — with the students each one has.
function mentorDirectory() {
  const byKey = new Map();
  const entry = (key, m, l) => ({ key, name: mentorName(m), mentor: m, isLeader: !!l, primary: 0, secondary: 0, students: [] });
  leaderDirectory.forEach(l => {
    if (!l.email) return;
    const key = String(l.email).toLowerCase();
    byKey.set(key, entry(key, { email: key, name: l.name || l.email }, l));
  });
  ['hs','ms'].forEach(sk => (DATA[sk].students||[]).forEach((p, idx) => {
    const ms = mentorsOf(p);
    ['primary','secondary'].forEach(slot => {
      const m = ms[slot];
      if (!m) return;
      const key = mentorKey(m);
      if (!byKey.has(key)) byKey.set(key, entry(key, m, findLeaderByEmail(m.email)));
      const e = byKey.get(key);
      e[slot]++;
      e.students.push({ p, sk, idx, slot });
    });
  }));
  return [...byKey.values()].sort((a,b) => (b.isLeader - a.isLeader) || a.name.localeCompare(b.name));
}

function mentorAvatarHtml(m) {
  const name = mentorName(m);
  const l = m && m.email ? findLeaderByEmail(m.email) : null;
  const thumb = l && l.photoUrl ? (driveThumb(l.photoUrl) || l.photoUrl) : null;
  const g = GRADIENTS[((name.charCodeAt(0)||0) + name.length) % GRADIENTS.length];
  return '<span class="m-av"><span class="av-fallback" style="background:'+g+'">'+dashEsc(initials(name))+'</span>'+
    (thumb ? '<img src="'+dashEsc(thumb)+'" alt="" data-leader-email="'+dashEsc(l.email)+'" onerror="this.style.display=\\'none\\'">' : '')+
    '</span>';
}
// Leader photos carry crop metadata like everyone else's — apply it once the
// image has its natural size.
function wireMentorImgs(root) {
  root.querySelectorAll('.m-av img[data-leader-email]').forEach(img => {
    const l = findLeaderByEmail(img.dataset.leaderEmail);
    const done = () => { img.classList.add('loaded'); applyCropToImg(img, l && l.photoCrop); };
    if (img.complete && img.naturalWidth) done(); else img.onload = done;
  });
}

// The pill row on a roster card. The primary gets the full name, a secondary
// just a first name in a quieter pill, so two of them still fit a phone card.
function mentorRowHtml(person, sk, idx) {
  const ms = mentorsOf(person);
  const pill = (m, slot) => {
    const name = mentorName(m);
    const inner = mentorAvatarHtml(m)+'<span class="mentor-pill-name">'+dashEsc(slot === 'secondary' ? firstName(name) : name)+'</span>';
    const title = (slot === 'primary' ? 'Primary' : 'Secondary')+' mentor: '+dashEsc(name);
    const cls = 'mentor-pill'+(slot === 'secondary' ? ' secondary' : '');
    return canEdit
      ? '<button type="button" class="'+cls+'" title="'+title+'" onkeydown="event.stopPropagation()" '+
        'onclick="openMentorPicker(event,\\''+sk+'\\','+idx+',\\''+slot+'\\')">'+inner+'</button>'
      : '<span class="'+cls+'" title="'+title+'">'+inner+'</span>';
  };
  if (!ms.primary) {
    return canEdit
      ? '<button type="button" class="mentor-pill empty" onkeydown="event.stopPropagation()" '+
        'onclick="openMentorPicker(event,\\''+sk+'\\','+idx+',\\'primary\\')">+ Mentor</button>'
      : '';
  }
  return pill(ms.primary, 'primary') + (ms.secondary ? pill(ms.secondary, 'secondary') : '');
}

function mentorChipHtml(person, sk, idx) {
  const ms = mentorsOf(person);
  const text = ms.primary
    ? '👤 Mentor: '+dashEsc(mentorName(ms.primary))+(ms.secondary ? ' · '+dashEsc(mentorName(ms.secondary)) : '')
    : '👤 No mentor yet';
  if (!canEdit) return ms.primary ? '<div class="chip" id="sd-mentor-chip">'+text+'</div>' : '';
  return '<button class="chip chip-toggle" id="sd-mentor-chip" title="Change mentor" '+
    'onclick="openMentorPicker(event,\\''+sk+'\\','+idx+',\\'primary\\')">'+text+'</button>';
}

// Repaints just this student's mentor surfaces — same reasoning as
// paintConnected(): with the Mentor filter on, rebuilding the grid would pull
// the card out from under the tap.
function paintMentors(sk, idx) {
  const person = (DATA[sk].students||[])[idx];
  if (!person) return;
  const card = document.querySelector('.card[data-sk="'+sk+'"][data-idx="'+idx+'"]');
  const row = card && card.querySelector('.mentor-row');
  if (row) { row.innerHTML = mentorRowHtml(person, sk, idx); wireMentorImgs(row); }
  if (currentStudentKey && currentStudentKey.sk===sk && currentStudentKey.index===idx) {
    const chip = document.getElementById('sd-mentor-chip');
    if (chip) chip.outerHTML = mentorChipHtml(person, sk, idx);
  }
}

// ── Mentor picker ──
function isMentorPickerOpen() {
  const pop = document.getElementById('mp-popover');
  return !!(pop && pop.classList.contains('open'));
}
function openMentorPicker(e, sk, idx, slot) {
  if (e) e.stopPropagation();
  if (!canEdit) return;
  const person = (DATA[sk].students||[])[idx];
  if (!person) return;
  mpState = { mode:'single', sk, idx, slot: slot || 'primary', anchor: e && e.currentTarget };
  showMentorPicker(person.name);
}
function openBulkMentorPicker(e) {
  if (e) e.stopPropagation();
  if (!selectedCards.size) { showToast('Select some students first'); return; }
  mpState = { mode:'bulk', slot:'primary', anchor: document.getElementById('bulk-assign-btn') };
  showMentorPicker(selectedCards.size+' student'+(selectedCards.size === 1 ? '' : 's'));
}
function showMentorPicker(title) {
  closeDatePicker();
  document.getElementById('mp-title').textContent = 'Mentor · '+title;
  const search = document.getElementById('mp-search');
  search.value = '';
  setMentorSlot(mpState.slot);
  document.getElementById('mp-popover').classList.add('open');
  positionMentorPicker();
  // Only reach for the keyboard where there is a real one — on a phone it
  // would cover half the list before anyone asked to search.
  if (window.matchMedia('(hover: hover)').matches) search.focus();
}
function closeMentorPicker() {
  const pop = document.getElementById('mp-popover');
  if (pop) pop.classList.remove('open');
  mpState = null;
}
function positionMentorPicker() {
  const pop = document.getElementById('mp-popover');
  if (!pop || !mpState) return;
  // A bottom sheet on phones (see css.ts) — nothing to place.
  if (window.matchMedia('(max-width: 680px)').matches) { pop.style.top = ''; pop.style.left = ''; return; }
  const a = mpState.anchor;
  if (!a || !a.isConnected) return;
  const r = a.getBoundingClientRect();
  const popW = 300, popH = pop.offsetHeight || 420;
  let top = r.bottom + 6, left = r.left;
  if (top + popH > window.innerHeight - 12) top = r.top - popH - 6;
  if (top < 12) top = 12;
  if (left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
  if (left < 12) left = 12;
  pop.style.top = top + 'px';
  pop.style.left = left + 'px';
}
function setMentorSlot(slot) {
  if (!mpState) return;
  mpState.slot = slot;
  document.getElementById('mp-slot-primary').classList.toggle('active', slot === 'primary');
  document.getElementById('mp-slot-secondary').classList.toggle('active', slot === 'secondary');
  renderMentorPicker();
}
function renderMentorPicker() {
  if (!mpState) return;
  const q = (document.getElementById('mp-search').value || '').trim();
  const ql = q.toLowerCase();
  const person = mpState.mode === 'single' ? DATA[mpState.sk].students[mpState.idx] : null;
  const ms = person ? mentorsOf(person) : { primary:null, secondary:null };
  const slot = mpState.slot, other = slot === 'primary' ? 'secondary' : 'primary';
  const currentKey = mentorKey(ms[slot]), otherKey = mentorKey(ms[other]);
  const dir = mentorDirectory();
  const shown = dir.filter(m => !ql || m.name.toLowerCase().includes(ql));
  mpOptions = shown.map(m => m.mentor);

  let html = shown.map((m, i) =>
    '<button type="button" class="mp-option'+(m.key === currentKey ? ' current' : '')+'" onclick="pickMentor('+i+')">'+
      mentorAvatarHtml(m.mentor)+
      '<span class="mp-opt-name">'+dashEsc(m.name)+'</span>'+
      (m.mentor.email ? '' : '<span class="mp-tag">volunteer</span>')+
      (m.key === otherKey ? '<span class="mp-tag">'+other+'</span>' : '')+
      '<span class="mp-opt-count" title="Primary mentor for '+m.primary+' student'+(m.primary === 1 ? '' : 's')+'">'+m.primary+'</span>'+
    '</button>'
  ).join('');
  if (q && !dir.some(m => m.name.toLowerCase() === ql)) {
    html += '<button type="button" class="mp-option mp-free" onclick="pickMentor(-1)">'+
      '<span class="m-av mp-plus">+</span><span class="mp-opt-name">Use “'+dashEsc(q.slice(0,60))+'”</span>'+
      '<span class="mp-tag">volunteer</span></button>';
  }
  if (!html) html = '<div class="mp-empty">No leaders yet — type a name to add a volunteer.</div>';
  const list = document.getElementById('mp-list');
  list.innerHTML = html;
  wireMentorImgs(list);

  const acts = [];
  if (mpState.mode === 'single') {
    if (ms[slot]) acts.push('<button type="button" class="mp-act danger" onclick="pickMentor(null)">Remove '+slot+'</button>');
    if (ms.primary && ms.secondary) acts.push('<button type="button" class="mp-act" onclick="swapMentors()">Swap primary ↔ secondary</button>');
  } else {
    acts.push('<button type="button" class="mp-act danger" onclick="pickMentor(null)">Clear '+slot+' for all</button>');
  }
  document.getElementById('mp-actions').innerHTML = acts.join('');
}
// Enter takes the top match, or the typed name when nothing matches.
function mentorSearchKey(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (mpOptions.length) pickMentor(0);
  else if ((e.target.value || '').trim()) pickMentor(-1);
}
// i: a row in mpOptions, -1 for the typed free-text name, null to clear.
function pickMentor(i) {
  if (!mpState) return;
  let m = null;
  if (i === -1) {
    const name = (document.getElementById('mp-search').value || '').trim().slice(0,60);
    if (!name) return;
    m = { email:null, name };
  } else if (i !== null) {
    m = mpOptions[i] || null;
    if (!m) return;
  }
  const { mode, sk, idx, slot } = mpState;
  closeMentorPicker();
  if (mode === 'bulk') bulkAssignMentor(slot, m);
  else assignMentor(sk, idx, slot, m);
}
function assignMentor(sk, idx, slot, m) {
  const person = DATA[sk].students[idx];
  if (!person) return;
  const before = mentorsOf(person);
  const other = slot === 'primary' ? 'secondary' : 'primary';
  const next = { primary: before.primary, secondary: before.secondary };
  // Picking whoever already holds the other slot trades places with them
  // rather than listing the same person twice.
  if (m && mentorKey(m) === mentorKey(before[other])) next[other] = before[slot];
  next[slot] = m;
  if (!next.primary && next.secondary) { next.primary = next.secondary; next.secondary = null; }
  saveMentors(sk, idx, next, before);
}
function swapMentors() {
  if (!mpState || mpState.mode !== 'single') return;
  const { sk, idx } = mpState;
  const before = mentorsOf(DATA[sk].students[idx]);
  closeMentorPicker();
  saveMentors(sk, idx, { primary: before.secondary, secondary: before.primary }, before);
}
async function saveMentors(sk, idx, next, before) {
  const person = DATA[sk].students[idx];
  person.mentors = next;
  paintMentors(sk, idx);
  try {
    const res = await fetch('/api/student/mentors', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ sk, id: person.id, studentName: person.name, primary: next.primary, secondary: next.secondary }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'save failed');
    if (d.mentors) person.mentors = d.mentors;
    paintMentors(sk, idx);
    populateFilterDropdowns();
    showToast(next.primary ? 'Mentor saved' : 'Mentor removed', 'ok');
  } catch (e) {
    person.mentors = before;
    paintMentors(sk, idx);
    showToast('Couldn’t save mentor — '+e.message, 'error');
  }
}

// ── Bulk select ──
function toggleSelectMode(force) {
  selectMode = typeof force === 'boolean' ? force : !selectMode;
  if (!selectMode) {
    selectedCards.clear();
    document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
    if (mpState && mpState.mode === 'bulk') closeMentorPicker();
  }
  document.body.classList.toggle('select-mode', selectMode);
  document.querySelectorAll('.select-btn').forEach(b => { b.textContent = selectMode ? 'Cancel' : 'Select'; });
  updateBulkBar();
}
function toggleCardSelected(sk, idx, card) {
  const key = sk+':'+idx;
  if (selectedCards.has(key)) selectedCards.delete(key); else selectedCards.add(key);
  if (card) card.classList.toggle('selected', selectedCards.has(key));
  updateBulkBar();
}
function selectAllShown() {
  document.querySelectorAll('.tab-panel.active .card').forEach(c => {
    selectedCards.add(c.dataset.sk+':'+c.dataset.idx);
    c.classList.add('selected');
  });
  updateBulkBar();
}
function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  if (!bar) return;
  bar.classList.toggle('open', selectMode);
  document.getElementById('bulk-count').textContent = selectedCards.size+' selected';
  document.getElementById('bulk-assign-btn').disabled = !selectedCards.size;
  const ab = document.getElementById('bulk-apprentice-btn');
  if (ab) {
    const picked = [...selectedCards].map(k => { const [sk, i] = k.split(':'); return (DATA[sk].students||[])[+i]; }).filter(Boolean);
    ab.disabled = !picked.length;
    ab.textContent = picked.length && picked.every(p => p.apprentice) ? 'Unmark apprentice' : '🌱 Mark apprentice';
  }
}
async function bulkAssignMentor(slot, m) {
  const students = [...selectedCards].map(k => {
    const [sk, i] = k.split(':');
    const p = (DATA[sk].students||[])[+i];
    return p && p.id ? { sk, id: p.id } : null;
  }).filter(Boolean);
  if (!students.length) return;
  try {
    const res = await fetch('/api/student/mentors', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ slot, mentor: m, students }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'save failed');
    const updated = d.updated || {};
    ['hs','ms'].forEach(sk => (DATA[sk].students||[]).forEach(p => {
      const u = updated[sk+':'+p.id];
      if (u) p.mentors = { primary: u.primary || null, secondary: u.secondary || null };
    }));
    const n = Object.keys(updated).length;
    toggleSelectMode(false);
    renderAll();
    showToast(m
      ? mentorName(m)+' is now '+slot+' mentor for '+n+' student'+(n === 1 ? '' : 's')
      : 'Cleared the '+slot+' mentor for '+n+' student'+(n === 1 ? '' : 's'), 'ok');
  } catch (e) {
    showToast('Couldn’t assign mentor — '+e.message, 'error');
  }
}

// ── "My students" ──
function isMyStudentsOn() {
  const me = myMentorKey();
  const el = document.getElementById('filter-mentor');
  return !!me && !!el && el.value === me;
}
function toggleMyStudents() {
  const me = myMentorKey();
  const el = document.getElementById('filter-mentor');
  if (!me || !el) return;
  el.value = isMyStudentsOn() ? '' : me;
  onMentorFilterChange();
}
function onMentorFilterChange() {
  saveMyStudents(isMyStudentsOn());
  applyFilters();
}
function saveMyStudents(on) {
  try { localStorage.setItem('asm-my-students', on ? '1' : ''); } catch (e) {}
}
// Once per page load: a leader who left "My students" on comes back to it.
function restoreMyStudents() {
  if (myStudentsRestored || !myMentorKey()) return;
  myStudentsRestored = true;
  let saved = '';
  try { saved = localStorage.getItem('asm-my-students') || ''; } catch (e) {}
  const el = document.getElementById('filter-mentor');
  if (saved && el && !el.value) el.value = myMentorKey();
}
function hasActiveFilters() {
  return ['roster-search','filter-grade','filter-school','filter-connected','filter-status','filter-mentor','filter-apprentice','filter-sort']
    .some(id => { const el = document.getElementById(id); return !!(el && el.value); });
}

// ── Adminland → Mentors ──
// Derived from DATA like the stats dashboard: who carries how many students,
// how many of those still need a parent connection or have no hangout logged,
// and who has nobody at all.
async function loadAdminMentors() {
  const el = document.getElementById('admin-mentors-content');
  if (!el) return;
  await loadLeaderDirectory();
  const all = getAllStudents();
  const unassigned = all.filter(p => !mentorsOf(p).primary).map(p => ({ p, sk: p._sk }));
  adminMentorRows = mentorDirectory().sort((a,b) => (b.primary - a.primary) || (b.secondary - a.secondary) || a.name.localeCompare(b.name));
  const needs = list => list.filter(s => connectionState(s.p) !== 'connected').length;
  const noHangouts = list => interactionCountsOk ? String(list.filter(s => !s.p.interactionCount).length) : '—';
  const split = list => list.filter(s => s.sk === 'hs').length+' · '+list.filter(s => s.sk === 'ms').length;
  const apprentices = list => list.filter(s => s.p.apprentice).length;
  const mentored = all.length - unassigned.length;
  const active = adminMentorRows.filter(m => m.primary > 0).length;

  const row = (avatar, name, tag, primary, secondary, list, actions, cls) =>
    '<tr'+(cls ? ' class="'+cls+'"' : '')+'><td class="avatar-cell">'+avatar+'</td>'+
    '<td><div class="am-name">'+name+'</div>'+(tag ? '<div class="am-tag">'+tag+'</div>' : '')+'</td>'+
    '<td class="am-num">'+primary+'</td><td class="am-num">'+secondary+'</td>'+
    '<td class="am-num">'+split(list)+'</td><td class="am-num">'+apprentices(list)+'</td><td class="am-num">'+needs(list)+'</td><td class="am-num">'+noHangouts(list)+'</td>'+
    '<td><div class="btn-row">'+actions+'</div></td></tr>';

  el.innerHTML =
    '<div class="kpi-grid am-kpis">'+
      kpi(mentored+'/'+all.length,'Have a Mentor')+kpi(unassigned.length,'Unassigned')+
      kpi(active,'Active Mentors')+kpi(active ? (mentored/active).toFixed(1) : '0','Avg per Mentor')+
    '</div>'+
    '<table class="user-table am-table"><thead><tr><th></th><th>Mentor</th><th>Primary</th><th>Secondary</th><th>HS · MS</th><th>Apprentices</th><th>Need parent conn.</th><th>No hangouts</th><th></th></tr></thead><tbody>'+
    row('<span class="m-av am-av mp-plus">?</span>', 'No primary mentor', 'Needs someone', unassigned.length, '—', unassigned,
      unassigned.length ? '<button class="role-btn mk-admin" onclick="viewMentorStudents(\\'__none\\')">View</button>' : '', 'am-unassigned')+
    adminMentorRows.map((m, i) => {
      const total = m.primary + m.secondary;
      const tag = m.isLeader ? 'Leader' : (m.mentor.email ? 'No longer a leader' : 'Volunteer');
      const actions = total
        ? '<button class="role-btn mk-admin" onclick="viewMentorRow('+i+')">View</button>'+
          '<button class="role-btn revoke" onclick="openReplaceMentor('+i+')">Replace…</button>'
        : '';
      return row(mentorAvatarHtml(m.mentor).replace('class="m-av"','class="m-av am-av"'), dashEsc(m.name), tag,
        m.primary, m.secondary, m.students, actions, total ? '' : 'am-idle');
    }).join('')+
    '</tbody></table>';
  wireMentorImgs(el);
}
// By row rather than by key in the markup — a volunteer's key is their typed
// name, which can carry any quote character.
function viewMentorRow(i) { const m = adminMentorRows[i]; if (m) viewMentorStudents(m.key); }
function viewMentorStudents(key) {
  showScreen('app');
  switchMainNav('roster', document.querySelector('.nav-pill[onclick*="roster"]'));
  populateFilterDropdowns();
  const el = document.getElementById('filter-mentor');
  if (el) el.value = key;
  onMentorFilterChange();
}
function openReplaceMentor(i) {
  const m = adminMentorRows[i];
  if (!m) return;
  replaceFrom = m;
  const total = m.primary + m.secondary;
  document.getElementById('mr-sub').textContent = m.name+' · '+total+' student'+(total === 1 ? '' : 's');
  replaceTargets = mentorDirectory().filter(x => x.key !== m.key);
  const sel = document.getElementById('mr-to');
  sel.innerHTML = '<option value="">Choose…</option>'+
    replaceTargets.map((x, j) => '<option value="'+j+'">'+dashEsc(x.name)+(x.mentor.email ? '' : ' (volunteer)')+' — '+x.primary+' now</option>').join('')+
    '<option value="__new">Someone else (type a name)…</option>'+
    '<option value="__none">Nobody — leave them unassigned</option>';
  document.getElementById('mr-name').value = '';
  openModal('mentor-replace-modal');
  document.getElementById('mr-slot-primary').checked = m.primary > 0;
  document.getElementById('mr-slot-secondary').checked = m.secondary > 0;
  onReplaceTargetChange();
}
function onReplaceTargetChange() {
  const v = document.getElementById('mr-to').value;
  document.getElementById('mr-name-field').style.display = v === '__new' ? '' : 'none';
}
async function saveReplaceMentor() {
  if (!replaceFrom) return;
  const v = document.getElementById('mr-to').value;
  let to;
  if (!v) { showToast('Pick who should take them', 'error'); return; }
  if (v === '__none') to = null;
  else if (v === '__new') {
    const name = document.getElementById('mr-name').value.trim();
    if (!name) { showToast('Type a name', 'error'); return; }
    to = { email:null, name };
  } else to = replaceTargets[+v].mentor;
  const slots = ['primary','secondary'].filter(s => document.getElementById('mr-slot-'+s).checked);
  if (!slots.length) { showToast('Pick primary, secondary, or both', 'error'); return; }

  const btn = document.getElementById('mr-save');
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/mentors/replace', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ from: replaceFrom.key, to, slots }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'replace failed');
    // Re-read every mentor rather than patching locally — the server may have
    // touched students this tab hasn't loaded the latest of.
    const extras = await fetch('/api/bootstrap').then(r => r.ok ? r.json() : null).catch(() => null);
    if (extras) { applyBootstrapExtras(extras); renderAll(); }
    closeModal('mentor-replace-modal');
    loadAdminMentors();
    showToast('Moved '+d.changed+' student'+(d.changed === 1 ? '' : 's')+' to '+(to ? mentorName(to) : 'unassigned'), 'ok');
  } catch (e) {
    showToast('Couldn’t replace — '+e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

`;
