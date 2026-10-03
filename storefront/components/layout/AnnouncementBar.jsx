"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";

// `link` comes from the admin: internal path, or https URL.
const isInternal = (l) => typeof l === "string" && l.startsWith("/") && !l.startsWith("//");

/**
 * Announcement ticker above the header. Rotates through the admin's items
 * (settings.announcement.items, max 5); one item is always fully readable.
 * Pauses on hover/focus; with reduced motion it just switches. Renders nothing
 * when disabled or empty.
 */
export default function AnnouncementBar({ announcement }) {
  const items = (announcement?.enabled && Array.isArray(announcement.items) ? announcement.items : [])
    .filter((i) => i && typeof i.text === "string" && i.text.trim())
    .slice(0, 5);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;

  useEffect(() => {
    if (count < 2 || paused) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 5000);
    return () => clearInterval(t);
  }, [count, paused]);

  if (!count) return null;
  const item = items[Math.min(index, count - 1)];

  const text = (
    <span key={index} className="inline-block animate-[pg-fade-up_.45s_ease_both]">
      {item.text}
    </span>
  );

  return (
    <div
      className="bg-navy text-navy-foreground"
      role="region"
      aria-label="Announcements"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="container flex min-h-9 items-center justify-center gap-2 py-1.5 text-center text-[13px] font-medium leading-snug">
        <Megaphone className="hidden h-4 w-4 shrink-0 text-coral sm:block" aria-hidden="true" />
        {item.link ? (
          isInternal(item.link) ? (
            <Link href={item.link} className="underline-offset-4 hover:underline">{text}</Link>
          ) : (
            <a href={item.link} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{text}</a>
          )
        ) : (
          text
        )}
        {count > 1 && (
          <span className="ml-1 hidden gap-1 sm:flex" aria-hidden="true">
            {items.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-coral" : "w-1.5 bg-white/40"}`} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
