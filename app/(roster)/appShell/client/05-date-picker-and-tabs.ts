// The themed date picker and the HS/MS tab switch.
// Part of the roster's client script; see ./index.ts.
export const DATE_PICKER_AND_TABS = `// ── DATE PICKER ───────────────────────────────────────────────
// One shared popover (#dp-popover, in body.ts) reused by every .dp-input on
// the page — same "single global panel, contextual pointer" shape as the
// crop modal's cropCallback, rather than a picker instance per field.
let dpActiveInput = null, dpViewYear = 0, dpViewMonth = 0;

function openDatePicker(input) {
  dpActiveInput = input;
  let val = input.value;
  // Fields that log "when did this happen" (hangout date, a fresh parent
  // connection) default to today so the common case needs zero clicks.
  // Fields that record a fact about the past (birthday) must never be
  // silently backdated to today, so only inputs marked data-dp-default-today
  // get this.
  if (!val && input.dataset.dpDefaultToday !== undefined) {
    val = todayISO();
    input.value = val;
  }
  const base = val || todayISO();
  const [y, m] = base.split('-').map(Number);
  dpViewYear = y; dpViewMonth = m - 1;
  renderDatePicker();
  positionDatePicker(input);
  document.getElementById('dp-popover').classList.add('open');
}

function closeDatePicker() {
  const pop = document.getElementById('dp-popover');
  if (pop) pop.classList.remove('open');
  dpActiveInput = null;
}

function positionDatePicker(input) {
  const pop = document.getElementById('dp-popover');
  const r = input.getBoundingClientRect();
  const popW = 272, popH = 336;
  let top = r.bottom + 6, left = r.left;
  // Flip above the input, or clamp to the viewport, so the popover never runs
  // off-screen near the bottom/edge of a short phone or a scrolled modal.
  if (top + popH > window.innerHeight - 12) top = r.top - popH - 6;
  if (top < 12) top = 12;
  if (left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
  if (left < 12) left = 12;
  pop.style.top = top + 'px';
  pop.style.left = left + 'px';
}

const DP_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function renderDatePicker() {
  const grid = document.getElementById('dp-grid');
  const label = document.getElementById('dp-month-label');
  if (!grid || !label) return;
  const y = dpViewYear, m = dpViewMonth;
  label.textContent = DP_MONTH_NAMES[m] + ' ' + y;

  const selected = dpActiveInput ? dpActiveInput.value : '';
  const maxAttr = dpActiveInput ? (dpActiveInput.dataset.dpMax || null) : null;
  const today = todayISO();

  const startDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();

  let cells = '';
  for (let i = 0; i < startDow; i++) {
    cells += '<span class="dp-day other-month" aria-hidden="true">' + (daysInPrevMonth - startDow + 1 + i) + '</span>';
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const cls = ['dp-day']
      .concat(iso === today ? ['today'] : [])
      .concat(iso === selected ? ['selected'] : [])
      .concat(maxAttr && iso > maxAttr ? ['disabled'] : [])
      .join(' ');
    cells += (maxAttr && iso > maxAttr)
      ? '<span class="' + cls + '">' + d + '</span>'
      : '<button type="button" class="' + cls + '" onclick="dpSelectDay(' + d + ')">' + d + '</button>';
  }
  const trailing = (7 - ((startDow + daysInMonth) % 7)) % 7;
  for (let i = 1; i <= trailing; i++) {
    cells += '<span class="dp-day other-month" aria-hidden="true">' + i + '</span>';
  }
  grid.innerHTML = cells;
}

function dpChangeMonth(delta) {
  dpViewMonth += delta;
  if (dpViewMonth < 0) { dpViewMonth = 11; dpViewYear--; }
  if (dpViewMonth > 11) { dpViewMonth = 0; dpViewYear++; }
  renderDatePicker();
}

function dpSelectDay(d) {
  if (!dpActiveInput) return;
  const iso = dpViewYear + '-' + String(dpViewMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  dpActiveInput.value = iso;
  dpActiveInput.dispatchEvent(new Event('change', { bubbles: true }));
  closeDatePicker();
}

function dpSelectToday() {
  const iso = todayISO();
  dpViewYear = +iso.slice(0, 4);
  dpViewMonth = +iso.slice(5, 7) - 1;
  dpSelectDay(+iso.slice(8, 10));
}

function connectedLabel(person, onGlyph) {
  const state = connectionState(person);
  if (state === 'connected') return onGlyph+' Family Connected With';
  // Named for what it asks of the leader rather than for what lapsed. A student
  // who has never been connected with reads the same way on purpose — both are
  // "this one needs a call", and splitting them only makes the badge noisier.
  if (state === 'stale') return '⏳ Needs Connection';
  return '○ Not Connected';
}

// Repaints every surface that reads person.connected, without re-rendering
// either of them: the grid can't be rebuilt mid-tap (with the Connected filter
// on, the card would vanish from under the finger), and renderStudentDetail
// re-fetches the hangout log.
function paintConnected(sk, idx, saving) {
  const person = (DATA[sk].students||[])[idx];
  if (!person) return;
  const state = connectionState(person);

  const card = document.querySelector('.card[data-sk="'+sk+'"][data-idx="'+idx+'"]');
  if (card) {
    const field = card.querySelector('.conn-field');
    if (field) {
      const base = field.tagName === 'SELECT' ? 'status-select' : 'status-chip';
      field.className = base+' conn-field conn-'+state+(saving?' saving':'');
      if (field.tagName === 'SELECT') field.value = state; else field.textContent = CONN_LABELS[state];
      field.title = connBadgeTitle(person);
    }
  }

  // The detail screen only ever shows one student — repaint it only when that
  // student is this one.
  if (currentStudentKey && currentStudentKey.sk===sk && currentStudentKey.index===idx) {
    const chip = document.getElementById('sd-conn-chip');
    if (chip) {
      chip.className = 'chip conn-'+connectionState(person)+(canEdit?' chip-toggle':'')+(saving?' saving':'');
      chip.textContent = connectedLabel(person,'✅');
    }
    const chipLc = document.getElementById('sd-lastconn-chip');
    if (chipLc) chipLc.textContent = '🤝 '+lastConnectedLabel(person);
  }
}

// ── HS/MS TAB ────────────────────────────────────────────────
function switchTab(sk, btn) {
  const panel = document.getElementById('tab-'+sk);
  if (!panel) return;
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  panel.classList.add('active');
  document.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));
  // applyLastTab() calls this with no click event behind it, so the button
  // gets looked up when one wasn't handed over.
  const target = btn || document.querySelector('.seg-btn[onclick*="'+sk+'"]');
  if (target) target.classList.add('active');
  try { localStorage.setItem('asm-last-tab', sk); } catch(e) { /* private mode */ }
}

// Reopens on whichever tab this device was left on. There is deliberately no
// setting behind this: an account-level "default group" was one more thing to
// find, explain and get wrong, and picking up where you left off is what it was
// being set to anyway.
function applyLastTab() {
  let sk = null;
  try { sk = localStorage.getItem('asm-last-tab'); } catch(e) { /* private mode */ }
  switchTab(sk==='ms' ? 'ms' : 'hs');
}

`;
