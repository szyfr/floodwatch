import type { MetadataRoute } from "next"

/**
 * The web app manifest, served by Next at /manifest.webmanifest.
 *
 * This exists for iOS as much as for installability: Safari grants push only
 * to a home-screen install, and since 16.4 it honours `display`, so anything
 * other than "standalone" silently costs the entire iPhone audience.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pampanga Flood Watch",
    short_name: "Flood Watch",
    description:
      "Live flood reports, river gauges, safe zones and DRRM alerts for the 22 cities and municipalities of Pampanga.",
    // app/page.tsx only redirects, and a cold start on a bad connection should
    // not spend a round trip on a 307.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Kept equal to viewport.themeColor in app/layout.tsx.
    theme_color: "#0f172a",
    background_color: "#0f172a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
