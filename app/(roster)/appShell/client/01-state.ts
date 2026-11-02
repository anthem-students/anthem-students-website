// Global state, theme, swipe-back gesture and the avatar gradient palette.
// Part of the roster's client script; see ./index.ts.
export const STATE = `
'use strict';

// ── STATE ───────────────────────────────────────────────────
let currentUser = null;
let canEdit = false;
let DATA = { hs:{students:[]}, ms:{students:[]} };
let currentStudentKey = null;
let editState = { mode:'add', sk:'hs', index:-1 };
// Transient crop metadata for the edit-student-modal's photo field — mirrors
// ef-photoUrl's own transient-until-saveEdit() nature, since a new student
// has no id yet to persist a photoCrop row under.
let efPhotoCrop = null;
// The thumbnail uploaded with the edit form's photo, and the photo URL it
// belongs to — so a thumb is only sent if the URL field still holds that photo.
let efThumbUrl = null, efThumbFor = null;
let connectedVal = false;
let interactionKey = null;
let editInteractionContext = null;
let pendingDeleteInteraction = null;
let currentInteractions = [];
let currentNotes = [];        // the open student's notes, for in-place edit/delete
let noteConfirmDelete = null; // id of the note whose Delete button is armed
let noteEditingId = null;     // id of the note currently open for editing
let currentConnections = [];  // the open student's parent-connection log
let connEditingId = null;     // id of the connection row open for editing
let connConfirmDelete = null; // id of the connection row whose Delete is armed
let connectionResetDone = false; // the stale sweep runs once per roster load
let toastTimer = null;
let resetToken = null;        // held in memory only; stripped from the URL on boot

// ── ORG SETTINGS ────────────────────────────────────────────
let orgSettings = null;       // loaded from /api/settings/public on boot
let settingsData = null;      // full settings for admin editing
let settingsOriginal = null;  // snapshot for cancel/dirty detection
let settingsDirty = false;

// ── THEME ────────────────────────────────────────────────────
function initTheme() {
  const pref = localStorage.getItem('asm-theme') || 'auto';
  applyTheme(pref);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem('asm-theme') || 'auto') === 'auto') applyTheme('auto');
  });
}
function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'light') root.setAttribute('data-theme', 'light');
  else if (pref === 'dark') root.setAttribute('data-theme', 'dark');
  else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
  localStorage.setItem('asm-theme', pref);
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById('theme-btn-' + pref);
  if (activeBtn) activeBtn.classList.add('active');
  if (typeof applyBranding === 'function') applyBranding();
}

// ── SWIPE BACK ────────────────────────────────────────────────
function initSwipeBack() {
  const screen = document.getElementById('screen-student');
  if (!screen) return;
  let startX = 0, startY = 0;
  screen.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  screen.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (startX < 50 && dx > 80 && Math.abs(dy) < 80) goBack();
  }, { passive: true });
}

// ── GRADIENTS (yellow palette) ──────────────────────────────
const GRADIENTS = [
  'linear-gradient(135deg,#f5c842,#f0a800)',
  'linear-gradient(135deg,#fbbf24,#f59e0b)',
  'linear-gradient(135deg,#fcd34d,#fbbf24)',
  'linear-gradient(135deg,#f0a800,#d97706)',
  'linear-gradient(135deg,#fde68a,#f5c842)',
  'linear-gradient(135deg,#f59e0b,#d97706)',
  'linear-gradient(135deg,#f5c842,#fbbf24)',
  'linear-gradient(135deg,#fbbf24,#f0a800)',
];

`;
