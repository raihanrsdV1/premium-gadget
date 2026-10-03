"use client";

import { Children, cloneElement, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const AUTO_MS = 2500; // one card every 2.5s (owner's request)
const RESUME_MS = 3000; // after the shopper touches/drags/clicks, wait this long before moving again
let instances = 0;

/**
 * Endless scroll-snap row: swipe on phones, arrows on desktop, dots for the
 * position. When the cards overflow, the list is rendered three times
 * ([copy][real][copy]) and the scroll position quietly jumps by one set at the
 * edges, so it cycles forever. Copies are inert and hidden from screen readers.
 *
 * `autoplay` advances one card every AUTO_MS while the row is on screen. It
 * holds still while the shopper is touching/dragging it or has keyboard focus
 * inside, when the tab is hidden, and for visitors with "reduce motion" on.
 * Children are the slides (<li>).
 */
export default function ProductCarousel({ label, children, autoplay = true }) {
  const ref = useRef(null);
  const root = useRef(null);
  const items = Children.toArray(children).filter(isValidElement);
  const n = items.length;
  const [loop, setLoop] = useState(false);
  const [active, setActive] = useState(0);
  const hold = useRef({ until: 0, focus: false, pressed: false });

  // Geometry: width of one set of cards, and the distance between two cards.
  const geo = useCallback(() => {
    const el = ref.current;
    if (!el || !el.children.length) return null;
    const kids = el.children;
    const step = kids.length > 1 ? kids[1].offsetLeft - kids[0].offsetLeft : kids[0].offsetWidth;
    const set = loop ? kids[n].offsetLeft - kids[0].offsetLeft : step * n;
    return { el, step, set };
  }, [loop, n]);

  // Loop only when the cards don't all fit; otherwise it's a plain row.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || n < 2) return undefined;
    const check = () => {
      const kids = el.children;
      const oneSet = loop ? kids[n].offsetLeft - kids[0].offsetLeft : el.scrollWidth;
      setLoop(oneSet > el.clientWidth + 8);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loop, n]);

  // Start on the real (middle) set, before paint, so the copies are invisible.
  useLayoutEffect(() => {
    const g = geo();
    if (!g || !loop) return;
    g.el.style.scrollBehavior = "auto";
    g.el.scrollLeft = g.set;
    g.el.style.scrollBehavior = "";
  }, [loop, geo]);

  // Dots follow the row live (once per frame while it moves); once the scroll
  // has settled, a row that drifted into a copy is quietly re-centred.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let t = null;
    let frame = 0;
    const sync = () => {
      frame = 0;
      const g = geo();
      if (!g) return;
      const pos = Math.round((el.scrollLeft - (loop ? g.set : 0)) / g.step);
      setActive(((pos % n) + n) % n);
    };
    const settle = () => {
      const g = geo();
      if (!g || !loop) return;
      if (el.scrollLeft >= g.set * 2 - g.step / 2) el.scrollLeft -= g.set;
      else if (el.scrollLeft < g.set - g.step / 2) el.scrollLeft += g.set;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(sync);
      clearTimeout(t);
      t = setTimeout(settle, 140);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", settle);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", settle);
      clearTimeout(t);
      cancelAnimationFrame(frame);
    };
  }, [geo, loop, n]);

  const go = useCallback((delta) => {
    const g = geo();
    if (g) g.el.scrollBy({ left: delta * g.step, behavior: "smooth" });
  }, [geo]);

  const goTo = (i) => {
    const g = geo();
    if (!g) return;
    hold.current.until = Date.now() + RESUME_MS;
    g.el.scrollTo({ left: (loop ? g.set : 0) + i * g.step, behavior: "smooth" });
  };

  // Auto-advance while on screen.
  useEffect(() => {
    if (!autoplay || !loop) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const box = root.current;
    if (!box) return undefined;
    const offset = (instances++ % 3) * 800; // stagger rows so they don't move in lockstep
    let timer = null;
    let delay = null;
    const tick = () => {
      const h = hold.current;
      if (document.hidden || h.pressed || h.focus || Date.now() < h.until) return;
      go(1);
    };
    const start = () => {
      if (timer || delay) return;
      delay = setTimeout(() => { delay = null; timer = setInterval(tick, AUTO_MS); }, offset);
    };
    const stop = () => { clearTimeout(delay); delay = null; clearInterval(timer); timer = null; };
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0.25 });
    io.observe(box);
    return () => { io.disconnect(); stop(); };
  }, [autoplay, loop, go]);

  const touched = () => { hold.current.until = Date.now() + RESUME_MS; };
  const press = (down) => () => { hold.current.pressed = down; touched(); };
  // A horizontal swipe on a trackpad is the shopper browsing the row; a vertical one is page scrolling.
  const onWheel = (e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) touched(); };

  const copy = (prefix) => items.map((c) => cloneElement(c, { key: `${prefix}-${c.key}`, "aria-hidden": true, inert: true }));
  const slides = loop ? [...copy("a"), ...items, ...copy("b")] : items;

  const arrow = "absolute top-[40%] z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-pop transition-colors hover:bg-accent md:flex";

  return (
    <div
      ref={root}
      className="relative"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onFocus={(e) => { if (e.target.matches?.(":focus-visible")) hold.current.focus = true; }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) hold.current.focus = false; }}
      onPointerDown={press(true)}
      onPointerUp={press(false)}
      onPointerCancel={press(false)}
      onTouchStart={press(true)}
      onTouchEnd={press(false)}
      onWheel={onWheel}
      onKeyDown={touched}
    >
      <ul
        ref={ref}
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-4 pt-1 sm:-mx-6 sm:gap-4 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:px-0"
        tabIndex={0}
      >
        {slides}
      </ul>

      {loop && (
        <>
          <button type="button" onClick={() => { touched(); go(-1); }} aria-label="Previous products" className={`${arrow} -left-5`}><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => { touched(); go(1); }} aria-label="Next products" className={`${arrow} -right-5`}><ChevronRight className="h-5 w-5" /></button>
          <div className="mt-1 flex justify-center gap-1.5" role="group" aria-label={`${label}: choose a product`}>
            {items.map((c, i) => (
              <button
                key={c.key}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show product ${i + 1} of ${n}`}
                aria-current={i === active ? "true" : undefined}
                className="flex h-6 items-center px-0.5"
              >
                <span className={`block h-2 rounded-full transition-all duration-300 ${i === active ? "w-6 bg-coral" : "w-2 bg-foreground/25 hover:bg-foreground/45"}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
