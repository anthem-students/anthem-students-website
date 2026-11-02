// Syntax-checks the roster's client script. The browser JS lives inside
// template strings in app/(roster)/appShell/client/*.ts, so neither TypeScript
// nor `next build` ever parses it — a typo there only shows up as a blank page.
// This joins the fragments exactly as client/index.ts does and parses the
// result. Usage: npm run check:client
const ts = require("typescript");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dir = path.join(__dirname, "..", "app", "(roster)", "appShell", "client");
let js = "";
for (const file of fs.readdirSync(dir).filter((f) => /^\d\d-.*\.ts$/.test(f)).sort()) {
  const source = fs.readFileSync(path.join(dir, file), "utf8");
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function("exports", "module", out)(mod.exports, mod);
  const fragment = Object.values(mod.exports)[0];
  if (typeof fragment !== "string") {
    console.error(`${file}: expected one exported string — is there a stray backtick in it?`);
    process.exit(1);
  }
  js += fragment;
}

try {
  new vm.Script(js, { filename: "roster-client.js" });
  console.log(`Client script OK (${js.length.toLocaleString()} chars).`);
} catch (e) {
  console.error(`Client script has a syntax error: ${e.message}`);
  console.error(e.stack.split("\n").slice(0, 3).join("\n"));
  process.exit(1);
}
