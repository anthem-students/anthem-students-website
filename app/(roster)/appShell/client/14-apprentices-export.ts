// Student apprentices, CSV export and print.
// Part of the roster's client script; see ./index.ts.
export const APPRENTICES_EXPORT = `// ── STUDENT APPRENTICES ──────────────────────────────────────
// A yes/no flag per student, kept in roster_kv (see
// /api/student/apprentice) and delivered by /api/bootstrap.
function apprenticePillHtml(person) {
  return person.apprentice ? '<span class="apprentice-pill" title="Student apprentice">Apprentice</span>' : '';
}
function apprenticeChipHtml(person, sk, idx) {
  if (!canEdit) return person.apprentice ? '<div class="chip apprentice-chip on" id="sd-apprentice-chip">🌱 Apprentice</div>' : '';
  return '<button class="chip chip-toggle apprentice-chip'+(person.apprentice ? ' on' : ' off')+'" id="sd-apprentice-chip" '+
    'title="'+(person.apprentice ? 'Tap to unmark' : 'Mark as a student apprentice')+'" '+
    'onclick="toggleApprenticeChip(\\''+sk+'\\','+idx+')">'+(person.apprentice ? '🌱 Apprentice' : '+ Apprentice')+'</button>';
}
// Repaints just this student's pill and chip, same as paintMentors().
function paintApprentice(sk, idx) {
  const person = (DATA[sk].students||[])[idx];
  if (!person) return;
  const card = document.querySelector('.card[data-sk="'+sk+'"][data-idx="'+idx+'"]');
  const row = card && card.querySelector('.card-name-row');
  if (row) {
    const old = row.querySelector('.apprentice-pill');
    if (old) old.remove();
    if (person.apprentice) row.insertAdjacentHTML('beforeend', apprenticePillHtml(person));
  }
  if (currentStudentKey && currentStudentKey.sk===sk && currentStudentKey.index===idx) {
    const chip = document.getElementById('sd-apprentice-chip');
    const html = apprenticeChipHtml(person, sk, idx);
    if (chip) chip.outerHTML = html;
  }
}
async function setApprentice(sk, idx, on) {
  const person = (DATA[sk].students||[])[idx];
  if (!person || !person.id) return false;
  const before = !!person.apprentice;
  person.apprentice = on;
  paintApprentice(sk, idx);
  try {
    const res = await fetch('/api/student/apprentice', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ sk, id: person.id, studentName: person.name, apprentice: on }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.success) throw new Error(d.error || 'save failed');
  } catch (e) {
    person.apprentice = before;
    paintApprentice(sk, idx);
    showToast('Couldn’t save apprentice — '+e.message, 'error');
    return false;
  }
  populateFilterDropdowns();
  return true;
}
async function toggleApprenticeChip(sk, idx) {
  const person = (DATA[sk].students||[])[idx];
  if (!person) return;
  const on = !person.apprentice;
  if (await setApprentice(sk, idx, on)) showToast(on ? '🌱 Marked as apprentice' : 'Apprentice removed', 'ok');
}
// Bulk bar: marks every selected student, or — when they all already are —
// unmarks them, so the one button covers both directions.
async function bulkToggleApprentice() {
  const picked = [...selectedCards].map(k => {
    const [sk, i] = k.split(':');
    const p = (DATA[sk].students||[])[+i];
    return p && p.id ? { sk, id: p.id, p } : null;
  }).filter(Boolean);
  if (!picked.length) { showToast('Select some students first'); return; }
  const on = !picked.every(x => x.p.apprentice);
  try {
    const res = await fetch('/api/student/apprentice', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ apprentice: on, students: picked.map(({ sk, id }) => ({ sk, id })) }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.success) throw new Error(d.error || 'save failed');
    const done = new Set(d.updated || []);
    picked.forEach(x => { if (done.has(x.sk+':'+x.id)) x.p.apprentice = on; });
    toggleSelectMode(false);
    renderAll();
    showToast((on ? '🌱 Marked ' : 'Unmarked ')+done.size+' student'+(done.size === 1 ? '' : 's')+(on ? ' as apprentice' : ''), 'ok');
  } catch (e) {
    showToast('Couldn’t update apprentices — '+e.message, 'error');
  }
}

// ── CSV EXPORT ───────────────────────────────────────────────
function exportCSV() {
  const rows=[['Name','Grade','School','Birthday','Connection Status','Level','Parent Connection','Last Connection','Connections Logged','Interaction Count','Primary Mentor','Secondary Mentor','Apprentice','Primary Goal','Notes']];
  const CONN_CSV = { connected:'Connected', stale:'Needs Connection', none:'Not Connected' };
  for(const sk of ['hs','ms']){
    (DATA[sk].students||[]).forEach(p=>{
      rows.push([
        p.name||'', p.grade||'', p.school||'', p.birthday||'',
        STATUS_LABELS[statusOf(p)],
        sk==='hs'?'High School':'Middle School',
        CONN_CSV[connectionState(p)],
        p.lastConnected||'',
        p.connectionCount||'0',
        p.interactionCount||'0',
        mentorName(mentorsOf(p).primary), mentorName(mentorsOf(p).secondary),
        p.apprentice?'Yes':'',
        p.primaryGoal||'', (p.notes||'').replace(/[\\n\\r]+/g,' ')
      ]);
    });
  }
  const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download='asm-roster-'+new Date().toISOString().slice(0,10)+'.csv';
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('CSV downloaded','ok');
}

// ── PRINT ────────────────────────────────────────────────────
function printRoster() {
  window.print();
}

`;
