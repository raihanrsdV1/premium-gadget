"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import Img from "@/components/ui/Img";
import { useModalA11y } from "@/hooks/useModalA11y";

const ZOOM = 2.5;
const arrowCls =
  "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#12205A] shadow-pop transition-opacity hover:bg-white focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-0";

/** Full-screen viewer: large image, arrows/keys/swipe, thumbnails, counter, click to zoom 2x. */
function Lightbox({ images, name, index, onIndex, onClose }) {
  const ref = useModalA11y(true, onClose);
  const [zoom, setZoom] = useState(null); // {x,y} in % while zoomed
  const touch = useRef(null);
  const count = images.length;
  const go = useCallback((i) => { setZoom(null); onIndex((i + count) % count); }, [count, onIndex]);

  useEffect(() => {
    const onKey = (e) => {
      if (count < 2) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, index, count]);

  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, []);

  const img = images[index];
  const btn = "absolute z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white";

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={`${name} image viewer`} className="fixed inset-0 z-[90] flex flex-col bg-[#05091f]/98 text-white animate-[pg-pop_.18s_ease_both]">
      <div className="flex h-16 shrink-0 items-center justify-between px-4">
        {count > 1 ? <p className="text-sm font-semibold tabular-nums" aria-live="polite">{index + 1} / {count}</p> : <span />}
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close image viewer" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div
        className="relative min-h-0 flex-1 touch-pan-y overflow-hidden"
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touch.current == null || zoom || count < 2) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
        }}
      >
        <div
          className={`absolute inset-0 ${zoom ? "cursor-zoom-out" : "cursor-zoom-in"}`}
          onClick={(e) => {
            if (zoom) return setZoom(null);
            const b = e.currentTarget.getBoundingClientRect();
            setZoom({ x: ((e.clientX - b.left) / b.width) * 100, y: ((e.clientY - b.top) / b.height) * 100 });
          }}
          onMouseMove={(e) => {
            if (!zoom) return;
            const b = e.currentTarget.getBoundingClientRect();
            setZoom({ x: ((e.clientX - b.left) / b.width) * 100, y: ((e.clientY - b.top) / b.height) * 100 });
          }}
        >
          <div className="absolute inset-0 transition-transform duration-200" style={zoom ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}>
            <Img key={img.url} src={img.url} alt={img.alt} fill sizes="100vw" priority className="object-contain p-2 sm:p-8" />
          </div>
        </div>
        {count > 1 && (
          <>
            <button type="button" aria-label="Previous image" onClick={() => go(index - 1)} className={`${btn} left-3 top-1/2 -translate-y-1/2`}><ChevronLeft className="h-6 w-6" /></button>
            <button type="button" aria-label="Next image" onClick={() => go(index + 1)} className={`${btn} right-3 top-1/2 -translate-y-1/2`}><ChevronRight className="h-6 w-6" /></button>
          </>
        )}
      </div>

      {count > 1 && (
        <ul className="flex shrink-0 justify-center gap-2 overflow-x-auto px-4 py-3 scrollbar-none" aria-label="Choose image">
          {images.map((t, i) => (
            <li key={t.url + i} className="shrink-0">
              <button type="button" onClick={() => go(i)} aria-label={`Show image ${i + 1}`} aria-current={i === index} className={`relative block h-14 w-14 overflow-hidden rounded-lg border-2 bg-white sm:h-16 sm:w-16 ${i === index ? "border-white" : "border-transparent opacity-60 hover:opacity-100"}`}>
                <Img src={t.url} alt="" fill sizes="64px" className="object-contain p-1" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Product images: swipeable main image (scroll-snap) with arrows, counter and
 * thumbnails, hover close-up on desktop pointers, and a full-screen lightbox.
 * `images`: [{ url, alt }]
 */
export default function ProductGallery({ images, name }) {
  const ref = useRef(null);
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const [zoom, setZoom] = useState(null); // {x,y,i}
  const count = images.length;

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const set = () => setCanHover(mq.matches);
    set();
    mq.addEventListener?.("change", set);
    return () => mq.removeEventListener?.("change", set);
  }, []);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el || !el.clientWidth) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  const goTo = useCallback((i, smooth = true) => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(count - 1, i));
    el.scrollTo({ left: idx * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
    setActive(idx);
    setZoom(null);
  }, [count]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => el.scrollTo({ left: active * el.clientWidth }));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKey = (e) => {
    if (e.key === "ArrowRight" && count > 1) { e.preventDefault(); goTo(active + 1); }
    else if (e.key === "ArrowLeft" && count > 1) { e.preventDefault(); goTo(active - 1); }
    else if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); setLightbox(true); }
  };

  const track = (e, i) => {
    if (!canHover) return;
    const b = e.currentTarget.getBoundingClientRect();
    setZoom({ i, x: ((e.clientX - b.left) / b.width) * 100, y: ((e.clientY - b.top) / b.height) * 100 });
  };

  const imgPad = "object-contain p-4 sm:p-8";

  return (
    <div className="min-w-0">
      <div className="group/gal relative rounded-3xl bg-navy p-2.5 sm:p-3 lg:bg-tint">
        <div
          ref={ref}
          onScroll={onScroll}
          onKeyDown={onKey}
          tabIndex={0}
          role="group"
          aria-roledescription="carousel"
          aria-label={`${name} images. Press Enter to view full screen.`}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-2xl scrollbar-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {images.map((img, i) => (
            <div
              key={img.url + i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              onClick={() => setLightbox(true)}
              onMouseEnter={(e) => track(e, i)}
              onMouseMove={(e) => track(e, i)}
              onMouseLeave={() => setZoom(null)}
              className="relative aspect-[4/3] w-full shrink-0 cursor-zoom-in snap-center overflow-hidden bg-white dark:bg-[#EEF2FF]"
            >
              <Img src={img.url} alt={img.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" priority={i === 0} className={imgPad} />
              {canHover && zoom?.i === i && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white dark:bg-[#EEF2FF]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt=""
                    className={`absolute inset-0 h-full w-full ${imgPad}`}
                    style={{ transform: `scale(${ZOOM})`, transformOrigin: `${zoom.x}% ${zoom.y}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <button type="button" aria-label="View image full screen" onClick={() => setLightbox(true)} className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#12205A] shadow-pop hover:bg-white">
          <Expand className="h-4 w-4" />
        </button>

        {count > 1 && (
          <>
            <button type="button" aria-label="Previous image" disabled={active === 0} onClick={() => goTo(active - 1)} className={`${arrowCls} left-5 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover/gal:opacity-100`}><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" aria-label="Next image" disabled={active === count - 1} onClick={() => goTo(active + 1)} className={`${arrowCls} right-5 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover/gal:opacity-100`}><ChevronRight className="h-5 w-5" /></button>
            <p className="pointer-events-none absolute bottom-5 right-5 rounded-full bg-navy/80 px-2.5 py-1 text-xs font-bold tabular-nums text-white" aria-hidden="true">{active + 1} / {count}</p>
          </>
        )}
      </div>

      {count > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none sm:gap-2.5" aria-label="Choose image">
          {images.map((img, i) => (
            <li key={img.url + i} className="shrink-0">
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={i === active}
                className={`relative block h-14 w-14 overflow-hidden rounded-xl border-2 bg-white transition-colors dark:bg-[#EEF2FF] sm:h-[72px] sm:w-[72px] ${i === active ? "border-primary" : "border-border hover:border-primary/50"}`}
              >
                <Img src={img.url} alt="" fill sizes="72px" className="object-contain p-1.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {lightbox && createPortal(<Lightbox images={images} name={name} index={active} onIndex={(i) => goTo(i, false)} onClose={() => setLightbox(false)} />, document.body)}
    </div>
  );
}
