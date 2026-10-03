"use client";

import { useId, useState } from "react";

/**
 * Tabs whose panels are all rendered (server HTML stays complete for SEO);
 * inactive ones are `hidden`. `tabs`: [{ id, label, content }], empty content tabs are skipped.
 */
export default function ProductTabs({ tabs, label = "Product details" }) {
  const list = tabs.filter((t) => t.content);
  const [active, setActive] = useState(list[0]?.id);
  const uid = useId();
  if (!list.length) return null;

  const onKey = (e) => {
    const i = list.findIndex((t) => t.id === active);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = list[(next + list.length) % list.length];
    setActive(t.id);
    document.getElementById(`${uid}-tab-${t.id}`)?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label={label} onKeyDown={onKey} className="flex gap-1 overflow-x-auto rounded-full bg-muted p-1 scrollbar-none sm:inline-flex">
        {list.map((t) => (
          <button
            key={t.id}
            id={`${uid}-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={active === t.id}
            aria-controls={`${uid}-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => setActive(t.id)}
            className={`h-10 flex-1 whitespace-nowrap rounded-full px-5 text-sm font-bold transition-colors sm:flex-none ${active === t.id ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {list.map((t) => (
        <div key={t.id} id={`${uid}-panel-${t.id}`} role="tabpanel" aria-labelledby={`${uid}-tab-${t.id}`} hidden={active !== t.id} className="pt-6">
          {t.content}
        </div>
      ))}
    </div>
  );
}
