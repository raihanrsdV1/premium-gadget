import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE } from "@/lib/site";

// Default social-share image (1200×630) for pages without their own image.
// Generated once at build time from the brand logo.

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "public", "brand", "logo-mark.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  const logoSize = 220;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: SITE.navy,
          color: "#FFFFFF",
        }}
      >
        <div
          style={{
            display: "flex",
            background: "#FFFFFF",
            borderRadius: 9999,
            padding: 14,
            boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          }}
        >
          <img src={logoSrc} width={logoSize} height={logoSize} alt="" />
        </div>
        <div style={{ display: "flex", marginTop: 36, fontSize: 64, fontWeight: 800, color: "#FFFFFF" }}>
          Premium <span style={{ color: "#F7867E", marginLeft: 16 }}>Gadget</span>
        </div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 48, fontWeight: 700, letterSpacing: -1 }}>
          New &amp; used laptops in Chattogram
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 22,
            fontSize: 34,
            color: "#C9D4FF",
            borderTop: `4px solid ${SITE.themeColor}`,
            paddingTop: 18,
          }}
        >
          {`Call/WhatsApp ${SITE.phoneDisplay}`}
        </div>
      </div>
    ),
    size
  );
}
