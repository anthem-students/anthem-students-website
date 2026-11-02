import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  // The old main site is gone; the bare domain now lands on the roster.
  async redirects() {
    return [{ source: "/", destination: "/roster", permanent: true }];
  },
};

export default nextConfig;
