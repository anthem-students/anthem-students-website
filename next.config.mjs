import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  // The roster used to live at /roster, and "/" permanently redirected there.
  // It now lives at "/". Old links (bookmarks, home-screen installs, reset and
  // approval emails still sitting in inboxes) keep working through these.
  async redirects() {
    return [
      // Browsers cache the old permanent "/" -> "/roster" redirect, so sending
      // /roster straight back to "/" would loop for anyone who visited before.
      // "/?from=roster" is a different URL, which the cache doesn't match; the
      // client strips the marker on boot. Temporary, so it's never cached itself.
      { source: "/roster", destination: "/?from=roster", permanent: false },
      // 308 keeps the method, so old POSTs to /roster/api/... still land.
      { source: "/roster/:path*", destination: "/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
