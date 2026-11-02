// Leader directory (email -> name/photo) and public org branding.
// Part of the roster's client script; see ./index.ts.
export const BRANDING = `// ── LEADER DIRECTORY (name/photo lookup by email) ──────────────
// Backs the leader avatar shown next to a logged hangout, a note, and an
// activity-feed item — those records store leaderEmail, this resolves it to
// a face. One shared in-flight promise so concurrent callers (student detail
// loading notes+connections+interactions at once) share a single request.
let leaderDirectory = [];
let adminUsersCache = [];
let leaderDirectoryPromise = null;
function loadLeaderDirectory() {
  if (!leaderDirectoryPromise) {
    leaderDirectoryPromise = fetch('/api/leaders')
      .then(r => r.json())
      .then(d => { leaderDirectory = d.leaders || []; return leaderDirectory; })
      .catch(() => { leaderDirectory = []; return leaderDirectory; });
  }
  return leaderDirectoryPromise;
}
function findLeaderByEmail(email) {
  if (!email) return null;
  const e = String(email).toLowerCase();
  return leaderDirectory.find(l => (l.email || '').toLowerCase() === e) || null;
}

// ── ORG SETTINGS (public branding) ────────────────────────────
async function loadOrgSettings() {
  try {
    const cached = localStorage.getItem('asm-org-settings');
    if (cached) { orgSettings = JSON.parse(cached); applyBranding(); }
    const res = await fetch('/api/settings/public');
    const data = await res.json();
    orgSettings = data;
    localStorage.setItem('asm-org-settings', JSON.stringify(data));
    applyBranding();
  } catch(e) {}
}

function applyBranding() {
  if (!orgSettings) return;
  const name = orgSettings.ministryName || 'Anthem Students';
  const logo = orgSettings.logoUrl || '';
  document.documentElement.classList.remove('logo-needs-invert','logo-needs-dark');
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  if (currentTheme === 'dark' && orgSettings.logoTone === 'dark') document.documentElement.classList.add('logo-needs-invert');
  if (currentTheme === 'light' && orgSettings.logoTone === 'light') document.documentElement.classList.add('logo-needs-dark');

  // Update gate screen
  const gateLogo = document.getElementById('gate-logo-area');
  const gateLogoEl = document.querySelector('.gate-logo');
  if (logo && gateLogoEl) {
    gateLogoEl.innerHTML = '<img class="gate-logo-img" src="'+esc(logo)+'" alt="'+esc(name)+'">';
  }
  const gateSub = document.querySelector('.gate-sub');
  if (gateSub && orgSettings.campus) {
    gateSub.textContent = name + ' · ' + orgSettings.campus;
  } else if (gateSub) {
    gateSub.textContent = name;
  }

  // Update nav logo
  document.querySelectorAll('.nav-logo').forEach(el => {
    // Skip settings nav
    if (el.closest('#screen-settings')) return;
    if (logo) {
      el.innerHTML = '<img class="nav-logo-img" src="'+esc(logo)+'" alt="'+esc(name)+'">';
    }
  });

  // Update subtitle in roster header
  const subtitle = document.querySelector('#nav-roster .subtitle');
  if (subtitle) {
    const yr = new Date().getFullYear();
    subtitle.textContent = name + ' · ASM ' + yr;
  }

  // Update gate access mode visibility
  const passcodeLane = document.getElementById('gate-lane-passcode');
  if (passcodeLane) {
    const mode = orgSettings.accessMode || 'leaders-only';
    passcodeLane.style.display = mode === 'shared-passcode' ? '' : 'none';
  }

  // Apply appearance settings
  if (orgSettings.appearance) {
    if (orgSettings.appearance.compactMode) document.body.classList.add('compact-mode');
    else document.body.classList.remove('compact-mode');
    const bnav = document.getElementById('bottom-nav');
    if (bnav && orgSettings.appearance.stickyBottomTabs === false) bnav.style.display = 'none';
  }
}

`;
