"use client";

import { useEffect, useState } from "react";

const pad = (n) => String(n).padStart(2, "0");

/** Live countdown to `endsAt` (ISO). Renders nothing until mounted (server can't know "now") and once ended. */
export default function Countdown({ endsAt, onDark = false }) {
  const [left, setLeft] = useState(null);
  useEffect(() => {
    const end = new Date(endsAt).getTime();
    if (!Number.isFinite(end)) return undefined;
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  if (left === null) return <div className="h-[58px]" aria-hidden="true" />;
  if (left <= 0) return <span className={`text-sm font-bold ${onDark ? "text-[#DCE3FA]" : "text-muted-foreground"}`}>This sale has ended</span>;

  const s = Math.floor(left / 1000);
  const parts = [
    ["days", Math.floor(s / 86400)],
    ["hrs", Math.floor((s % 86400) / 3600)],
    ["min", Math.floor((s % 3600) / 60)],
    ["sec", s % 60],
  ];
  return (
    <div className="flex items-center gap-1.5 sm:gap-2" role="timer" aria-label={`Ends in ${parts[0][1]} days ${parts[1][1]} hours ${parts[2][1]} minutes`}>
      <span className={`mr-1 text-sm font-semibold ${onDark ? "text-[#DCE3FA]" : "text-muted-foreground"}`}>Ends in</span>
      {parts.map(([label, v]) => (
        <span key={label} className={`min-w-12 rounded-xl px-2 py-1.5 text-center text-base font-extrabold leading-tight text-navy-foreground sm:min-w-[52px] ${onDark ? "bg-white/15" : "bg-navy"}`}>
          {pad(v)}
          <span className="block text-[10px] font-medium text-[#C9D3F5]">{label}</span>
        </span>
      ))}
    </div>
  );
}
