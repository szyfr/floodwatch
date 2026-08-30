import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // The dev server is reachable on the loopback IP as well as by name; without
  // this Next blocks its own dev resources for the other origin and the page
  // never hydrates.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
}

export default nextConfig
