// Org-wide settings, stored as one JSON object at roster_kv `settings:org` and
// edited from the admin Settings screen. What's stored is laid over these
// defaults with deepMerge, so a key added here takes effect even for settings
// saved before it existed.
export const SETTINGS_KEY = "settings:org";

export const DEFAULT_ROSTER_SETTINGS = {
  ministryName: "Anthem Students",
  campus: "",
  logoUrl: "",
  logoEnabled: false,
  logoTone: "light",
  // Display names for the two roster tabs (students are filed by tab, not grade).
  gradeTabs: {
    hs: { label: "High School" },
    ms: { label: "Middle School" },
  },
  tracking: {
    hangoutNotes: true,
    birthdays: true,
    showGrade: true,
    school: true,
    age: true,
  },
  // A family connected with once in September is not still "connected" the
  // following June. After `resetAfterMonths` with no new connection the card
  // shows "Needs Connection", and with `autoReset` on the client also clears
  // the student's `connected` flag in the database so the two don't drift.
  connections: {
    resetAfterMonths: 3,
    autoReset: true,
  },
  access: {
    mode: "leaders-only",
    // Comma-separated. Blank sends leader access requests to every admin.
    requestEmails: "",
    passcode: "",
    // What a view-only passcode session may read (enforced in lib/auth.ts).
    passcodePermissions: {
      viewRoster: true,
      viewNotes: false,
    },
  },
  appearance: {
    theme: "auto",
    compactMode: false,
    stickyBottomTabs: true,
  },
  permissions: {
    roles: ["pending", "approved", "leader", "admin"],
    levels: ["none", "view", "edit", "admin"],
    modules: {
      roster: { pending: "view", approved: "edit", leader: "edit", admin: "admin" },
      activity: { pending: "view", approved: "view", leader: "edit", admin: "admin" },
      hangoutNotes: { pending: "none", approved: "edit", leader: "edit", admin: "admin" },
      adminland: { pending: "none", approved: "none", leader: "none", admin: "admin" },
      dashboard: { pending: "view", approved: "view", leader: "view", admin: "admin" },
    },
  },
};

// Plain-object merge, later sources winning; arrays and scalars are replaced.
export function deepMerge(...sources: object[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const src of sources) {
    if (!src) continue;
    for (const key of Object.keys(src)) {
      const value = (src as Record<string, unknown>)[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        result[key] = deepMerge((result[key] as object) || {}, value as object);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}
