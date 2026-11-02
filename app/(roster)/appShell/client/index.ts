import { STATE } from "./01-state";
import { HELPERS } from "./02-helpers";
import { GATE_AND_INIT } from "./03-gate-and-init";
import { ROSTER_GRID } from "./04-roster-grid";
import { DATE_PICKER_AND_TABS } from "./05-date-picker-and-tabs";
import { ACCOUNT } from "./06-account";
import { EDIT_STUDENT } from "./07-edit-student";
import { STUDENT_DETAIL } from "./08-student-detail";
import { ACTIVITY } from "./09-activity";
import { QUICK_LOG } from "./10-quick-log";
import { ADMINLAND } from "./11-adminland";
import { FILTERS } from "./12-filters";
import { MENTORS } from "./13-mentors";
import { APPRENTICES_EXPORT } from "./14-apprentices-export";
import { DASHBOARD } from "./15-dashboard";
import { UI } from "./16-ui";
import { PHOTO_CROP } from "./17-photo-crop";
import { BRANDING } from "./18-branding";
import { SETTINGS } from "./19-settings";
import { INSTALL_AND_TOUR } from "./20-install-and-tour";
import { BOOT } from "./21-boot";

// The roster's whole client script. Each file holds one feature's plain
// browser JavaScript inside a template string; they're concatenated in this
// order into the single <script> that ../../route.ts inlines into the page.
// They all share one global scope, so order matters only for top-level
// statements that run immediately (the `let` state in 01 must come first,
// and 21's DOMContentLoaded handler last) — function declarations hoist.
//
// Nothing here is type-checked: it's text. Watch backslashes — inside these
// template strings a regex like /\\s/ has to be written with a doubled
// backslash, and an apostrophe inside a single-quoted JS string as \\'.
export const APP_JS = [
  STATE,
  HELPERS,
  GATE_AND_INIT,
  ROSTER_GRID,
  DATE_PICKER_AND_TABS,
  ACCOUNT,
  EDIT_STUDENT,
  STUDENT_DETAIL,
  ACTIVITY,
  QUICK_LOG,
  ADMINLAND,
  FILTERS,
  MENTORS,
  APPRENTICES_EXPORT,
  DASHBOARD,
  UI,
  PHOTO_CROP,
  BRANDING,
  SETTINGS,
  INSTALL_AND_TOUR,
  BOOT,
].join("");
