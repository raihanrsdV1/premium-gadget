import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * In-page section nav for the long product form: a sticky column on wide
 * screens, a sticky scrollable strip on laptops / tablets. A dot marks
 * sections with unsaved changes, a red dot sections with errors.
 *   sections: [{ id, label, dirty, error }]
 */
export const EditorNav = ({ sections, layout }) => {
  const [active, setActive] = useState(sections[0]?.id);

  const ids = sections.map((s) => s.id).join(',');
  useEffect(() => {
    const els = ids.split(',').map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length || typeof IntersectionObserver === 'undefined') return undefined;
    // Sections crossing a band near the top of the screen; the first one (in page order) is active.
    const inBand = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? inBand.add(e.target.id) : inBand.delete(e.target.id)));
      const first = els.find((el) => inBand.has(el.id));
      if (first) setActive(first.id);
    }, { rootMargin: '-15% 0px -70% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);

  const go = (id) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const dot = (s) => (s.error ? <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="has errors" />
    : s.dirty ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label="unsaved changes" /> : null);

  if (layout === 'column') {
    return (
      <nav aria-label="Product sections" className="sticky top-0 space-y-0.5">
        {sections.map((s) => (
          <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={active === s.id ? 'true' : undefined}
            className={cn('flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
              active === s.id ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-white hover:text-slate-900')}>
            {s.label}{dot(s)}
          </button>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="Product sections" className="sticky top-0 z-20 -mx-4 mb-4 overflow-x-auto border-b bg-slate-50/95 px-4 backdrop-blur md:-mx-8 md:px-8">
      <div className="flex gap-1 py-2">
        {sections.map((s) => (
          <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={active === s.id ? 'true' : undefined}
            className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              active === s.id ? 'bg-primary text-primary-foreground' : 'text-slate-600 hover:bg-white')}>
            {s.label}{dot(s)}
          </button>
        ))}
      </div>
    </nav>
  );
};

export default EditorNav;
