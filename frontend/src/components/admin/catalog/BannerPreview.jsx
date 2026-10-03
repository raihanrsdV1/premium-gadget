import React, { useState } from 'react';
import { ArrowRight, ImageOff, Monitor, Smartphone } from 'lucide-react';
import { formatBDT } from '../../../lib/format';
import { cn } from '@/lib/utils';

// Mirrors the storefront hero (navy band, text left, photo right). The navy
// is the storefront's brand colour (storefront/lib/site.js), used only here.
const NAVY = '#12205A';

/**
 * Rough preview of a homepage slide.
 *   slide: { title, subtitle, badge, cta, image, mobileImage, price, compareAt }
 */
export const BannerPreview = ({ slide }) => {
  const [mode, setMode] = useState('desktop');
  const phone = mode === 'phone';
  const image = phone ? slide.mobileImage || slide.image : slide.image;
  const hasCompare = slide.compareAt && Number(slide.compareAt) > Number(slide.price);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Preview</span>
        <div role="tablist" aria-label="Preview size" className="inline-flex rounded-md border bg-slate-50 p-0.5">
          {[['desktop', Monitor, 'Computer'], ['phone', Smartphone, 'Phone']].map(([v, Icon, label]) => (
            <button key={v} type="button" role="tab" aria-selected={mode === v} aria-label={label} title={label} onClick={() => setMode(v)}
              className={cn('rounded px-2 py-1', mode === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>
      <div className={cn('mx-auto overflow-hidden rounded-xl text-white shadow-inner', phone ? 'max-w-[300px]' : 'w-full')} style={{ background: NAVY }}>
        <div className={cn('flex gap-4 p-5', phone ? 'flex-col' : 'items-center')}>
          <div className={cn('min-w-0 space-y-2.5', phone ? 'order-2' : 'flex-1')}>
            {slide.badge && <span className="inline-block rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#F7A399]">{slide.badge}</span>}
            <p className={cn('font-extrabold leading-tight tracking-tight', phone ? 'text-xl' : 'text-2xl')}>{slide.title || <span className="opacity-50">Title</span>}</p>
            {slide.subtitle && <p className="line-clamp-3 text-sm text-[#C9D3F5]">{slide.subtitle}</p>}
            {slide.price != null && (
              <p className="flex items-baseline gap-2">
                <span className="text-xl font-extrabold">{formatBDT(slide.price)}</span>
                {hasCompare && <span className="text-sm text-[#9FAEDD] line-through">{formatBDT(slide.compareAt)}</span>}
              </p>
            )}
            {slide.cta && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F06A5B] px-4 py-2 text-sm font-extrabold" style={{ color: NAVY }}>
                {slide.cta}<ArrowRight className="h-4 w-4" />
              </span>
            )}
          </div>
          <div className={cn('shrink-0', phone ? 'order-1 w-full' : 'w-[45%]')}>
            {image ? (
              <img src={image} alt="" className={cn('w-full rounded-2xl object-cover', phone ? 'aspect-[4/3]' : 'aspect-[16/11]')} />
            ) : (
              <div className={cn('flex w-full items-center justify-center rounded-2xl bg-white/10 text-white/50', phone ? 'aspect-[4/3]' : 'aspect-[16/11]')}><ImageOff className="h-6 w-6" /></div>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">A rough preview — the website's layout and fonts differ a little.</p>
    </div>
  );
};

export default BannerPreview;
