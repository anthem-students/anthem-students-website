// Connection status rules and the roster grid: loading students, rendering cards, inline status changes.
// Part of the roster's client script; see ./index.ts.
export const ROSTER_GRID = `// ── CONNECTION STATUS ────────────────────────────────────────
// The student's status field. Used to be three page sections; it's now a
// dropdown on every card, so a student moves between statuses without moving in the DOM.
const STATUS_LABELS = { core:'Core', loose:'Loosely Connected', fringe:'Fringe' };
const STATUS_ORDER = ['core','loose','fringe'];

// ── PARENT CONNECTION STATE ──────────────────────────────────
// Three states, not the database's two. The connected flag alone used to mean
// "connected" forever — a family reached once in September still read as connected the
// following June. So the badge is derived from the date instead:
//
//   connected  a connection on record, inside the reset window
//   stale      a connection on record, but older than the window -> needs one
//   none       no connection has ever been recorded, or a leader unticked it
//
// Deriving it (rather than only trusting the connected flag) is what lets a read-only
// viewer see the same badge as a leader, and what makes changing the window in
// Settings re-evaluate everyone the moment it's saved.
const CONNECTION_DEFAULT_MONTHS = 3;

// Same shape as STATUS_LABELS/STATUS_ORDER above — the connection field is a
// second .status-select now, so it needs a label set and an option order of
// its own. Plain text, no glyph: the status dropdown's options don't carry one
// either, and the select itself already reads as a colored chip.
const CONN_LABELS = { connected:'Family Connected With', stale:'Needs Connection', none:'Not Connected' };
const CONN_ORDER = ['connected','stale','none'];

function connectionResetMonths() {
  const n = +(orgSettings?.connections?.resetAfterMonths);
  return n > 0 ? n : CONNECTION_DEFAULT_MONTHS;
}

function connectionState(person) {
  const last = person && person.lastConnected;
  if (!last) return 'none';
  const months = monthsSince(last);
  if (months !== null && months >= connectionResetMonths()) return 'stale';
  return person.connected ? 'connected' : 'none';
}

// Everything that counts connections — the filters, the dashboard, Adminland —
// reads this rather than the raw connected flag, so a stale family is not
// counted as a connected one.
function isConnected(person) { return connectionState(person) === 'connected'; }
function statusOf(p) { return STATUS_LABELS[p.status] ? p.status : 'core'; }

// ── ROSTER ───────────────────────────────────────────────────
// One query against roster_students (see /api/students), alongside the
// per-student extras and the leader directory. Students carry a small
// thumbUrl for the first paint; the full photo upgrades in after.
async function fetchStudents() {
  try {
    const res = await fetch('/api/students');
    let data = null;
    try { data = await res.json(); } catch(_) {}
    if (!res.ok) return { error: (data && data.error) || ('The roster returned ' + res.status + '.') };
    if (!data || !data.hs || !Array.isArray(data.hs.students) || !data.ms || !Array.isArray(data.ms.students)) {
      return { error: 'The roster came back in a shape we could not read.' };
    }
    return { data };
  } catch(e) {
    return { error: 'Could not reach the server. Check your connection and try again.' };
  }
}

async function loadRoster() {
  // Students paint the moment they arrive; goals/notes/mentor pills (the
  // slower bootstrap + leader directory) fill in on a second pass. Every
  // failure is shown rather than rendered as "No students here yet", which is
  // indistinguishable from an empty roster, with a way to retry.
  const extrasReady = Promise.all([
    fetch('/api/bootstrap').then(r => r.ok ? r.json() : null).catch(() => null),
    loadLeaderDirectory(),
  ]);
  const studentsResult = await fetchStudents();
  // Selection is by position in DATA, which a fresh load can reshuffle.
  selectedCards.clear();
  if (studentsResult.error) {
    showRosterError(studentsResult.error);
    renderAll();
    return;
  }
  const data = studentsResult.data;
  DATA = data;
  showRosterError(null);
  renderAll();

  const [extras] = await extrasReady;
  // A retry or reload may have replaced DATA while this was in flight.
  if (DATA !== data) return;
  applyBootstrapExtras(extras);
  renderAll();
  sweepStaleConnections();
}

// Replaces what used to be five separate per-tab-pair fetches (goals,
// interaction counts, note counts, connection dates, photo crops) with the
// one combined /api/bootstrap response — see that route for why.
let interactionCountsOk = false;
function applyBootstrapExtras(extras) {
  interactionCountsOk = !!(extras && extras.interactionCountsOk);
  ['hs','ms'].forEach(sk => {
    const goalsMap = (extras && extras.goals && extras.goals[sk]) || {};
    const noteCountsMap = (extras && extras.noteCounts && extras.noteCounts[sk]) || {};
    const connMap = (extras && extras.connectionDates && extras.connectionDates[sk]) || {};
    const cropMap = (extras && extras.photoCrops && extras.photoCrops[sk]) || {};
    const intMap = (extras && extras.interactionCounts && extras.interactionCounts[sk]) || {};
    const mentorMap = (extras && extras.mentors && extras.mentors[sk]) || {};
    const apprenticeMap = (extras && extras.apprentices && extras.apprentices[sk]) || {};
    (DATA[sk].students||[]).forEach(p => {
      const g = goalsMap[p.id] || {};
      p.goals = g.goals || [];
      p.primaryGoal = g.primaryGoal || '';
      p.noteCount = noteCountsMap[p.id] || 0;
      // roster_students.last_connected holds one date; the connection log
      // holds all of them. Where they disagree the log wins — a leader
      // who corrected a wrong day did it there.
      const connEntry = connMap[p.id] || {};
      p.connectionCount = connEntry.count || 0;
      if (connEntry.latest) p.lastConnected = connEntry.latest;
      p.photoCrop = cropMap[p.id] || null;
      p.interactionCount = intMap[p.id] || 0;
      const mm = mentorMap[p.id] || {};
      p.mentors = { primary: mm.primary || null, secondary: mm.secondary || null };
      p.apprentice = !!apprenticeMap[p.id];
    });
  });
}

// Puts the stored Connected flag back in step with what the app is already
// showing. A student whose last connection has aged past the window reads
// "Needs Connection" whatever the flag says, so leaving it set only means the
// counts and filters that read the raw flag disagree with the badge.
//
// Runs once per load, only for a session that can write, and only over students
// who are actually out of step — normally that's nobody, and on the day a batch
// of them lapse it's a handful, so plain sequential writes are fine.
async function sweepStaleConnections() {
  if (connectionResetDone || !canEdit) return;
  if (orgSettings?.connections?.autoReset === false) return;
  connectionResetDone = true;

  const stale = [];
  ['hs','ms'].forEach(sk => (DATA[sk].students||[]).forEach((p,i) => {
    if (p.connected && connectionState(p) === 'stale') stale.push({sk, idx:i, person:p});
  }));
  if (!stale.length) return;

  let reset = 0;
  for (const {sk, idx, person} of stale) {
    try {
      const params = new URLSearchParams({action:'update',payload:JSON.stringify({sheet:sk,id:person.id,rowIndex:person.rowIndex,fields:{connected:false}})});
      const res = await fetch('/api/students/write', writeInit(params));
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // last_connected is untouched by this write, so the badge stays "Needs
      // Connection" rather than falling back to "Not Connected".
      person.connected = false;
      paintConnected(sk, idx, false);
      reset++;
    } catch(e) { /* next load tries again; the badge is already right */ }
  }

  if (reset) {
    showToast(reset+' student'+(reset===1?'':'s')+' passed '+connectionResetMonths()+' months — marked as needing a connection');
  }
}

function showRosterError(message) {
  const el = document.getElementById('roster-error');
  if (!el) return;
  if (!message) { el.style.display = 'none'; el.innerHTML = ''; return; }
  console.error('[roster] ' + message);
  el.style.display = 'flex';
  el.innerHTML = '<p><strong>Couldn\\'t load the roster.</strong> ' + message + '</p>' +
    '<button class="nav-btn primary" onclick="retryLoadRoster(this)">Retry</button>';
}

async function retryLoadRoster(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Retrying…'; }
  await loadRoster();
}

function renderAll() {
  // Apply grade tab labels from settings
  if (orgSettings?.gradeTabs) {
    const hsBtn = document.querySelector('.seg-btn[onclick*="hs"]');
    const msBtn = document.querySelector('.seg-btn[onclick*="ms"]');
    if (hsBtn && orgSettings.gradeTabs.hs?.label) hsBtn.textContent = orgSettings.gradeTabs.hs.label;
    if (msBtn && orgSettings.gradeTabs.ms?.label) msBtn.textContent = orgSettings.gradeTabs.ms.label;
  }
  ['hs','ms'].forEach(sk => renderGrid(DATA[sk].students, sk+'-grid', sk));
  document.querySelectorAll('.edit-gated').forEach(el => {
    el.style.display=canEdit?'':'none';
  });
  populateFilterDropdowns();
  restoreMyStudents();
  // A reload repaints from scratch — keep honouring whatever the filter panel
  // still says (e.g. "My students") rather than silently showing everyone.
  if (hasActiveFilters()) applyFilters();
}

function renderGrid(data, id, sk) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML='';
  if (!(data||[]).length) {
    el.innerHTML='<div class="empty"><div class="empty-icon">👥</div><p>No students here yet</p></div>';
    return;
  }
  (data||[]).forEach((p,i) => el.appendChild(makeCard(p,i,sk)));
}

function makeCard(person, idx, sk) {
  const card = document.createElement('div');
  card.className='card';
  // paintConnected() finds the card by these after a toggle, rather than
  // rebuilding the whole grid mid-tap.
  card.dataset.sk=sk; card.dataset.idx=idx;
  const g = GRADIENTS[idx % GRADIENTS.length];
  // person.thumbUrl is a small copy in Supabase Storage — paint that first
  // when it's there, and quietly upgrade to the full photo once it's loaded,
  // below. A student with no thumb just gets the full image directly.
  const fullThumb = person.photoUrl||null;
  const thumb = person.thumbUrl || fullThumb;
  const age = calcAge(person.birthday);

  const tr = orgSettings?.tracking || {school:true,birthdays:true,age:true,showGrade:true};
  const meta = [
    (tr.school!==false) && person.school   ? '🏫 '+esc(person.school) : '',
    (tr.birthdays!==false) && person.birthday ? '🎂 '+esc(formatDate(person.birthday))+((tr.age!==false)&&age?' · '+age+'yo':'') : '',
  ].filter(Boolean).map(t => '<div class="meta-item"><span>'+t+'</span></div>').join('');
  // The actual date of the last parent connection is deliberately not here.
  // The card is a scanning surface — sixty of them at once — and the badge
  // below already says the only thing that needs deciding at a glance
  // (connected / needs one / never). The date, and the full log behind it,
  // live on the student's own screen.

  // A second .status-select right beside the first one, styled and driven the
  // same way: pick an option, it writes, a failure puts the old one back. The
  // stopPropagation calls exist for the same reason the status dropdown's do —
  // the whole card opens the detail view on click otherwise.
  const connState = connectionState(person);
  const connBadge = canEdit
    ? '<select class="status-select conn-field conn-'+connState+'" onclick="event.stopPropagation()" '+
      'onchange="event.stopPropagation();changeConnection(\\''+sk+'\\','+idx+',this.value,this)" '+
      'title="'+connBadgeTitle(person)+'">'+
      CONN_ORDER.map(k=>'<option value="'+k+'"'+(k===connState?' selected':'')+'>'+CONN_LABELS[k]+'</option>').join('')+
      '</select>'
    : '<span class="status-chip conn-field conn-'+connState+'" title="'+connBadgeTitle(person)+'">'+CONN_LABELS[connState]+'</span>';

  // The whole card is a click target for the detail view, so the dropdown has
  // to stop propagation or picking a status also navigates away from it.
  const st = statusOf(person);
  const statusEl = canEdit
    ? '<select class="status-select status-'+st+'" onclick="event.stopPropagation()" '+
      'onchange="event.stopPropagation();changeStatus(\\''+sk+'\\','+idx+',this.value,this)">'+
      STATUS_ORDER.map(k=>'<option value="'+k+'"'+(k===st?' selected':'')+'>'+STATUS_LABELS[k]+'</option>').join('')+
      '</select>'
    : '<span class="status-chip status-'+st+'">'+STATUS_LABELS[st]+'</span>';

  const goals = person.goals||[];
  const done = goals.filter(g=>g.done).length;
  const goalHtml = goals.length
    ? '<div class="goal-bar-wrap"><div class="goal-bar-label"><span>Goals</span><span>'+done+'/'+goals.length+'</span></div><div class="goal-bar-track"><div class="goal-bar-fill" style="width:'+(goals.length?Math.round(done/goals.length*100):0)+'%"></div></div></div>'
    : (person.primaryGoal ? '<div class="goal-primary">🎯 '+esc(person.primaryGoal.slice(0,40))+'</div>' : '');

  const editBtn = canEdit
    ? '<button class="card-edit-btn" onclick="event.stopPropagation();openEditModal(\\''+sk+'\\','+idx+')" title="Edit">✏️</button>'
    : '';

  const avatarClick = canEdit
    ? 'event.stopPropagation();openEditModal(\\''+sk+'\\','+idx+')'
    : '';
  card.innerHTML = editBtn +
    '<div class="card-avatar"'+(canEdit?' onclick="'+avatarClick+'"':'')+'>'+
    '<div class="av-fallback" style="background:'+g+'">'+initials(person.name)+'</div>'+
    (thumb ? '<img src="'+esc(thumb)+'" alt="" loading="lazy" onerror="this.style.display=\\'none\\'">' : '')+
    (canEdit?'<div class="av-edit-overlay">📷</div>':'')+
    '</div><div class="card-name-row"><div class="card-name">'+esc(person.name)+'</div>'+
    ((tr.showGrade!==false) && person.grade ? '<span class="badge-grade">Gr.'+esc(person.grade)+'</span>' : '')+
    apprenticePillHtml(person)+'</div>'+
    (meta ? '<div class="card-meta">'+meta+'</div>' : '')+
    '<div class="card-status-row">'+statusEl+connBadge+'</div>' +
    '<div class="mentor-row">'+mentorRowHtml(person, sk, idx)+'</div>' + goalHtml +
    '<div class="card-check" aria-hidden="true">✓</div>';
  if (selectedCards.has(sk+':'+idx)) card.classList.add('selected');
  wireMentorImgs(card);

  if (thumb) {
    const cardImg = card.querySelector('.card-avatar img');
    if (cardImg) {
      cardImg.onload = () => { cardImg.classList.add('loaded'); applyCropToImg(cardImg, person.photoCrop); };
      // Started from the low-res thumb — preload the full-res photo
      // off-screen and swap once it's actually ready, so the card never
      // regresses to a blank image while the full photo loads.
      if (person.thumbUrl && fullThumb && fullThumb !== thumb) {
        const upgrade = new Image();
        upgrade.onload = () => { cardImg.src = fullThumb; };
        upgrade.src = fullThumb;
      }
    }
  }
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', 'View ' + person.name);
  // In select mode a tap picks the card for a bulk mentor assignment instead
  // of opening the student.
  const activate = () => selectMode ? toggleCardSelected(sk, idx, card) : openStudentDetail(sk, idx);
  card.addEventListener('click', activate);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
  });
  return card;
}

// The student's last_connected date — the last time their parents were
// connected with. Stamped by the server when the Connected toggle is switched on,
// and kept in step with the connection log, which is the fuller record of it.
function lastConnectedLabel(person) {
  if (!person.lastConnected) return 'Parent connection · never';
  const t = timeAgo(person.lastConnected);
  return 'Parent connection · ' + formatDate(person.lastConnected) + (t ? ' · ' + t : '');
}

// The card no longer prints the date, so it goes here instead — a long-press
// on the select, or a hover on a laptop, still answers "when was it?".
function connBadgeTitle(person) {
  const when = person.lastConnected ? lastConnectedLabel(person) : 'No connection on record';
  return esc(when);
}

// Every roster write goes through POST. It used to be a GET with the params in
// the query string, which meant ?action=delete was reachable by navigation and,
// with a SameSite=Lax session cookie, a leader clicking a crafted link could
// delete a student. Cross-site POSTs carry no cookie.
function writeInit(params) {
  return {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: params.toString(),
  };
}

// Writes the status field. Optimistic: the dropdown already shows the new
// value, so on failure it's put back rather than left lying about what's saved.
async function changeStatus(sk, idx, value, el) {
  const person = (DATA[sk].students||[])[idx];
  if (!person || !canEdit) return;
  const previous = statusOf(person);
  if (value === previous) return;

  person.status = value;
  if (el) el.className = 'status-select status-' + value;

  try {
    const params = new URLSearchParams({action:'update',payload:JSON.stringify({sheet:sk,id:person.id,rowIndex:person.rowIndex,fields:{status:value}})});
    const res = await fetch('/api/students/write', writeInit(params));
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    showToast('✓ '+person.name+' → '+STATUS_LABELS[value],'ok');
  } catch(e) {
    person.status = previous;
    if (el) { el.value = previous; el.className = 'status-select status-' + previous; }
    showToast('Could not save status — it\\'s still '+STATUS_LABELS[previous],'error');
  }
}

// Writes the connected flag. Same optimistic contract as changeStatus: the
// control already shows the new value, so on failure it's put back rather
// than left lying about what's saved. Split into two directions because they do
// genuinely different things underneath — see each for why.
//
// Sends today as lastConnected *explicitly* rather than relying on the
// server's OFF -> ON stamp (api/students/write), which wouldn't fire for a
// stale student whose flag is already on, and appends a row to the
// connection log.
async function connectFamily(sk, idx) {
  const person = (DATA[sk].students||[])[idx];
  if (!person || !canEdit) return;

  const prevConnected = !!person.connected;
  const prevLastConnected = person.lastConnected;
  const today = todayISO();

  person.connected = true;
  person.lastConnected = today;
  paintConnected(sk, idx);

  try {
    const params = new URLSearchParams({action:'update',payload:JSON.stringify({sheet:sk,id:person.id,rowIndex:person.rowIndex,fields:{connected:true, lastConnected:today}})});
    const res = await fetch('/api/students/write', writeInit(params));
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (data.lastConnected) person.lastConnected=data.lastConnected;
    paintConnected(sk, idx);
    showToast('✓ '+person.name+' → Family Connected With','ok');
  } catch(e) {
    person.connected = prevConnected;
    person.lastConnected = prevLastConnected;
    paintConnected(sk, idx);
    showToast('Could not save — it\\'s still '+(prevConnected?'Family Connected With':'Not Connected'),'error');
    return;
  }

  // The log is what the student's screen shows and what the reset window reads
  // once last_connected has been overwritten again. It's appended
  // after the student write so a failed write doesn't leave a phantom day behind,
  // and its own failure is reported without undoing the control — the
  // connection did happen, only the history of it is short one row.
  if (person.id) {
    try {
      const res = await fetch('/api/student/connections', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({sk, id:person.id, date:today}),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error||'Could not log it');
      person.connectionCount = (person.connectionCount||0)+1;
      if (currentStudentKey && currentStudentKey.sk===sk && currentStudentKey.index===idx) {
        currentConnections.push(data.connection);
        renderConnectionsList(currentConnections, sk, idx);
      }
    } catch(e) {
      showToast("Saved, but couldn't add it to the connection log",'error');
    }
  }
}

// The date and the log are deliberately left alone here — they record the days
// this family was actually reached, and clearing the flag does not undo that.
// A no-op when the student is already Not Connected: a student can still show
// "Needs Connection" in that state (it's driven by how old the date is, not by
// this flag), and picking that option costs nothing to write.
async function disconnectFamily(sk, idx) {
  const person = (DATA[sk].students||[])[idx];
  if (!person || !canEdit) return;
  if (!person.connected) { paintConnected(sk, idx); return; }

  person.connected = false;
  paintConnected(sk, idx);

  try {
    const params = new URLSearchParams({action:'update',payload:JSON.stringify({sheet:sk,id:person.id,rowIndex:person.rowIndex,fields:{connected:false}})});
    const res = await fetch('/api/students/write', writeInit(params));
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    paintConnected(sk, idx);
    showToast('✓ '+person.name+' → Not Connected','ok');
  } catch(e) {
    person.connected = true;
    paintConnected(sk, idx);
    showToast('Could not save — it\\'s still Family Connected With','error');
  }
}

// The student screen's own connection chip is still a tap-to-flip control
// (see renderStudentDetail), so it needs a single entry point that picks a
// direction from whatever the chip is currently showing.
async function toggleParentConnected(sk, idx) {
  const person = (DATA[sk].students||[])[idx];
  if (!person || !canEdit) return;
  if (connectionState(person) === 'connected') await disconnectFamily(sk, idx);
  else await connectFamily(sk, idx);
}

// The card's .status-select entry point. "Needs Connection" isn't a value
// that's stored — connected is a boolean — so picking it writes the same
// thing picking "Not Connected" does. The repaint after either one shows whatever
// the date actually earns: if it turns out to still be inside the window, it
// snaps back to "Not Connected", same as it would for a stray click.
async function changeConnection(sk, idx, value, el) {
  const person = (DATA[sk].students||[])[idx];
  if (!person || !canEdit) return;
  if (value === connectionState(person)) return;
  if (value === 'connected') await connectFamily(sk, idx);
  else await disconnectFamily(sk, idx);
}

function todayISO() {
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}

`;
