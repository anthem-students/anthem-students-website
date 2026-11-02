// Quick Log: paste notes about several students, find who was mentioned, and
// log each one as a hangout.
// Part of the roster's client script; see ./index.ts.
export const QUICK_LOG = `// ── QUICK LOG ─────────────────────────────────────────────────
// Matching is plain text search against the roster already in memory — there
// is no AI and no server call. It errs on the side of asking: only a full
// first + last name counts as a match. A first name alone is shown as a
// "possible" match with every student who has that first name to pick from.
// Nothing is saved from here: "Log as Hangout" opens the normal Log Hangout
// modal pre-filled, and the leader edits and confirms it there.

let quickLogResults = [];

// A name as a case-insensitive pattern that only matches whole words. Built
// from letters, apostrophes and hyphens only, so a stray symbol in a name can't
// break the regex. Unicode-aware, so "José" isn't matched inside "Josélyn".
function nameRegex(name) {
  const words = String(name||'').split(/\\s+/).map(w => w.replace(/[^\\p{L}'’-]/gu,'')).filter(Boolean);
  if (!words.length) return null;
  return new RegExp('(?<![\\\\p{L}])' + words.join('\\\\s+') + '(?![\\\\p{L}])', 'iu');
}

function quickLogMatch(text) {
  const students = [];
  for (const sk of ['hs','ms']) {
    (DATA[sk].students||[]).forEach((p, index) => {
      const parts = (p.name||'').trim().split(/\\s+/);
      if (!parts[0]) return;
      students.push({ sk, index, name: p.name, full: parts.length > 1 ? nameRegex(p.name) : null, first: nameRegex(parts[0]), firstName: parts[0].toLowerCase() });
    });
  }

  // Sentences, keeping the line breaks a leader used as separators.
  const sentences = text.split(/(?<=[.!?])\\s+|\\n+/).map(s => s.trim()).filter(Boolean);
  const groups = new Map();   // result key -> { sentences, ... }
  let lastKeys = [];

  for (const sentence of sentences) {
    const keys = [];
    const fullHits = students.filter(s => s.full && s.full.test(sentence));
    fullHits.forEach(s => keys.push(addQuickLogHit(groups, 'full:'+s.sk+':'+s.index, { matched: true, candidates: [s] }, sentence)));

    // First names not already covered by a full-name hit in this sentence.
    const covered = new Set(fullHits.map(s => s.firstName));
    const byFirst = new Map();
    students.forEach(s => {
      if (covered.has(s.firstName) || !s.first.test(sentence)) return;
      if (!byFirst.has(s.firstName)) byFirst.set(s.firstName, []);
      byFirst.get(s.firstName).push(s);
    });
    byFirst.forEach((cands, first) => keys.push(addQuickLogHit(groups, 'first:'+first, { matched: false, candidates: cands }, sentence)));

    // A sentence with no name ("She's been stressed about…") usually continues
    // the one before it, so it goes with whoever that was about.
    if (keys.length) lastKeys = keys;
    else lastKeys.forEach(k => groups.get(k).sentences.push(sentence));
  }
  return [...groups.values()].map(g => ({ ...g, summary: g.sentences.join(' ') }));
}

function addQuickLogHit(groups, key, info, sentence) {
  if (!groups.has(key)) groups.set(key, { ...info, sentences: [] });
  groups.get(key).sentences.push(sentence);
  return key;
}

function processQuickLog() {
  const text = document.getElementById('qlog-text').value.trim();
  if (!text) { showToast('Write something first!','error'); return; }
  quickLogResults = quickLogMatch(text);
  const el = document.getElementById('qlog-result');
  if (!quickLogResults.length) {
    el.innerHTML = '<div class="qlog-result"><p style="color:var(--muted)">No student names found. Use first and last names for a sure match.</p></div>';
    return;
  }
  el.innerHTML = '<div class="qlog-result"><div class="qlog-result-title">Found '+quickLogResults.length+' student'+(quickLogResults.length!==1?'s':'')+'</div>'+
    quickLogResults.map((r, i) => {
      const who = r.matched
        ? esc(r.candidates[0].name)+' <span class="qlog-tag ok">✓ full name</span>'
        : r.candidates.length === 1
          ? esc(r.candidates[0].name)+' <span class="qlog-tag warn">possible match — first name only</span>'
          : '<select class="qlog-pick" id="qlog-pick-'+i+'">'+
              r.candidates.map((c, ci) => '<option value="'+ci+'">'+esc(c.name)+'</option>').join('')+
            '</select> <span class="qlog-tag warn">which one?</span>';
      return '<div class="qlog-match">'+
        '<div class="qlog-match-name">'+who+'</div>'+
        '<div class="qlog-match-sum">'+esc(r.summary.slice(0,300))+(r.summary.length>300?'…':'')+'</div>'+
        (canEdit ? '<div class="qlog-match-actions"><button class="add-btn" onclick="quickLogOpen('+i+')">Log as Hangout…</button></div>' : '')+
      '</div>';
    }).join('')+
  '</div>';
}

function quickLogOpen(i) {
  const r = quickLogResults[i];
  if (!r) return;
  const pick = document.getElementById('qlog-pick-'+i);
  const c = r.candidates[pick ? +pick.value : 0];
  const person = DATA[c.sk].students[c.index];
  // The roster may have reloaded since matching; make sure it's still them.
  if (!person || person.name !== c.name) { showToast('The roster changed — run Quick Log again','error'); return; }
  openInteractionModal(c.sk, c.index, person.name, r.summary.slice(0, 5000));
}

`;
