import type { MetadataRoute } from "next";

/** Lets Hoops Hub be installed to a home screen and open full-screen, like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hoops Hub",
    short_name: "Hoops Hub",
    description: "All your ESPN, Yahoo and Sleeper fantasy basketball leagues in one place.",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f2f2f7",
    theme_color: "#ff8a1f",
    categories: ["sports"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My Teams", url: "/my-teams", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Lineup Check", url: "/my-teams?view=lineup", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Tonight", url: "/my-teams?view=tonight", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
