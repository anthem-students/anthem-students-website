// Small formatting helpers (dates, ages, Drive thumbnails), screen switching and the main nav panels.
// Part of the roster's client script; see ./index.ts.
export const HELPERS = `// ── HELPERS ─────────────────────────────────────────────────
// Escape anything a person typed (names, notes, schools…) before it goes into
// innerHTML or an HTML attribute. Most of this app builds HTML by string
// concatenation, so every interpolated value from the database goes through
// esc() — including into attributes, since it escapes both quote characters.
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function initials(n) {
  return (n||'?').trim().split(/\\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
}
// w defaults to a normal display size; the crop editor asks for a much larger
// w so there's real pixel headroom to zoom into. Deliberately aspect-preserving
// (sz=w{w} alone) rather than the old "w200-h200-c", which asked Drive to
// center-crop to a square BEFORE the browser ever sees it — that silently
// destroyed the parts of a non-square photo the crop-metadata feature needs
// to still be there to pan/zoom into.
function driveThumb(url, w) {
  if (!url) return null;
  const raw = String(url).trim();
  const size = w || 400;

  // Direct Google-hosted image URLs are served as-is.
  if (/^https?:\\/\\//.test(raw) && raw.includes('googleusercontent.com')) return raw;

  const mPath = raw.match(/\\/d\\/([a-zA-Z0-9_-]+)/);
  if (mPath) return 'https://drive.google.com/thumbnail?id=' + mPath[1] + '&sz=w' + size;

  try {
    const u = new URL(raw);
    const id = u.searchParams.get('id');
    if (id) return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + size;
  } catch (_) {}

  return /^https?:\\/\\//.test(raw) ? raw : null;
}
// A bare YYYY-MM-DD parses as UTC midnight and then renders one day earlier in
// any timezone behind UTC, so birthdays would read a day off. Build those as a
// local date instead; anything else (full ISO timestamps) parses as before.
function parseDateValue(val) {
  if (!val) return null;
  const s = String(val);
  const bare = s.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  const d = bare ? new Date(+bare[1], +bare[2] - 1, +bare[3]) : new Date(s);
  return isNaN(d) ? null : d;
}
function formatDate(val) {
  if (!val) return '';
  const d = parseDateValue(val);
  if (!d) return val;
  return d.toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'});
}
function calcAge(bd) {
  if (!bd) return null;
  const d = parseDateValue(bd);
  if (!d) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() - d.getMonth() < 0 || (now.getMonth()===d.getMonth() && now.getDate()<d.getDate())) age--;
  return age > 0 && age < 30 ? age : null;
}
// Whole months between a date and now, floored — the unit the reset window is
// set in. Calendar months rather than 30-day blocks, so "3 months" from Jan 15
// means Apr 15 whatever the month lengths in between were.
function monthsSince(val) {
  const d = parseDateValue(val);
  if (!d) return null;
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months--;
  return Math.max(0, months);
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000);
  if (m<2) return 'just now';
  if (m<60) return m+'m ago';
  const h = Math.floor(m/60);
  if (h<24) return h+'h ago';
  const days = Math.floor(h/24);
  if (days<7) return days+'d ago';
  const wk = Math.floor(days/7);
  if (wk<5) return wk+'w ago';
  return Math.floor(days/30)+'mo ago';
}

// ── SCREEN MANAGEMENT ────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-'+name);
  if (el) { el.classList.add('active'); window.scrollTo(0,0); }
  const bnav = document.getElementById('bottom-nav');
  if (bnav) bnav.style.display = name === 'app' ? '' : 'none';
}

// ── MAIN NAV PANELS ──────────────────────────────────────────
function switchMainNav(name, btn) {
  document.querySelectorAll('.nav-panel').forEach(p => p.style.display='none');
  const p = document.getElementById('nav-'+name);
  if (p) p.style.display='';
  document.querySelectorAll('.nav-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Sync mobile drawer active state
  ['roster','dashboard','activity','quicklog'].forEach(n => {
    const mb = document.getElementById('mob-pill-'+n);
    if (mb) mb.classList.toggle('active', n === name);
  });
  // Sync bottom nav active state
  ['roster','dashboard','activity','quicklog'].forEach(n => {
    const bb = document.getElementById('bnav-'+n);
    if (bb) bb.classList.toggle('active', n === name);
  });
  if (name==='activity') loadActivityFeed();
  if (name==='dashboard') renderDashboard();
}

function toggleMobileNav() {
  document.getElementById('mobile-nav-drawer').classList.toggle('open');
  document.getElementById('mobile-nav-overlay').classList.toggle('open');
}
function closeMobileNav() {
  document.getElementById('mobile-nav-drawer').classList.remove('open');
  document.getElementById('mobile-nav-overlay').classList.remove('open');
}

`;
