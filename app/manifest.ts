import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/config";
import { THEME_COLOR } from "@/lib/domain";

/**
 * "Add to Home Screen": the site's name and a square crop of the brand picture instead of a generic tile.
 * minimal-ui rather than standalone, so the browser keeps its back button and address (the site leans on links and
 * the back gesture). The apple-touch-icon is app/apple-icon.png.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    start_url: "/",
    display: "minimal-ui",
    background_color: THEME_COLOR.light,
    theme_color: THEME_COLOR.light,
    icons: [{ src: "/brand/lobster-league-icon-192.png", sizes: "192x192", type: "image/png" }],
  };
}
