import { CSS } from "./appShell/css";
import { HTML_BODY } from "./appShell/body";
import { APP_JS } from "./appShell/client";

// Vercel Web Analytics and Speed Insights, as plain tags because this page
// isn't React. Vercel only serves these paths on its own deployments, so
// they're left out elsewhere (VERCEL is set by the platform) to keep local
// dev free of 404s.
const VERCEL_SCRIPTS = process.env.VERCEL
  ? `<script defer src="/_vercel/insights/script.js"></script>
<script defer src="/_vercel/speed-insights/script.js"></script>`
  : "";

// The whole app is this one HTML page: markup (appShell/body.ts), styles
// (appShell/css.ts) and a vanilla-JS single-page app (appShell/client/*)
// inlined into a single response. It is deliberately not a React page — it
// does its own DOM manipulation and talks to the routes under api/. See
// docs/ARCHITECTURE.md.
function getHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="ASM Roster">
<meta name="theme-color" content="#0a0a0f">
<title>ASM 2026 · Anthem Students</title>
<link rel="manifest" href="/manifest.json">
<!-- The roster's own icons; there is no site-wide /favicon.ico. -->
<link rel="icon" type="image/png" sizes="16x16" href="/roster-icon-16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/roster-icon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/roster-icon-192.png">
<link rel="apple-touch-icon" href="/roster-apple-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<div class="bg-glow"></div>
${HTML_BODY}
<script>${APP_JS}</script>
${VERCEL_SCRIPTS}
</body>
</html>`;
}

export async function GET() {
  return new Response(getHTML(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
