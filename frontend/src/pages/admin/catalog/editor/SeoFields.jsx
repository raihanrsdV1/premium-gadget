import React from 'react';
import { Check } from 'lucide-react';
import { Field, TextInput, TextArea } from '../../../../components/admin/Field';
import { CharCount } from '../../../../components/admin/catalog/CatalogUi';
import { STOREFRONT_URL } from '../../../../components/admin/catalog/catalogUtils';
import { cn } from '@/lib/utils';

const TITLE_MAX = 60;
const DESC_MAX = 160;

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const host = (() => { try { return new URL(STOREFRONT_URL).host; } catch { return 'premiumgadget.com.bd'; } })();

/**
 * Meta title / description with a Google-style preview, plus the image used
 * when the link is shared (Facebook, WhatsApp…). `images` = [{ id, url, is_primary }].
 */
export const SeoFields = ({ value: d, onChange, errors = {}, name, slug, fallbackDescription, images = [] }) => {
  const titlePlaceholder = name ? `${name.trim()} Price in Bangladesh` : 'Product name Price in Bangladesh';
  const shownTitle = d.meta_title.trim() || titlePlaceholder;
  const shownDesc = d.meta_description.trim() || (fallbackDescription || '').trim() || 'Add a short description so Google shows something useful here.';
  const primary = images.find((i) => i.is_primary) || images[0];

  return (
    <div className="space-y-5">
      <Field label={<span className="flex items-center justify-between gap-2">Title on Google <CharCount value={d.meta_title} max={TITLE_MAX} /></span>}
        error={errors.meta_title} hint={`Leave empty to use “${titlePlaceholder}”. About ${TITLE_MAX} characters fit.`}>
        {(id) => <TextInput id={id} value={d.meta_title} onChange={(e) => onChange({ meta_title: e.target.value })} maxLength={255}
          placeholder={titlePlaceholder} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />}
      </Field>
      <Field label={<span className="flex items-center justify-between gap-2">Description on Google <CharCount value={d.meta_description} max={DESC_MAX} /></span>}
        error={errors.meta_description} hint="Leave empty to use the short description. Mention price, condition, warranty or delivery.">
        {(id) => <TextArea id={id} rows={3} value={d.meta_description} onChange={(e) => onChange({ meta_description: e.target.value })} maxLength={500}
          placeholder={fallbackDescription || ''} />}
      </Field>

      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">Search result preview</p>
        <div className="max-w-[600px] rounded-lg border bg-white p-4 font-[arial,sans-serif]">
          <div className="flex items-center gap-2">
            <img src="/brand/logo-mark.png" alt="" className="h-7 w-7 rounded-full border bg-white object-contain p-0.5" />
            <div className="leading-tight">
              <p className="text-sm text-[#202124]">Premium Gadget</p>
              <p className="text-xs text-[#4d5156]">https://{host} › products › {slug || '…'}</p>
            </div>
          </div>
          <p className="mt-2 text-xl leading-snug text-[#1a0dab]">{clip(shownTitle, TITLE_MAX)}</p>
          <p className="mt-1 text-sm leading-normal text-[#4d5156]">{clip(shownDesc, DESC_MAX)}</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Image when shared</p>
        {images.length === 0 ? (
          <p className="text-sm text-slate-500">Add photos first — the main photo is used by default.</p>
        ) : (
          <div role="radiogroup" aria-label="Image when shared" className="flex flex-wrap gap-3">
            <ShareOption selected={!d.og_image_url} onSelect={() => onChange({ og_image_url: '' })} label="Main photo (default)" src={primary?.url} />
            {images.map((img, i) => (
              <ShareOption key={img.id} selected={d.og_image_url === img.url} onSelect={() => onChange({ og_image_url: img.url })} label={`Photo ${i + 1}`} src={img.url} />
            ))}
            {d.og_image_url && !images.some((i) => i.url === d.og_image_url) && (
              <ShareOption selected onSelect={() => {}} label="Current (not a product photo)" src={d.og_image_url} />
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Shown on Facebook, WhatsApp and Messenger when someone shares the product link.</p>
      </div>
    </div>
  );
};

const ShareOption = ({ selected, onSelect, label, src }) => (
  <button type="button" role="radio" aria-checked={selected} onClick={onSelect}
    className={cn('w-28 overflow-hidden rounded-lg border-2 bg-white text-left transition-colors', selected ? 'border-primary' : 'border-transparent ring-1 ring-slate-200 hover:ring-slate-300')}>
    <div className="relative aspect-[1.91/1] bg-slate-100">
      {src && <img src={src} alt="" className="h-full w-full object-cover" />}
      {selected && <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground"><Check className="h-3 w-3" /></span>}
    </div>
    <span className="block truncate px-1.5 py-1 text-xs text-slate-600">{label}</span>
  </button>
);

export default SeoFields;
