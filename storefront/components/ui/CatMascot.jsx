"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { SITE } from "@/lib/site";

const TIPS = [
  { text: "Buying a used laptop? Every one comes with a condition report: grade, battery health and what we tested." },
  { text: `Got a question? Message us on WhatsApp at ${SITE.phoneDisplay}.`, href: SITE.whatsappUrl, label: "Open WhatsApp", external: true },
  { text: "We have two shops in Chattogram: GEC and WASA. Come and try a laptop in person.", href: "/#visit", label: "Our branches", hash: true },
  { text: "Dropped your laptop off for repair? You can track its progress online any time.", href: "/repairs/track", label: "Track my repair" },
  { text: "Cash on delivery is available, so you can pay when your order arrives." },
  { text: "Looking for something fresh? Browse the newest arrivals.", href: "/products", label: "See what's new" },
  { text: "Unsure which laptop suits you? Tell us your budget and use, and we will suggest a few.", href: SITE.whatsappUrl, label: "Ask on WhatsApp", external: true },
  { text: "Screen, battery, keyboard or motherboard trouble? Book a repair online.", href: "/repairs", label: "Book a repair" },
];

/**
 * The shop cat. Decorative image by default; `interactive` makes it a button
 * that opens a speech bubble with a rotating shop tip.
 * `align` is where the bubble anchors horizontally: "left" | "right" | "center".
 */
export default function CatMascot({ size = 96, interactive = false, align = "left", side = "top", priority = false, className = "" }) {
  const w = size;
  const h = Math.round((size * 558) / 734);
  const img = (
    <Image src="/brand/cat-sticker.png" alt="" width={734} height={558} priority={priority} style={{ width: w, height: h }} className="max-w-none select-none object-contain drop-shadow-sm" draggable={false} />
  );
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  if (!interactive) return <span className={`inline-flex shrink-0 ${className}`}>{img}</span>;

  const tip = TIPS[i % TIPS.length];
  const onClick = () => {
    if (open) setI((n) => (n + 1) % TIPS.length);
    else setOpen(true);
  };
  const pos = side === "right"
    ? "left-full bottom-1/2 ml-2"
    : `bottom-full mb-2 ${align === "right" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"}`;

  return (
    <span ref={root} className={`relative inline-flex shrink-0 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        aria-label="Tips from the Premium Gadget cat"
        aria-expanded={open}
        className="rounded-2xl transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:hover:animate-[pg-wiggle_.5s_ease_both] motion-safe:active:scale-95"
      >
        {img}
      </button>
      {open && (
        <div role="status" className={`absolute z-50 w-60 max-w-[calc(100vw-9rem)] sm:max-w-[calc(100vw-2rem)] animate-[pg-pop_.18s_ease_both] rounded-2xl border border-border bg-popover p-3.5 pr-9 text-left text-sm leading-snug text-popover-foreground shadow-float ${pos}`}>
          <p>{tip.text}</p>
          {tip.href && (
            tip.external ? (
              <a href={tip.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-bold text-primary underline-offset-4 hover:underline">{tip.label}</a>
            ) : (
              <Link href={tip.href} onClick={() => setOpen(false)} className="mt-2 inline-block font-bold text-primary underline-offset-4 hover:underline">{tip.label}</Link>
            )
          )}
          <p className="mt-2 text-xs text-muted-foreground">Tap the cat for another tip ({(i % TIPS.length) + 1}/{TIPS.length})</p>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close tip" className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </span>
  );
}
