"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { SITE } from "@/lib/site";
import CatMascot from "@/components/ui/CatMascot";

const KEY = "pg-wa-nudge";

function WhatsAppIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2a9.93 9.93 0 0 0-8.5 15.07L2 22l5.07-1.5A9.94 9.94 0 1 0 12.04 2Zm5.8 14.1c-.25.7-1.44 1.34-1.98 1.4-.5.06-1.13.09-1.82-.12-.42-.14-.96-.31-1.65-.6-2.9-1.25-4.8-4.17-4.94-4.37-.15-.2-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.4.26-.3.57-.37.76-.37h.55c.17 0 .41-.07.64.49.25.58.82 2 .89 2.15.07.14.12.3.02.5-.1.2-.15.31-.29.48-.15.17-.31.38-.44.51-.15.14-.3.3-.13.58.17.29.76 1.26 1.64 2.04 1.13 1 2.08 1.31 2.37 1.46.3.14.47.12.64-.07.17-.2.74-.86.94-1.16.2-.3.4-.25.67-.15.27.1 1.7.8 2 .95.29.15.49.22.56.34.07.12.07.7-.18 1.4Z" />
    </svg>
  );
}

/** Floating WhatsApp button; the cat mascot nudges once, and stays quiet once dismissed. */
export default function WhatsAppFloat() {
  const pathname = usePathname();
  // Product pages have a sticky purchase bar on phones; sit above it.
  const lifted = pathname?.startsWith("/products/");
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(KEY) === "1"; } catch {}
    if (dismissed) return undefined;
    const t = setTimeout(() => setNudge(true), 5000);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    setNudge(false);
    try { localStorage.setItem(KEY, "1"); } catch {}
  };

  return (
    <div className={`wa-float pointer-events-none fixed ${lifted ? "bottom-24 lg:bottom-6" : "bottom-4 sm:bottom-6"} right-4 z-40 flex flex-col items-end gap-3 sm:right-6`}>
      {nudge && (
        <div role="note" className="pointer-events-auto relative flex max-w-[260px] animate-[pg-pop_.25s_ease_both] items-center gap-3 rounded-2xl border border-border bg-popover p-3 pr-9 text-popover-foreground shadow-float">
          <CatMascot size={60} />
          <p className="text-sm leading-snug"><strong>Need help choosing?</strong><br />Chat with us on WhatsApp.</p>
          <button type="button" onClick={dismiss} aria-label="Dismiss" className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <a
        href={SITE.whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        onClick={() => { try { localStorage.setItem(KEY, "1"); } catch {} }}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#1FA855] text-white shadow-float transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <WhatsAppIcon className="h-7 w-7" />
      </a>
    </div>
  );
}
