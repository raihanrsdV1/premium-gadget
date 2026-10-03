import React, { useState } from 'react';
import { ArrowDown, ArrowUp, ImageOff, Loader2, Lock, Plus, X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cn } from '@/lib/utils';

/** On/off switch (a real checkbox underneath, so it's keyboard and screen-reader friendly). */
export const Switch = ({ checked, onChange, label, disabled, busy, showLabel = false, className }) => (
  // `relative`: keeps the visually hidden checkbox inside scrolling tables (else it widens the page).
  <label className={cn('relative inline-flex items-center gap-2', disabled || busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer', className)}
    onClick={(e) => e.stopPropagation()}>
    <input type="checkbox" role="switch" className="peer sr-only" checked={!!checked} disabled={disabled || busy}
      aria-label={showLabel ? undefined : label} onChange={(e) => onChange?.(e.target.checked)} />
    <span className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
      checked ? 'bg-primary' : 'bg-slate-300')}>
      <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </span>
    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
    {showLabel && <span className="text-sm font-medium text-slate-700">{label}</span>}
  </label>
);

/** Screen-reader-only text that stays clipped inside scrolling tables. */
export const SrOnly = ({ children }) => <span className="relative inline-block"><span className="sr-only">{children}</span></span>;

/** "42 / 60" counter that turns amber past the recommended length. */
export const CharCount = ({ value, max }) => {
  const n = String(value || '').length;
  return <span className={cn('text-xs tabular-nums', n > max ? 'font-medium text-amber-700' : 'text-slate-500')}>{n} / {max}</span>;
};

/** Short reason an action is locked for this role. */
export const LockHint = ({ children, className }) => (
  <span className={cn('inline-flex items-center gap-1.5 text-xs text-slate-500', className)}>
    <Lock className="h-3.5 w-3.5 shrink-0" />{children}
  </span>
);

/** Small amber "Unsaved changes" pill. */
export const UnsavedPill = ({ show, children = 'Unsaved changes' }) => (show ? (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{children}
  </span>
) : null);

/** Product / brand / banner image with a neutral placeholder when missing or broken. */
export const Thumb = ({ src, alt = '', className = 'h-12 w-12', fit = 'object-cover' }) => {
  const [failed, setFailed] = useState(null);
  if (!src || failed === src) {
    return <div className={cn('flex shrink-0 items-center justify-center rounded-md border bg-slate-50 text-slate-300', className)}><ImageOff className="h-4 w-4" /></div>;
  }
  // max-w-none: inside auto-layout tables a max-width:100% image collapses to 0.
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(src)} className={cn('max-w-none shrink-0 rounded-md border bg-white', fit, className)} />;
};

/**
 * A card section of a long form page. `as="form"` makes it its own form
 * (Enter submits → onSubmit). `footer` holds the save row.
 */
export const SectionCard = ({ id, title, description, icon: Icon, dirty, as = 'section', onSubmit, footer, headerExtra, children, className }) => {
  const Tag = as;
  const formProps = as === 'form' ? { onSubmit: (e) => { e.preventDefault(); onSubmit?.(e); }, noValidate: true } : {};
  return (
    <Tag id={id} {...formProps} aria-labelledby={`${id}-title`} className={cn('scroll-mt-20 rounded-lg border bg-white shadow-sm xl:scroll-mt-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-start gap-3">
          {Icon && <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>}
          <div>
            <h2 id={`${id}-title`} className="text-base font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          <UnsavedPill show={dirty} />
        </div>
      </div>
      <div className="space-y-5 px-5 py-5">{children}</div>
      {footer && <div className="flex flex-wrap items-center gap-3 rounded-b-lg border-t bg-slate-50 px-5 py-3">{footer}</div>}
    </Tag>
  );
};

/** Save / Discard row for a section that saves on its own. */
export const SaveRow = ({ dirty, saving, onDiscard, label = 'Save changes', disabled, children }) => (
  <>
    <Button type="submit" disabled={!dirty || saving || disabled}>
      {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : label}
    </Button>
    {dirty && !saving && <Button type="button" variant="ghost" onClick={onDiscard}>Discard changes</Button>}
    {children}
  </>
);

/** Up / down buttons for reorderable rows. */
export const MoveButtons = ({ index, count, onMove, label, disabled }) => (
  <div className="flex shrink-0 gap-0.5">
    <button type="button" disabled={disabled || index === 0} onClick={() => onMove(index, index - 1)} aria-label={`Move ${label} up`}
      className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30">
      <ArrowUp className="h-4 w-4" />
    </button>
    <button type="button" disabled={disabled || index === count - 1} onClick={() => onMove(index, index + 1)} aria-label={`Move ${label} down`}
      className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30">
      <ArrowDown className="h-4 w-4" />
    </button>
  </div>
);

/** Small icon-only button with an accessible name. */
export const IconButton = ({ label, icon: Icon, onClick, tone = 'default', disabled, className, type = 'button' }) => (
  <button type={type} onClick={onClick} disabled={disabled} aria-label={label} title={label}
    className={cn('inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40',
      tone === 'danger' ? 'text-slate-500 hover:bg-red-50 hover:text-red-600' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900', className)}>
    <Icon className="h-4 w-4" />
  </button>
);

/**
 * Key/value chips (e.g. "RAM: 16 GB"). value = [{ key, value }].
 * Enter in the value box adds the chip (and never submits the form).
 */
const ATTRIBUTE_SUGGESTIONS = ['RAM', 'Storage', 'Processor', 'Graphics', 'Display', 'Colour', 'Size', 'Capacity', 'Connectivity'];

export const AttributeChips = ({ value = [], onChange, disabled, idPrefix }) => {
  const [k, setK] = useState('');
  const [v, setV] = useState('');
  const [error, setError] = useState('');
  const add = () => {
    const key = k.trim();
    const val = v.trim();
    if (!key || !val) { setError('Type a name and a value, e.g. RAM and 16 GB.'); return; }
    if (value.some((a) => a.key.toLowerCase() === key.toLowerCase())) { setError(`"${key}" is already listed. Remove it first to change it.`); return; }
    onChange([...value, { key, value: val }]);
    setK(''); setV(''); setError('');
  };
  const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  const listId = `${idPrefix}-attr-keys`;
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Attributes">
          {value.map((a) => (
            <li key={a.key} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <span><span className="opacity-70">{a.key}:</span> {a.value}</span>
              {!disabled && (
                <button type="button" onClick={() => onChange(value.filter((x) => x.key !== a.key))} aria-label={`Remove ${a.key}`} className="rounded-full hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Attribute name" list={listId} value={k} onChange={(e) => setK(e.target.value)} onKeyDown={onKey} placeholder="Name, e.g. RAM" maxLength={80}
            className="h-9 w-36 rounded-md border border-input bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <datalist id={listId}>{ATTRIBUTE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
          <input aria-label="Attribute value" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={onKey} placeholder="Value, e.g. 16 GB" maxLength={120}
            className="h-9 w-40 rounded-md border border-input bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <Button type="button" variant="outline" size="sm" onClick={add}><Plus className="mr-1 h-3.5 w-3.5" />Add</Button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
};

/** Plain tabs (role=tablist) driven by the parent. */
export const Tabs = ({ tabs, value, onChange, label }) => (
  <div role="tablist" aria-label={label} className="mb-4 flex gap-1 border-b">
    {tabs.map((t) => (
      <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
        className={cn('-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
          value === t.value ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800')}>
        {t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>}
      </button>
    ))}
  </div>
);
