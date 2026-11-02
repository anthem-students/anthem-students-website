// Stats For Nerds dashboard.
// Part of the roster's client script; see ./index.ts.
export const DASHBOARD = `// ── DASHBOARD ────────────────────────────────────────────────
// ── STATS DASHBOARD ──────────────────────────────────────────
// Everything here is derived, never stored. Roster-shaped numbers come from
// DATA (already loaded, so they're free and work for any viewer); anything
// time-based comes from /activity/stats, which needs the activity permission
// and only sees the last 90 days. When that call fails the roster panels still
// render — the activity ones are simply left out rather than shown as zeroes,
// which would read as "nobody has logged a hangout".

const DASH_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DASH_MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DASH_DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DASH_DOW_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DASH_MEDALS = ['🥇','🥈','🥉'];
const DASH_STATUS_COLORS = { core:'#4ade80', loose:'#f5c842', fringe:'#f87171' };

// Names and schools come from a spreadsheet leaders type into by hand, so they
// reach the DOM as text, not markup.
function dashEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function dashTabLabel(sk) {
  const t = orgSettings && orgSettings.gradeTabs && orgSettings.gradeTabs[sk];
  return (t && t.label) || (sk === 'hs' ? 'High School' : 'Middle School');
}

function dashCountBy(items, pick) {
  const out = {};
  items.forEach(it => { const k = pick(it); if (k !== '' && k != null) out[k] = (out[k]||0) + 1; });
  return out;
}
function dashRanked(counts) {
  return Object.keys(counts).map(k => ({ label:k, value:counts[k] })).sort((a,b) => b.value - a.value);
}
function dashPct(n, d) { return d ? Math.round(n / d * 100) : 0; }

function dashDaysSince(dateStr) {
  const d = parseDateValue(dateStr);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
// Days until the next time this birthday comes round, not the age.
function dashDaysToBirthday(bd) {
  const d = parseDateValue(bd);
  if (!d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
  return Math.round((next - today) / 86400000);
}

// ── dashboard building blocks ────────────────────────────────
function dashTile(val, label, sub, unit) {
  return '<div class="dash-tile"><div class="dash-tile-val">' + val +
    (unit ? '<span class="unit">' + unit + '</span>' : '') + '</div>' +
    '<div class="dash-tile-label">' + label + '</div>' +
    (sub ? '<div class="dash-tile-sub">' + sub + '</div>' : '') + '</div>';
}
function dashPanel(title, inner, opts) {
  const o = opts || {};
  return '<div class="panel' + (o.full ? ' full' : '') + '">' +
    '<div class="panel-title">' + title + (o.badge ? '<span>' + o.badge + '</span>' : '') + '</div>' +
    inner + (o.note ? '<div class="dash-note">' + o.note + '</div>' : '') + '</div>';
}
function dashEmpty(msg) { return '<div class="dash-empty">' + msg + '</div>'; }

// rows: [{label, value}] — bar widths are relative to the biggest row, not to
// the total, so a breakdown with one dominant bucket still reads.
function dashBars(rows, suffix) {
  if (!rows.length) return dashEmpty('Nothing to show yet');
  const max = Math.max.apply(null, rows.map(r => r.value)) || 1;
  return rows.map(r =>
    '<div class="dash-bar-row">' +
      '<div class="dash-bar-label">' + dashEsc(r.label) + '</div>' +
      '<div class="dash-bar-track"><div class="dash-bar-fill" style="width:' + dashPct(r.value, max) + '%"></div></div>' +
      '<div class="dash-bar-val">' + r.value + (suffix || '') + '</div>' +
    '</div>').join('');
}

function dashRanks(rows) {
  if (!rows.length) return dashEmpty('Nothing to show yet');
  const max = Math.max.apply(null, rows.map(r => r.value)) || 1;
  return rows.map((r, i) =>
    '<div class="dash-bar-row">' +
      '<div class="dash-rank-medal">' + (DASH_MEDALS[i] || (i + 1)) + '</div>' +
      '<div class="dash-rank-name">' + dashEsc(r.label) + '</div>' +
      '<div class="dash-bar-track" style="max-width:110px"><div class="dash-bar-fill" style="width:' + dashPct(r.value, max) + '%"></div></div>' +
      '<div class="dash-bar-val">' + r.value + '</div>' +
    '</div>').join('');
}

// segs: [{label, value, color}]
function dashDonut(segs, centerText) {
  const live = segs.filter(s => s.value > 0);
  const total = segs.reduce((a, s) => a + s.value, 0);
  const R = 42, C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = live.map(s => {
    const dash = total ? s.value / total * C : 0;
    const el = '<circle cx="50" cy="50" r="' + R + '" fill="none" stroke="' + s.color +
      '" stroke-width="15" stroke-dasharray="' + dash.toFixed(2) + ' ' + (C - dash).toFixed(2) +
      '" stroke-dashoffset="' + (-offset).toFixed(2) + '"></circle>';
    offset += dash;
    return el;
  }).join('');
  const legend = segs.map(s =>
    '<div class="dash-legend-item"><span class="dash-legend-dot" style="background:' + s.color + '"></span>' +
    dashEsc(s.label) + ' · ' + s.value + ' (' + dashPct(s.value, total) + '%)</div>').join('');
  return '<div class="dash-donut-wrap">' +
    '<div class="dash-donut-chart">' +
      '<svg class="dash-donut-svg" viewBox="0 0 100 100">' +
        '<circle cx="50" cy="50" r="' + R + '" fill="none" stroke="var(--surface3)" stroke-width="15"></circle>' + arcs +
      '</svg>' +
      '<div class="dash-donut-center">' + centerText + '</div>' +
    '</div><div class="dash-donut-legend">' + legend + '</div></div>';
}

// cols: [{tick, value}]
function dashSpark(cols) {
  if (!cols.length) return dashEmpty('Nothing to show yet');
  const max = Math.max.apply(null, cols.map(c => c.value)) || 1;
  return '<div class="dash-spark">' + cols.map(c =>
    '<div class="dash-spark-col' + (c.value === max && max > 0 ? ' peak' : '') + '">' +
      '<div class="dash-spark-n">' + (c.value || '') + '</div>' +
      '<div class="dash-spark-bar" style="height:' + Math.max(2, Math.round(c.value / max * 58)) + 'px"></div>' +
      '<div class="dash-spark-tick">' + dashEsc(c.tick) + '</div>' +
    '</div>').join('') + '</div>';
}

function dashFact(icon, html) {
  return '<div class="dash-fact"><span class="dash-fact-icon">' + icon + '</span><span>' + html + '</span></div>';
}

async function renderDashboard() {
  const el = document.getElementById('dashboard-content');
  if (!el) return;
  el.innerHTML = '<div class="loader"><div class="loader-ring"></div></div>';

  let act = null;
  try {
    const r = await fetch('/api/activity/stats');
    if (r.ok) act = await r.json();
  } catch(e) { /* roster-only dashboard below; the activity panels drop out */ }

  const all = getAllStudents();
  const total = all.length;
  if (!total) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📊</div><p>No students on the roster yet — stats will show up here once there are.</p></div>';
    return;
  }

  const hsCount = all.filter(p => p._sk === 'hs').length;
  const msCount = total - hsCount;
  const connected = all.filter(isConnected).length;
  const needsConnection = all.filter(p => connectionState(p) === 'stale').length;
  const statusCounts = { core:0, loose:0, fringe:0 };
  all.forEach(p => { statusCounts[statusOf(p)]++; });

  // interactionCounts silently degrade to zero when the notes store is
  // unreachable or the viewer lacks access, which would read as "nobody has
  // ever hung out". Only draw those panels when the numbers are real.
  const hasCounts = interactionCountsOk;
  const hangouts = all.reduce((a, p) => a + (+p.interactionCount || 0), 0);
  const noHangout = all.filter(p => !(+p.interactionCount)).length;
  const avgHangouts = total ? (hangouts / total) : 0;

  const schoolRanks = dashRanked(dashCountBy(all, p => (p.school || '').trim()));
  const gradeRanks = dashRanked(dashCountBy(all, p => (p.grade || '').toString().trim()))
    .sort((a, b) => (+a.label || 99) - (+b.label || 99));

  const ages = all.map(p => calcAge(p.birthday)).filter(a => a);
  const avgAge = ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length) : null;
  const withPhoto = all.filter(p => p.photoUrl).length;
  const withNotes = all.filter(p => (p.notes || '').trim() || (p.noteCount || 0) > 0).length;

  const goalsTotal = all.reduce((a, p) => a + (p.goals || []).length, 0);
  const goalsDone = all.reduce((a, p) => a + (p.goals || []).filter(g => g.done).length, 0);
  const withGoals = all.filter(p => (p.goals || []).length).length;

  const neverConnected = all.filter(p => !p.lastConnected).length;

  // ── headline tiles ──
  let html = '<div class="dash-section-title">The Big Numbers</div><div class="dash-tiles">' +
    dashTile(total, 'Students', dashTabLabel('hs') + ' ' + hsCount + ' · ' + dashTabLabel('ms') + ' ' + msCount) +
    dashTile(dashPct(connected, total), 'Connection Rate', connected + ' of ' + total + ' families connected', '%') +
    (hasCounts ? dashTile(hangouts, 'Hangouts Logged', 'All time, across every student') : '') +
    (hasCounts ? dashTile(avgHangouts.toFixed(1), 'Hangouts / Student', noHangout + ' still at zero') : '') +
    (act ? dashTile(act.thisMonth || 0, 'Hangouts This Month', (act.last7 || 0) + ' in the last 7 days') : '') +
    (act ? dashTile(act.activeLeaders7 || 0, 'Leaders Active', 'Logged something this week') : '') +
    dashTile(schoolRanks.length, 'Schools', 'Campuses we show up on') +
    dashTile(goalsTotal ? dashPct(goalsDone, goalsTotal) : 0, 'Goals Complete', goalsDone + ' of ' + goalsTotal + ' checked off', '%') +
  '</div>';

  // ── who's on the roster ──
  html += '<div class="dash-section-title">Who\\'s On The Roster</div><div class="dash-grid">';
  html += dashPanel('🎯 Connection Status', dashDonut([
      { label:'Core', value:statusCounts.core, color:DASH_STATUS_COLORS.core },
      { label:'Loosely Connected', value:statusCounts.loose, color:DASH_STATUS_COLORS.loose },
      { label:'Fringe', value:statusCounts.fringe, color:DASH_STATUS_COLORS.fringe },
    ], String(total)));
  html += dashPanel('🤝 Family Connection', dashDonut([
      { label:'Connected', value:connected, color:'#4ade80' },
      { label:'Needs a connection', value:needsConnection, color:'#fbbf24' },
      { label:'Not yet', value:total - connected - needsConnection, color:'#f87171' },
    ], dashPct(connected, total) + '%'), {
      badge: 'resets after ' + connectionResetMonths() + ' mo' });
  html += dashPanel('🎓 By Grade', dashBars(gradeRanks.map(g => ({ label:'Grade ' + g.label, value:g.value }))));
  html += dashPanel('🏫 By School', dashBars(schoolRanks.slice(0, 8)), {
    badge: schoolRanks.length > 8 ? '+' + (schoolRanks.length - 8) + ' more' : '' });
  html += '</div>';

  // ── connection health ──
  const stale = all
    .map(p => ({ p:p, days: dashDaysSince(p.lastConnected) }))
    .sort((a, b) => {
      if (a.days === null && b.days === null) return 0;
      if (a.days === null) return -1;   // never connected sorts to the top
      if (b.days === null) return 1;
      return b.days - a.days;
    }).slice(0, 8);
  const staleHtml = stale.map(s =>
    '<div class="dash-list-row"><span class="grow">' + dashEsc(s.p.name) + '</span>' +
    '<span class="dash-list-note ' + (s.days === null || s.days > 60 ? 'warn' : '') + '">' +
    (s.days === null ? 'never' : s.days + 'd ago') + '</span></div>').join('');

  const gradeHealth = gradeRanks.filter(g => g.value >= 3).map(g => {
    const inGrade = all.filter(p => (p.grade || '').toString().trim() === g.label);
    return { label:'Grade ' + g.label, value: dashPct(inGrade.filter(isConnected).length, inGrade.length) };
  }).sort((a, b) => b.value - a.value);

  html += '<div class="dash-section-title">Connection Health</div><div class="dash-grid">';
  html += dashPanel('⏳ Longest Without A Connection', staleHtml || dashEmpty('Everyone is up to date'), {
    note: neverConnected ? neverConnected + ' student' + (neverConnected === 1 ? '' : 's') + ' have never been connected with.' : '' });
  html += dashPanel('🏅 Connection Rate By Grade', dashBars(gradeHealth, '%'), { badge:'grades of 3+' });
  html += '</div>';

  // ── hangouts ──
  if (act) {
    const topStudents = all.filter(p => +p.interactionCount > 0)
      .sort((a, b) => (+b.interactionCount) - (+a.interactionCount)).slice(0, 8)
      .map(p => ({ label:p.name, value:+p.interactionCount }));
    const dowRows = (act.byDayOfWeek || []).map((n, i) => ({ label:DASH_DOW_FULL[i], value:n }));
    // A per-week MM-DD tick truncates to "08-…" on a phone, where twelve of
    // them are identical and useless. Label the month only when it changes, so
    // the axis reads Jun · Jul · Aug at any width.
    let tickMonth = '';
    const weeks = (act.byWeek || []).map(w => {
      const mo = String(w.label).slice(0, 2);
      const tick = mo === tickMonth ? '' : (DASH_MONTHS_SHORT[(+mo || 1) - 1] || '');
      tickMonth = mo;
      return { tick:tick, value:w.count };
    });

    html += '<div class="dash-section-title">Hangouts <small>last ' + (act.windowDays || 90) + ' days</small></div>';
    html += dashPanel('📈 Last 12 Weeks', dashSpark(weeks), { full:true, badge:(act.last30 || 0) + ' in 30 days' });
    html += '<div class="dash-grid" style="margin-top:18px">';
    const leaderRows = (act.topLeaders || []).map(l => ({ label:l.name, value:l.count }));
    html += dashPanel('🏆 Most Active Leaders', dashRanks(leaderRows));
    html += dashPanel('📅 Day Of The Week', dashBars(dowRows));
    if (hasCounts) {
      html += dashPanel('❤️ Most Hung Out With', dashRanks(topStudents), { badge:'all time' });
      html += dashPanel('🎲 Hangout Coverage', dashDonut([
          { label:'Hung out with', value: total - noHangout, color:'#4ade80' },
          { label:'Not yet', value: noHangout, color:'#f87171' },
        ], dashPct(total - noHangout, total) + '%'));
    }
    html += '</div>';
  }

  // ── birthdays ──
  const bdays = all.map(p => ({ p:p, days: dashDaysToBirthday(p.birthday) }))
    .filter(b => b.days !== null && b.days <= 60)
    .sort((a, b) => a.days - b.days).slice(0, 10);
  const bdayHtml = bdays.map(b =>
    '<div class="dash-list-row"><span class="grow">' + dashEsc(b.p.name) + '</span>' +
    '<span class="dash-list-note">' + formatDate(b.p.birthday).replace(/,.*$/, '') + '</span>' +
    '<span class="dash-list-note ' + (b.days <= 7 ? 'soon' : '') + '">' +
    (b.days === 0 ? 'today 🎉' : b.days === 1 ? 'tomorrow' : 'in ' + b.days + 'd') + '</span></div>').join('');

  const monthCounts = [0,0,0,0,0,0,0,0,0,0,0,0];
  all.forEach(p => { const d = parseDateValue(p.birthday); if (d) monthCounts[d.getMonth()]++; });
  const monthRows = monthCounts.map((n, i) => ({ label:DASH_MONTHS_SHORT[i], value:n }));

  html += '<div class="dash-section-title">Birthdays</div><div class="dash-grid">';
  html += dashPanel('🎂 Coming Up', bdayHtml || dashEmpty('No birthdays in the next 60 days'), { badge:'next 60 days' });
  html += dashPanel('📆 Birthday Months', dashBars(monthRows));
  html += '</div>';

  // ── trivia ──
  const facts = [];
  if (schoolRanks.length) facts.push(dashFact('🏫', 'Biggest campus is <b>' + dashEsc(schoolRanks[0].label) + '</b> with <b>' + schoolRanks[0].value + '</b> student' + (schoolRanks[0].value === 1 ? '' : 's') + '.'));
  const topMonth = monthCounts.indexOf(Math.max.apply(null, monthCounts));
  if (monthCounts[topMonth] > 0) facts.push(dashFact('🎈', 'More birthdays land in <b>' + DASH_MONTHS[topMonth] + '</b> than any other month (<b>' + monthCounts[topMonth] + '</b>).'));

  // Same month and day, any year — the "wait, you too?" stat.
  const byMonthDay = {};
  all.forEach(p => {
    const d = parseDateValue(p.birthday);
    if (d) { const k = d.getMonth() + '-' + d.getDate(); (byMonthDay[k] = byMonthDay[k] || []).push(p.name); }
  });
  const twins = Object.keys(byMonthDay).filter(k => byMonthDay[k].length > 1);
  if (twins.length) facts.push(dashFact('👯', '<b>' + twins.length + '</b> birthday' + (twins.length === 1 ? '' : 's') + ' shared by two or more students — including <b>' + dashEsc(byMonthDay[twins[0]].join(' & ')) + '</b>.'));

  const initials = dashRanked(dashCountBy(all, p => (p.name || '').trim().charAt(0).toUpperCase()));
  if (initials.length && initials[0].value > 1) facts.push(dashFact('🔤', '<b>' + initials[0].value + '</b> students have names starting with <b>' + dashEsc(initials[0].label) + '</b> — the most of any letter.'));

  if (avgAge) facts.push(dashFact('🧮', 'Average age on the roster is <b>' + avgAge.toFixed(1) + '</b>.'));
  facts.push(dashFact('📸', '<b>' + dashPct(withPhoto, total) + '%</b> of students have a photo on file (' + withPhoto + ' of ' + total + ').'));
  facts.push(dashFact('📝', '<b>' + withNotes + '</b> student' + (withNotes === 1 ? ' has' : 's have') + ' notes written about them.'));
  if (hasCounts && noHangout) facts.push(dashFact('👋', '<b>' + noHangout + '</b> student' + (noHangout === 1 ? ' has' : 's have') + ' never had a hangout logged.'));
  if (withGoals) facts.push(dashFact('🎯', '<b>' + withGoals + '</b> student' + (withGoals === 1 ? '' : 's') + ' are working on goals — <b>' + goalsDone + '</b> of <b>' + goalsTotal + '</b> are done.'));
  if (gradeHealth.length) facts.push(dashFact('🥇', '<b>' + dashEsc(gradeHealth[0].label) + '</b> is the most connected grade at <b>' + gradeHealth[0].value + '%</b>.'));

  if (act) {
    if (act.busiestDay) facts.push(dashFact('🔥', 'Busiest day was <b>' + formatDate(act.busiestDay.date) + '</b> with <b>' + act.busiestDay.count + '</b> hangouts logged.'));
    const dow = act.byDayOfWeek || [];
    const maxDow = Math.max.apply(null, dow.concat([0]));
    if (maxDow > 0) facts.push(dashFact('📅', '<b>' + DASH_DOW_FULL[dow.indexOf(maxDow)] + '</b> is the most common day to hang out.'));
    if (act.daysLogged) facts.push(dashFact('🗓️', 'Something was logged on <b>' + act.daysLogged + '</b> different day' + (act.daysLogged === 1 ? '' : 's') + '.'));
    if (act.uniqueLeaders) facts.push(dashFact('🙌', '<b>' + act.uniqueLeaders + '</b> different leader' + (act.uniqueLeaders === 1 ? ' has' : 's have') + ' logged a hangout.'));
  }

  html += '<div class="dash-section-title">Fun Facts</div>' +
    dashPanel('✨ Things The Roster Knows', facts.join(''), { full:true });

  if (!act) html += '<div class="dash-note" style="text-align:center;margin-top:24px">Hangout stats are hidden — they need activity access.</div>';

  el.innerHTML = html;
}

`;
