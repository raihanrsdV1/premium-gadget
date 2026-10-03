import { SITE } from "@/lib/site";
import { DEFAULT_DESCRIPTION } from "@/lib/seo";

/** Web app manifest (/manifest.webmanifest). */
export default function manifest() {
  return {
    name: `${SITE.name} — New & Used Laptops in Chattogram`,
    short_name: SITE.name,
    description: DEFAULT_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: SITE.themeColor,
    lang: "en-BD",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
