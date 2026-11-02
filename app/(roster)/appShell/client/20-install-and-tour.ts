// Save-as-app instructions and the first-run tour.
// Part of the roster's client script; see ./index.ts.
export const INSTALL_AND_TOUR = `// ── SAVE AS APP ───────────────────────────────────────────────
// Saved to the home screen, the roster loses the browser chrome and opens on
// one tap, which is how nearly every leader actually uses it — so it's worth
// telling them it exists instead of leaving it to whoever thinks to look in a
// share menu.
//
// Chrome hands over a real install prompt through beforeinstallprompt; Safari
// on iOS has no such API and never will, so the steps are spelled out there.
let deferredInstallPrompt = null;

function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch(e) { return false; }
}

function platformGuess() {
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Chrome on iOS is still WebKit underneath and installs through its own
  // share menu, so it needs its own steps rather than Safari's or Android's.
  if (iOS) return /CriOS/.test(ua) ? 'ios-chrome' : 'ios-safari';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

function installStepsHtml() {
  if (isStandalone()) {
    return '<div class="install-done">✓ You are already using the saved app. Nothing to do.</div>';
  }
  if (deferredInstallPrompt) {
    return '<p class="install-intro">One tap and the roster lands on your home screen like any other app.</p>' +
      '<button class="btn-save install-now-btn" onclick="doInstall()">📲 Add To Home Screen</button>';
  }
  const steps = {
    'ios-safari': [
      'Tap the <strong>Share</strong> button at the bottom of Safari (the square with an arrow coming out of it).',
      'Scroll down and tap <strong>Add to Home Screen</strong>.',
      'Tap <strong>Add</strong> in the top corner. The ASM icon appears on your home screen.',
    ],
    'ios-chrome': [
      'Tap the <strong>Share</strong> button in Chrome (the square with an arrow, next to the address bar).',
      'Scroll down and tap <strong>Add to Home Screen</strong>.',
      'Tap <strong>Add</strong>. The ASM icon appears on your home screen.',
    ],
    'android': [
      'Tap the <strong>⋮</strong> menu in the top right of Chrome.',
      'Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>).',
      'Confirm, and the ASM icon appears on your home screen.',
    ],
    'desktop': [
      'Look for the <strong>install icon</strong> at the right-hand end of the address bar.',
      'Click it, then click <strong>Install</strong>.',
      'The roster opens in its own window from then on.',
    ],
  };
  const list = steps[platformGuess()] || steps.desktop;
  return '<p class="install-intro">It takes about ten seconds:</p>' +
    '<ol class="install-steps">' + list.map(t => '<li>' + t + '</li>').join('') + '</ol>' +
    '<p class="install-note">You will stay signed in — you will not have to log in again each time.</p>';
}

function openInstallGuide() {
  const body = document.getElementById('install-body');
  if (body) {
    body.innerHTML = installStepsHtml() +
      '<button class="install-replay" onclick="replayTour()">Show the quick tour again</button>';
  }
  openModal('install-modal');
}

async function doInstall() {
  if (!deferredInstallPrompt) return;
  const prompt = deferredInstallPrompt;
  // The event is single-use — once prompted it can't be replayed, so it's
  // dropped whatever the leader chooses.
  deferredInstallPrompt = null;
  try {
    prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice && choice.outcome === 'accepted') {
      closeModal('install-modal');
      showToast('✓ Added to your home screen','ok');
      return;
    }
  } catch(e) { /* fall through to the written steps */ }
  const body = document.getElementById('install-body');
  if (body) body.innerHTML = installStepsHtml();
}

// ── FIRST-RUN TOUR ────────────────────────────────────────────
// Four cards, once, the first time a leader signs in on a device. Deliberately
// short: a leader opening this for the first time is usually standing in a room
// full of students, not reading documentation.
const TOUR_SEEN_KEY = 'asm-tour-seen-v1';
const TOUR_STEPS = [
  {
    icon: '👋',
    title: 'Welcome',
    body: 'This is the student roster. Everything about a student — their goals, your notes, the hangouts, and when their parents were last connected with — lives on their card.',
  },
  {
    icon: '👀',
    title: 'The Badges',
    body: 'Every card carries a badge. <strong>Family Connected With</strong> means their parents have been reached recently. <strong>Needs Connection</strong> means it has been a while and they are due. Use <strong>Filters</strong> to pull up just the ones who are due.',
  },
  {
    icon: '🤝',
    title: 'Logging A Connection',
    body: 'Tap the badge the moment you connect with a family — today gets logged automatically. Open the student and you can see every connection, fix a date, or add one you forgot.',
  },
  {
    icon: '📲',
    title: 'Save It As An App',
    body: 'Put the roster on your home screen and it opens in one tap, full screen, already signed in.',
    install: true,
  },
];
let tourStep = 0;

function maybeShowTour() {
  // Only for a real signed-in leader: a passcode viewer can't log anything the
  // tour talks about, and a pending account can't either.
  if (!currentUser || !currentUser.email || !canEdit) return;
  let seen = null;
  try { seen = localStorage.getItem(TOUR_SEEN_KEY); } catch(e) { return; }
  if (seen) return;
  startTour();
}

function startTour() {
  tourStep = 0;
  renderTourStep();
  openModal('tour-modal');
}

function renderTourStep() {
  const step = TOUR_STEPS[tourStep];
  if (!step) return;
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set('tour-icon', step.icon);
  set('tour-title', step.title);
  set('tour-body', step.body + (step.install ? '<div class="tour-install">' + installStepsHtml() + '</div>' : ''));
  set('tour-dots', TOUR_STEPS.map((_, i) => '<span class="tour-dot' + (i === tourStep ? ' active' : '') + '"></span>').join(''));
  const next = document.getElementById('tour-next');
  if (next) next.textContent = tourStep === TOUR_STEPS.length - 1 ? "Got it" : 'Next →';
}

function tourNext() {
  if (tourStep >= TOUR_STEPS.length - 1) { endTour(); return; }
  tourStep++;
  renderTourStep();
}

// Marked seen however it ends, including a skip — a leader who dismissed it
// once should not meet it again on every sign-in.
function endTour() {
  try { localStorage.setItem(TOUR_SEEN_KEY, '1'); } catch(e) { /* private mode */ }
  closeModal('tour-modal');
}

function replayTour() { closeModal('install-modal'); startTour(); }

`;
