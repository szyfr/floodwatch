import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // The dev server is reachable on the loopback IP as well as by name; without
  // this Next blocks its own dev resources for the other origin and the page
  // never hydrates.
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // Only routes are covered here. `headers()` does NOT reach public/ assets on
  // this version - the rule compiles into .next/routes-manifest.json and is
  // never consulted for that branch - which is why the service worker is a
  // route handler at app/sw.js/route.ts instead of a file in public/.
  //
  // nginx is not the alternative: DEPLOYMENT.md forbids `add_header
  // Cache-Control` in that server block, because add_header appends and would
  // hand Cloudflare two conflicting headers.
  //
  // Changing anything here needs a rebuild, not just a restart.
  async headers() {
    return [
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ]
  },
}

export default nextConfig
