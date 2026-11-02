// The student screen: notes, parent-connection log, goals and hangouts.
// Part of the roster's client script; see ./index.ts.
export const STUDENT_DETAIL = `// ── STUDENT DETAIL ────────────────────────────────────────────
async function openStudentDetail(sk, index) {
  currentStudentKey={sk,index};
  // Per-student UI state — an armed delete or an open editor must not follow
  // the leader onto the next student's notes.
  currentNotes=[]; noteEditingId=null; noteConfirmDelete=null;
  currentConnections=[]; connEditingId=null; connConfirmDelete=null;
  showScreen('student');
  await renderStudentDetail(sk,index);
}

function goBack() { showScreen('app'); }

async function renderStudentDetail(sk, index) {
  const person=DATA[sk].students[index];
  const el=document.getElementById('student-content');
  const g=GRADIENTS[index%GRADIENTS.length];
  const thumb=driveThumb(person.photoUrl);
  const age=calcAge(person.birthday);

  const tr2 = orgSettings?.tracking || {school:true,birthdays:true,age:true,showGrade:true};
  const chips=[
    (tr2.showGrade!==false) && person.grade   ? '📚 Grade '+esc(person.grade) : '',
    (tr2.school!==false) && person.school  ? '🏫 '+esc(person.school) : '',
    (tr2.birthdays!==false) && person.birthday? '🎂 '+esc(formatDate(person.birthday))+((tr2.age!==false)&&age?' · '+age+'yo':'') : '',
    '🔗 '+STATUS_LABELS[statusOf(person)],
  ].filter(Boolean).map(c=>'<div class="chip">'+c+'</div>').join('')
  // Tappable here too, same as the badge on the card. Both carry ids so
  // paintConnected can rewrite them without re-rendering this screen.
  + (canEdit
      ? '<button class="chip conn-'+connectionState(person)+' chip-toggle" id="sd-conn-chip" onclick="toggleParentConnected(\\''+sk+'\\','+index+')" title="Tap to change">'+connectedLabel(person,'✅')+'</button>'
      : '<div class="chip conn-'+connectionState(person)+'" id="sd-conn-chip">'+connectedLabel(person,'✅')+'</div>')
  + '<div class="chip" id="sd-lastconn-chip">🤝 '+lastConnectedLabel(person)+'</div>'
  + mentorChipHtml(person, sk, index)
  + apprenticeChipHtml(person, sk, index);

  const editBtn = canEdit
    ? '<button class="nav-btn primary edit-gated" onclick="openEditModal(\\''+sk+'\\','+index+')">Edit</button>'
    : '';
  const logBtn = canEdit && tr2.hangoutNotes !== false
    ? '<button class="nav-btn" onclick="openInteractionModal(\\''+sk+'\\','+index+',DATA[\\''+sk+'\\'].students['+index+'].name)">+ Log Hangout</button>'
    : '';

  const sdPhotoAction = person.photoUrl
    ? 'recropStudentPhoto(\\''+sk+'\\','+index+')'
    : 'triggerStudentDetailPhotoUpload(\\''+sk+'\\','+index+')';
  const sdAvatarClick = canEdit ? ' onclick="'+sdPhotoAction+'"' : '';
  el.innerHTML =
    '<div class="student-hero">'+
      '<div class="sd-avatar-wrap"'+sdAvatarClick+'>'+
      '<div class="student-avatar-lg"><div class="av-fallback" style="background:'+g+'">'+initials(person.name)+'</div>'+
      (thumb?'<img src="'+esc(thumb)+'" alt="" onerror="this.style.display=\\'none\\'">':'')+
      '</div>'+
      (canEdit?'<div class="av-cam-overlay">📷</div>':'')+
      '</div>'+
      '<div class="student-info">'+
        '<div class="student-name">'+esc(person.name)+'</div>'+
        '<div class="student-chips">'+chips+'</div>'+
        '<div class="student-actions">'+editBtn+logBtn+'</div>'+
      '</div>'+
    '</div>'+
    '<div class="student-grid">'+
      '<div class="panel" id="goals-panel">'+
        '<div class="panel-title">🎯 Goals <span id="goal-count"></span></div>'+
        '<div id="goals-list"><div class="loader"><div class="loader-ring"></div></div></div>'+
        (canEdit?'<div class="add-goal-row"><input class="add-goal-input" id="new-goal-input" placeholder="Add a new goal…"><button class="add-goal-btn" onclick="addGoal()">+</button></div>':'')+
        (person.primaryGoal?'<div style="margin-top:12px;padding:9px 11px;background:var(--accent-glow);border:1px solid var(--accent-border);border-radius:8px;font-size:12px;color:var(--accent)">⭐ Primary: '+esc(person.primaryGoal)+'</div>':'')+
      '</div>'+
      '<div class="panel" id="notes-panel">'+
        '<div class="panel-title">📝 Notes <span id="note-count"></span></div>'+
        '<div id="notes-list" class="notes-scroll"><div class="loader"><div class="loader-ring"></div></div></div>'+
        (canEdit?'<div class="add-goal-row"><input class="add-goal-input" id="new-note-input" placeholder="Add a note…" onkeydown="if(event.key===\\'Enter\\'){event.preventDefault();addNote();}"><button class="add-goal-btn" onclick="addNote()">+</button></div>':'')+
      '</div>'+
      // Collapsed by default, and it's the heading itself that opens it. Most
      // visits to this screen only need the one line above — when the last
      // connection was — and a leader who wants the individual days is asking
      // a deliberate question.
      '<div class="panel full">'+
        '<button class="panel-title panel-toggle" id="conn-log-toggle" aria-expanded="false" aria-controls="connections-body" onclick="toggleConnectionLog()">'+
          '<span class="panel-caret">▸</span>'+
          '<span>🤝 Parent Connection Log</span>'+
          '<span id="conn-count">'+connCountLabel(person)+'</span>'+
        '</button>'+
        '<div id="connections-body" class="panel-collapse" hidden>'+
          '<div id="connections-list"><div class="loader"><div class="loader-ring"></div></div></div>'+
          (canEdit
            ? '<div class="conn-add-row">'+
                '<input class="conn-date-input dp-input" type="text" id="new-conn-date" data-dp-max="'+todayISO()+'" data-dp-default-today placeholder="Select date" readonly aria-label="Connection date">'+
                '<input class="add-goal-input" id="new-conn-note" placeholder="What was it? (optional)">'+
                '<button class="add-goal-btn" onclick="addConnection()" title="Add connection">+</button>'+
              '</div>'
            : '')+
        '</div>'+
      '</div>'+
      (tr2.hangoutNotes !== false ?
        '<div class="panel full">'+
          '<div class="panel-title">🤝 Hangout Log <span id="int-count"></span></div>'+
          '<div id="interactions-list"><div class="loader"><div class="loader-ring"></div></div></div>'+
        '</div>' : '')+
    '</div>';

  if (thumb) {
    const heroImg = el.querySelector('.student-avatar-lg img');
    if (heroImg) heroImg.onload = () => { heroImg.classList.add('loaded'); applyCropToImg(heroImg, person.photoCrop); };
  }

  // Load goals
  const goals=person.goals||[];
  renderGoalsList(goals,sk,index);

  // Resolve leader photos for the notes/hangout lists below — usually already
  // warm from the boot-time call, so this is a no-op await most of the time.
  await loadLeaderDirectory();

  // The three logs load in parallel. Each fetch is caught on its own so one
  // failing doesn't blank the others. For the notes and hangouts, null means
  // "didn't load" (shown as an error) and 'hidden' means the session isn't
  // allowed to read them (a view-only passcode session, by default).
  const id=encodeURIComponent(person.id||'');
  const getLog=async (path, field)=>{
    try {
      const res=await fetch('/api/student/'+path+'?sk='+sk+'&id='+id);
      if (res.status===403) return 'hidden';
      if (!res.ok) return null;
      return (await res.json())[field]||[];
    } catch(e) { return null; }
  };
  const [notes, connRes, interactions]=await Promise.all([
    getLog('notes','notes'),
    // Fetched even while the panel is collapsed: it carries the heading's count.
    fetch('/api/student/connections?sk='+sk+'&id='+id).then(r=>r.ok?r.json():null).catch(()=>null),
    tr2.hangoutNotes !== false ? getLog('interactions','interactions') : Promise.resolve(null),
  ]);

  renderNotesList(notes, sk, index);
  if (connRes && connRes.latest) person.lastConnected=connRes.latest;
  renderConnectionsList(connRes ? connRes.connections||[] : null, sk, index);
  if (tr2.hangoutNotes !== false) {
    const intEl=document.getElementById('interactions-list');
    if (interactions==='hidden') intEl.innerHTML='<div class="empty"><p>Hangouts are hidden in view-only mode.</p></div>';
    else if (interactions===null) intEl.innerHTML='<div class="empty"><p>Could not load.</p></div>';
    else renderInteractionsList(interactions, sk, index);
  }
}

function renderGoalsList(goals,sk,index) {
  const el=document.getElementById('goals-list');
  if (!el) return;
  const gc=document.getElementById('goal-count');
  if (gc) gc.textContent=goals.length ? goals.filter(g=>g.done).length+'/'+goals.length+' done' : '';
  if (!goals.length) { el.innerHTML='<div class="empty"><p>No goals yet.</p></div>'; return; }
  el.innerHTML=goals.map((g,gi)=>
    '<div class="goal-item">'+
      '<div class="goal-check '+(g.done?'done':'')+'" onclick="toggleGoal('+gi+')" title="Toggle"></div>'+
      '<div class="goal-text '+(g.done?'done':'')+'">'+esc(g.text)+'</div>'+
      (g.primary?'<span class="primary-tag">Primary</span>':'')+
      (canEdit?'<button class="goal-del" onclick="deleteGoal('+gi+')" title="Remove">✕</button>':'')+
    '</div>'
  ).join('');
}

function renderInteractionsList(interactions, sk, index) {
  currentInteractions = interactions;
  const el=document.getElementById('interactions-list');
  if (!el) return;
  const ic=document.getElementById('int-count');
  if (ic) ic.textContent=interactions.length ? interactions.length+' logged' : '';
  if (!interactions.length) { el.innerHTML='<div class="empty"><p>No hangouts logged yet.</p></div>'; return; }
  el.innerHTML=[...interactions].reverse().map(int=>{
    const canManage=int.id && currentUser && (int.leaderEmail===currentUser.email || currentUser.role==='admin');
    const editedTag=int.updatedAt ? ' <span class="int-edited">edited</span>' : '';
    const actBtns=canManage
      ? '<div class="int-actions">'+
          '<button class="int-action-btn" data-id="'+esc(int.id)+'" data-sk="'+sk+'" data-idx="'+index+'" onclick="openEditInteractionModal(this.dataset.id,this.dataset.sk,+this.dataset.idx)">Edit</button>'+
          '<button class="int-action-btn danger" data-id="'+esc(int.id)+'" data-sk="'+sk+'" data-idx="'+index+'" onclick="deleteInteractionNote(this.dataset.id,this.dataset.sk,+this.dataset.idx)">Delete</button>'+
        '</div>'
      : '';
    const lp=findLeaderByEmail(int.leaderEmail);
    return '<div class="int-item">'+
      '<div class="int-header">'+
        '<div class="int-av">'+initials(int.leader)+(lp&&lp.photoUrl?'<img src="'+esc((driveThumb(lp.photoUrl)||lp.photoUrl))+'" alt="" onerror="this.style.display=\\'none\\'">':'')+'</div>'+
        '<div><div class="int-who">'+esc(int.leader||'Someone')+editedTag+'</div><div class="int-when">'+formatDate(int.date)+' · '+timeAgo(int.createdAt)+'</div></div>'+
      '</div>'+
      '<div class="int-body">'+esc(int.summary)+'</div>'+
      actBtns+
    '</div>';
  }).join('');
  const reversedInts=[...interactions].reverse();
  el.querySelectorAll('.int-item').forEach((row,i)=>{
    const img=row.querySelector('.int-av img'); if(!img) return;
    const lp=findLeaderByEmail(reversedInts[i]&&reversedInts[i].leaderEmail);
    img.onload=()=>{ img.classList.add('loaded'); applyCropToImg(img, lp&&lp.photoCrop); };
  });
}

// ── NOTES ─────────────────────────────────────────────────────
// Two sources, one panel. The student's own notes field (edited in the Edit
// Student modal) is the standing note — allergies, family situation, the
// things that stay true — and it stays pinned on top; this panel is the only
// place it's visible, so the
// running log doesn't get to replace it. Below it, the log itself: roster_kv,
// newest first, one entry per jot, each stamped with who wrote it.
//
// Distinct from the hangout log next door on purpose: that one answers "when
// did someone last meet with this student", this one answers "what do we know
// about them".
//
// Every string below is free text a leader typed, so it goes through esc()
// before it reaches innerHTML.
function renderNotesList(notes, sk, index) {
  const el=document.getElementById('notes-list');
  if (!el) return;
  const person=DATA[sk].students[index];

  const pinnedNote=(person.notes||'').trim();
  const pinned = pinnedNote
    ? '<div class="note-pinned">'+
        '<div class="note-pinned-label">📌 Pinned note</div>'+
        '<div class="note-pinned-body">'+esc(pinnedNote)+'</div>'+
      '</div>'
    : '';

  if (notes==='hidden') {
    currentNotes=[];
    el.innerHTML=pinned+'<div class="empty"><p>Notes are hidden in view-only mode.</p></div>';
    return;
  }
  // null means the log failed to load, which is not the same as it being
  // empty — say so rather than showing a convincing "No notes yet".
  if (notes===null) {
    currentNotes=[];
    el.innerHTML=pinned+'<div class="empty"><p>Could not load notes.</p></div>';
    return;
  }

  currentNotes=notes;
  person.noteCount=notes.length;
  const nc=document.getElementById('note-count');
  if (nc) nc.textContent = notes.length ? notes.length+' logged' : '';

  if (!notes.length) {
    el.innerHTML=pinned+(pinnedNote?'':'<div class="empty"><p>No notes yet.</p></div>');
    return;
  }

  el.innerHTML=pinned+[...notes].reverse().map(n=>{
    // canEdit as well as authorship: without it a role that can read the roster
    // but not write it (pending, viewer) is offered Edit and Delete buttons that
    // the API then refuses. The server check is the real one either way.
    const canManage = canEdit && n.id && currentUser && (n.leaderEmail===currentUser.email || currentUser.role==='admin');
    const editedTag = n.updatedAt ? ' <span class="int-edited">edited</span>' : '';
    const lp = findLeaderByEmail(n.leaderEmail);
    const head =
      '<div class="int-header">'+
        '<div class="int-av">'+initials(n.leader||'?')+(lp&&lp.photoUrl?'<img src="'+esc((driveThumb(lp.photoUrl)||lp.photoUrl))+'" alt="" onerror="this.style.display=\\'none\\'">':'')+'</div>'+
        '<div><div class="int-who">'+esc(n.leader||'Someone')+editedTag+'</div>'+
        '<div class="int-when">'+(timeAgo(n.createdAt)||formatDate(n.createdAt))+'</div></div>'+
      '</div>';

    if (noteEditingId===n.id) {
      return '<div class="int-item note-item">'+head+
        '<div class="int-body note-body">'+
          '<textarea class="note-edit-input" id="note-edit-input" rows="3">'+esc(n.text||'')+'</textarea>'+
        '</div>'+
        '<div class="int-actions note-actions-open">'+
          '<button class="int-action-btn" onclick="saveEditNote(\\''+n.id+'\\')">Save</button>'+
          '<button class="int-action-btn" onclick="cancelEditNote()">Cancel</button>'+
        '</div>'+
      '</div>';
    }

    const actBtns = canManage
      ? '<div class="int-actions">'+
          '<button class="int-action-btn" onclick="startEditNote(\\''+n.id+'\\')">Edit</button>'+
          '<button class="int-action-btn danger" onclick="deleteNote(\\''+n.id+'\\')">'+
            (noteConfirmDelete===n.id?'Sure?':'Delete')+'</button>'+
        '</div>'
      : '';

    return '<div class="int-item note-item">'+head+
      '<div class="int-body note-body">'+esc(n.text||'')+'</div>'+
      actBtns+
    '</div>';
  }).join('');
  const reversedNotes=[...notes].reverse();
  el.querySelectorAll('.note-item').forEach((row,i)=>{
    const img=row.querySelector('.int-av img'); if(!img) return;
    const lp=findLeaderByEmail(reversedNotes[i]&&reversedNotes[i].leaderEmail);
    img.onload=()=>{ img.classList.add('loaded'); applyCropToImg(img, lp&&lp.photoCrop); };
  });
}

// ── PARENT CONNECTION LOG ─────────────────────────────────────
// The history behind last_connected. The student row only remembers the most
// recent connection; this is every one of them, with the day it happened, editable
// because the day often gets logged later than it happened.

function connCountLabel(person) {
  const n = person && person.connectionCount || 0;
  return n ? n + ' logged' : '';
}

function toggleConnectionLog() {
  const body = document.getElementById('connections-body');
  const btn = document.getElementById('conn-log-toggle');
  if (!body || !btn) return;
  const opening = body.hidden;
  body.hidden = !opening;
  btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
  btn.classList.toggle('open', opening);
}

function renderConnectionsList(connections, sk, index) {
  const el = document.getElementById('connections-list');
  if (!el) return;
  const person = DATA[sk].students[index];

  // null means the log didn't load, which is not the same as it being empty —
  // an empty-looking log would read as "nobody has ever called this family".
  if (connections === null) {
    currentConnections = [];
    el.innerHTML = '<div class="empty"><p>Could not load the connection log.</p></div>';
    return;
  }

  currentConnections = connections;
  person.connectionCount = connections.length;
  const cc = document.getElementById('conn-count');
  if (cc) cc.textContent = connCountLabel(person);

  if (!connections.length) {
    // A student can carry a last_connected date from before this log existed, so
    // say where that one date came from rather than claiming there were none.
    el.innerHTML = person.lastConnected
      ? '<div class="empty"><p>No days logged yet. The roster has ' + esc(formatDate(person.lastConnected)) + ' as the last connection.</p></div>'
      : '<div class="empty"><p>No parent connections logged yet.</p></div>';
    return;
  }

  // Newest first — the question this panel answers is almost always "when was
  // the last one", and that answer should not be at the bottom of a scroll.
  el.innerHTML = [...connections].reverse().map(c => {
    if (connEditingId === c.id) {
      return '<div class="conn-item editing">' +
        '<div class="conn-edit-fields">' +
          '<input class="conn-date-input dp-input" type="text" id="conn-edit-date" value="' + esc(c.date || '') + '" data-dp-max="' + todayISO() + '" placeholder="Select date" readonly aria-label="Connection date">' +
          '<input class="add-goal-input" id="conn-edit-note" placeholder="What was it? (optional)" value="' + esc(c.note || '') + '">' +
        '</div>' +
        '<div class="int-actions note-actions-open">' +
          '<button class="int-action-btn" onclick="saveEditConnection(\\'' + c.id + '\\')">Save</button>' +
          '<button class="int-action-btn" onclick="cancelEditConnection()">Cancel</button>' +
        '</div>' +
      '</div>';
    }

    const ago = timeAgo(c.date);
    const actBtns = canEdit
      ? '<div class="int-actions">' +
          '<button class="int-action-btn" onclick="startEditConnection(\\'' + c.id + '\\')">Edit</button>' +
          '<button class="int-action-btn danger" onclick="deleteConnection(\\'' + c.id + '\\')">' +
            (connConfirmDelete === c.id ? 'Sure?' : 'Delete') + '</button>' +
        '</div>'
      : '';

    return '<div class="conn-item">' +
      '<div class="conn-main">' +
        '<div class="conn-date">' + esc(formatDate(c.date) || c.date || '—') + (ago ? ' <span class="conn-ago">' + ago + '</span>' : '') + '</div>' +
        (c.note ? '<div class="conn-note">' + esc(c.note) + '</div>' : '') +
        '<div class="conn-by">' + esc(c.leader || 'Someone') + (c.updatedAt ? ' · edited' : '') + '</div>' +
      '</div>' +
      actBtns +
    '</div>';
  }).join('');
}

function refreshConnectionsPanel() {
  if (!currentStudentKey) return;
  renderConnectionsList(currentConnections, currentStudentKey.sk, currentStudentKey.index);
}

// Every write here hands back the log's newest date, and that date is pushed
// straight into the student's last_connected. Without it, correcting a date in
// the log would leave the student row — and the reset window that reads it on the next
// load — still working off the day that was wrong.
async function syncLastConnected(sk, index, latest) {
  const person = DATA[sk].students[index];
  if (!person) return;
  const previous = person.lastConnected || '';
  const next = latest || '';
  person.lastConnected = next;
  paintConnected(sk, index, false);
  refreshConnectionsPanel();
  if (next === previous) return;

  try {
    const params = new URLSearchParams({action:'update',payload:JSON.stringify({
      sheet:sk, id:person.id, rowIndex:person.rowIndex,
      // An emptied log means no connection is on record any more, so the
      // connected flag comes off with the date — otherwise it outlives its reason.
      fields: next ? {lastConnected: next} : {lastConnected:'', connected:false},
    })});
    const res = await fetch('/api/students/write', writeInit(params));
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (!next) person.connected = false;
    paintConnected(sk, index, false);
    refreshConnectionsPanel();
  } catch(e) {
    showToast("Saved to the log, but the last-connection date didn't update",'error');
  }
}

async function addConnection() {
  if (!canEdit || !currentStudentKey) return;
  const dateEl = document.getElementById('new-conn-date');
  const noteEl = document.getElementById('new-conn-note');
  // An empty picker means "today" — the overwhelmingly common case is logging a
  // connection the moment it happened, and making that the one that needs
  // typing would be backwards.
  const date = (dateEl && dateEl.value) || todayISO();
  const note = (noteEl ? noteEl.value : '').trim();

  const {sk, index} = currentStudentKey;
  const person = DATA[sk].students[index];
  if (!person.id) { showToast('This student has no ID yet — reload the roster','error'); return; }

  try {
    const res = await fetch('/api/student/connections', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({sk, id:person.id, date, note, studentName:person.name}),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error||'Could not log the connection');
    if (dateEl) dateEl.value = '';
    if (noteEl) noteEl.value = '';
    currentConnections.push(data.connection);
    // A logged connection is a connection, whether or not the box was ticked.
    person.connected = true;
    renderConnectionsList(currentConnections, sk, index);
    await syncLastConnected(sk, index, data.latest);
    showToast('✓ Connection logged','ok');
  } catch(e) { showToast(e.message||'Could not log the connection','error'); }
}

function startEditConnection(connectionId) {
  connEditingId = connectionId; connConfirmDelete = null;
  refreshConnectionsPanel();
}

function cancelEditConnection() { connEditingId = null; refreshConnectionsPanel(); }

async function saveEditConnection(connectionId) {
  if (!currentStudentKey) return;
  const {sk, index} = currentStudentKey;
  const person = DATA[sk].students[index];
  const dateEl = document.getElementById('conn-edit-date');
  const noteEl = document.getElementById('conn-edit-note');
  const date = dateEl ? dateEl.value : '';
  if (!date) { showToast('Pick a date for this connection','error'); return; }

  try {
    const res = await fetch('/api/student/connections', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({sk, id:person.id, connectionId, date, note:(noteEl?noteEl.value:'').trim()}),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error||'Could not save the change');
    const i = currentConnections.findIndex(c => c.id === connectionId);
    if (i > -1) currentConnections[i] = data.connection;
    connEditingId = null;
    renderConnectionsList(currentConnections, sk, index);
    await syncLastConnected(sk, index, data.latest);
    showToast('✓ Connection updated','ok');
  } catch(e) { showToast(e.message||'Could not save the change','error'); }
}

// Two taps rather than a modal, the same way notes delete — see the note there.
async function deleteConnection(connectionId) {
  if (!currentStudentKey) return;
  const {sk, index} = currentStudentKey;

  if (connConfirmDelete !== connectionId) {
    connConfirmDelete = connectionId;
    refreshConnectionsPanel();
    setTimeout(() => {
      if (connConfirmDelete === connectionId) { connConfirmDelete = null; refreshConnectionsPanel(); }
    }, 4000);
    return;
  }
  connConfirmDelete = null;

  const person = DATA[sk].students[index];
  try {
    const res = await fetch('/api/student/connections', {
      method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({sk, id:person.id, connectionId}),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error||'Could not remove it');
    currentConnections = currentConnections.filter(c => c.id !== connectionId);
    renderConnectionsList(currentConnections, sk, index);
    await syncLastConnected(sk, index, data.latest);
    showToast('Connection removed');
  } catch(e) { showToast(e.message||'Could not remove it','error'); }
}

function refreshNotesPanel() {
  if (!currentStudentKey) return;
  renderNotesList(currentNotes, currentStudentKey.sk, currentStudentKey.index);
}

async function addNote() {
  if (!canEdit||!currentStudentKey) return;
  const input=document.getElementById('new-note-input');
  const text=(input?input.value:'').trim();
  if (!text) return;

  const {sk,index}=currentStudentKey;
  const person=DATA[sk].students[index];
  // Notes are filed against the student's ID, not the row position. A student
  // without one (only ever a half-saved add) has nowhere to file them.
  if (!person.id) { showToast('This student has no ID yet — reload the roster','error'); return; }

  input.value='';
  try {
    const res=await fetch('/api/student/notes',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sk,id:person.id,text,studentName:person.name}),
    });
    const data=await res.json();
    if (!data.success) throw new Error(data.error||'Could not save the note');
    currentNotes.push(data.note);
    renderNotesList(currentNotes,sk,index);
    showToast('✓ Note added','ok');
  } catch(e) {
    // Hand back what they typed rather than swallowing it.
    if (input) input.value=text;
    showToast(e.message||'Could not save the note','error');
  }
}

function startEditNote(noteId) {
  noteEditingId=noteId; noteConfirmDelete=null;
  refreshNotesPanel();
  const ta=document.getElementById('note-edit-input');
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

function cancelEditNote() { noteEditingId=null; refreshNotesPanel(); }

async function saveEditNote(noteId) {
  if (!currentStudentKey) return;
  const {sk,index}=currentStudentKey;
  const person=DATA[sk].students[index];
  const ta=document.getElementById('note-edit-input');
  const text=(ta?ta.value:'').trim();
  if (!text) { showToast("A note can't be empty",'error'); return; }

  try {
    const res=await fetch('/api/student/notes',{
      method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sk,id:person.id,noteId,text}),
    });
    const data=await res.json();
    if (!data.success) throw new Error(data.error||'Could not save the note');
    const i=currentNotes.findIndex(n=>n.id===noteId);
    if (i>-1) currentNotes[i]=data.note;
    noteEditingId=null;
    renderNotesList(currentNotes,sk,index);
    showToast('✓ Note updated','ok');
  } catch(e) { showToast(e.message||'Could not save the note','error'); }
}

// Two taps rather than a modal — a confirmation dialog is heavier than a
// one-line note is. The armed state disarms itself so a stray "Sure?" doesn't
// sit there waiting to catch the next tap.
async function deleteNote(noteId) {
  if (!currentStudentKey) return;
  const {sk,index}=currentStudentKey;

  if (noteConfirmDelete!==noteId) {
    noteConfirmDelete=noteId;
    refreshNotesPanel();
    setTimeout(()=>{
      if (noteConfirmDelete===noteId) { noteConfirmDelete=null; refreshNotesPanel(); }
    }, 4000);
    return;
  }
  noteConfirmDelete=null;

  const person=DATA[sk].students[index];
  try {
    const res=await fetch('/api/student/notes',{
      method:'DELETE',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sk,id:person.id,noteId}),
    });
    const data=await res.json();
    if (!data.success) throw new Error(data.error||'Could not delete the note');
    currentNotes=currentNotes.filter(n=>n.id!==noteId);
    renderNotesList(currentNotes,sk,index);
    showToast('Note deleted','ok');
  } catch(e) { showToast(e.message||'Could not delete the note','error'); }
}

// ── GOALS CRUD ────────────────────────────────────────────────
async function addGoal() {
  const input=document.getElementById('new-goal-input');
  const text=input.value.trim();
  if (!text||!currentStudentKey) return;
  const {sk,index}=currentStudentKey;
  const person=DATA[sk].students[index];
  if (!person.goals) person.goals=[];
  person.goals.push({text,done:false,primary:person.goals.length===0,createdAt:new Date().toISOString()});
  input.value='';
  await syncGoals(sk,index);
  renderGoalsList(person.goals,sk,index);
  renderAll();
  showToast('✓ Goal added','ok');
}
async function toggleGoal(gi) {
  if (!canEdit||!currentStudentKey) return;
  const {sk,index}=currentStudentKey;
  const person=DATA[sk].students[index];
  person.goals[gi].done=!person.goals[gi].done;
  await syncGoals(sk,index);
  renderGoalsList(person.goals,sk,index);
  renderAll();
}
async function deleteGoal(gi) {
  if (!canEdit||!currentStudentKey) return;
  const {sk,index}=currentStudentKey;
  const person=DATA[sk].students[index];
  person.goals.splice(gi,1);
  await syncGoals(sk,index);
  renderGoalsList(person.goals,sk,index);
  showToast('Goal removed');
}
async function syncGoals(sk,index) {
  const person=DATA[sk].students[index];
  await saveGoals(sk,person,person.primaryGoal||'',person.goals||[]);
}
// Goals are stored in roster_kv under goals:{sk}:{id} (see api/student/goals).
async function saveGoals(sk,person,primaryGoal,goals) {
  if (!person||!person.id) return;
  person.primaryGoal=primaryGoal;
  person.goals=goals;
  await fetch('/api/student/goals',{
    method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({sk,id:person.id,primaryGoal,goals}),
  });
}

// ── INTERACTION MODAL ─────────────────────────────────────────
// summary pre-fills the text (Quick Log uses it); the leader still confirms.
function openInteractionModal(sk,index,studentName,summary) {
  interactionKey={sk,index,studentName};
  document.getElementById('int-modal-sub').textContent='with '+studentName;
  sv('int-leader',currentUser?currentUser.name:'');
  sv('int-date',todayISO());
  sv('int-summary',summary||'');
  openModal('interaction-modal');
}
function closeInteractionModal() { closeModal('interaction-modal'); }

async function saveInteraction() {
  const date=v('int-date'), summary=v('int-summary');
  if (!summary) { showToast('Write a summary first','error'); return; }
  const btn=document.querySelector('#interaction-modal .btn-save');
  if(btn){btn.disabled=true;btn.textContent='Saving…';}
  const {sk,index,studentName}=interactionKey;
  const person=DATA[sk].students[index];
  // The server stamps the id and who logged it from the session.
  const interaction={date,summary};
  try {
    const res=await fetch('/api/student/interactions',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sk,id:person.id,rowIndex:person.rowIndex,studentName,interaction}),
    });
    const data=await res.json();
    if (data.success) {
      closeInteractionModal();
      showToast('✓ Hangout logged!','ok');
      if (currentStudentKey) renderStudentDetail(currentStudentKey.sk,currentStudentKey.index);
    } else showToast(data.error||'Failed','error');
  } catch(e) {
    showToast('Network error — try again','error');
  }
  if(btn){btn.disabled=false;btn.textContent='Log It ✓';}
}

// ── INTERACTION EDIT / DELETE ─────────────────────────────────
function openEditInteractionModal(intId, sk, index) {
  const int = currentInteractions.find(n => n.id === intId);
  if (!int) return;
  const person = DATA[sk]?.students?.[index] || {};
  editInteractionContext = { int, sk, index, id: person.id, rowIndex: person.rowIndex };
  sv('edit-int-date', int.date || '');
  sv('edit-int-summary', int.summary || '');
  openModal('edit-interaction-modal');
}

async function saveEditedInteraction() {
  if (!editInteractionContext) return;
  const { int, sk, id, rowIndex } = editInteractionContext;
  const date = v('edit-int-date');
  const summary = v('edit-int-summary');
  if (!summary) { showToast('Summary cannot be empty', 'error'); return; }
  const res = await fetch('/api/student/interactions', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sk, id, rowIndex, interactionId: int.id, changes: { date, summary } }),
  });
  const data = await res.json();
  if (data.success) {
    closeModal('edit-interaction-modal');
    showToast('✓ Note updated', 'ok');
    if (currentStudentKey) renderStudentDetail(currentStudentKey.sk, currentStudentKey.index);
  } else showToast(data.error || 'Failed', 'error');
}

function deleteInteractionNote(interactionId, sk, index) {
  const person = DATA[sk]?.students?.[index] || {};
  pendingDeleteInteraction = { interactionId, sk, id: person.id, rowIndex: person.rowIndex };
  openModal('confirm-delete-modal');
}

async function confirmDeleteInteraction() {
  if (!pendingDeleteInteraction) return;
  const { interactionId, sk, id, rowIndex } = pendingDeleteInteraction;
  const res = await fetch('/api/student/interactions', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sk, id, rowIndex, interactionId }),
  });
  const data = await res.json();
  if (data.success) {
    closeModal('confirm-delete-modal');
    pendingDeleteInteraction = null;
    showToast('Note deleted', 'ok');
    if (currentStudentKey) renderStudentDetail(currentStudentKey.sk, currentStudentKey.index);
  } else showToast(data.error || 'Failed', 'error');
}

`;
