import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, TextInput, TextArea, Select, Checkbox } from '../../../../components/admin/Field';
import { CharCount } from '../../../../components/admin/catalog/CatalogUi';
import { MarkdownPreview } from '../../../../components/admin/catalog/MarkdownPreview';
import { CONDITIONS, slugify } from '../../../../components/admin/catalog/catalogUtils';
import { cn } from '@/lib/utils';

const noEnter = (e) => { if (e.key === 'Enter') e.preventDefault(); };

/**
 * Basics: name, web address, category, brand, condition, descriptions,
 * badge and website flags. `value` is the basics form state; onChange(patch).
 */
export const BasicsFields = ({ value: d, onChange, errors = {}, categories, brands, isNew }) => {
  const [tab, setTab] = useState('write');
  const autoSlug = slugify(d.name);
  const slugValue = isNew && !d.slugTouched ? autoSlug : d.slug;

  const setName = (name) => onChange(isNew && !d.slugTouched ? { name, slug: slugify(name) } : { name });

  return (
    <div className="space-y-5">
      <Field label="Product name" required error={errors.name}>
        {(id) => <TextInput id={id} value={d.name} onChange={(e) => setName(e.target.value)} maxLength={255}
          placeholder='e.g. Apple MacBook Air M2 13" (2022)' aria-invalid={!!errors.name} />}
      </Field>

      <Field label="Web address" error={errors.slug}
        hint={isNew
          ? 'Made from the name. Change it only if you need a different link.'
          : 'Changing this breaks links people have already shared or saved.'}>
        {(id) => (
          <div className="flex items-stretch overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring">
            <span className="flex items-center whitespace-nowrap border-r bg-slate-50 px-3 text-sm text-slate-500">/products/</span>
            <input id={id} value={slugValue} onKeyDown={noEnter} maxLength={140}
              onChange={(e) => onChange({ slug: e.target.value.toLowerCase().replace(/\s+/g, '-'), slugTouched: true })}
              className="h-10 min-w-0 flex-1 bg-white px-3 text-sm focus:outline-none" placeholder={autoSlug || 'macbook-air-m2'} />
            {isNew && d.slugTouched && (
              <button type="button" onClick={() => onChange({ slug: autoSlug, slugTouched: false })}
                className="border-l px-3 text-xs font-medium text-primary hover:bg-slate-50">Reset</button>
            )}
          </div>
        )}
      </Field>

      <div className="grid gap-5 md:grid-cols-3">
        <Field label="Category" required error={errors.category_id}
          hint={<>Missing one? <Link to="/admin/categories" className="font-medium text-primary hover:underline">Manage categories</Link></>}>
          {(id) => (
            <Select id={id} value={d.category_id} onChange={(e) => onChange({ category_id: e.target.value })} aria-invalid={!!errors.category_id}>
              <option value="">Choose a category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.path}{c.is_active ? '' : ' (hidden)'}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Brand">
          {(id) => (
            <Select id={id} value={d.brand_id} onChange={(e) => onChange({ brand_id: e.target.value })}>
              <option value="">No brand</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}{b.is_active ? '' : ' (hidden)'}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Condition" required>
          {(id) => (
            <Select id={id} value={d.condition} onChange={(e) => onChange({ condition: e.target.value })}>
              {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          )}
        </Field>
      </div>

      <Field label={<span className="flex items-center justify-between gap-2">Short description <CharCount value={d.short_description} max={500} /></span>}
        error={errors.short_description} hint="One or two lines shown near the price and in search results.">
        {(id) => <TextArea id={id} rows={2} value={d.short_description} onChange={(e) => onChange({ short_description: e.target.value })} maxLength={500}
          placeholder="e.g. Thin and light 13-inch laptop with all-day battery — perfect for students." />}
      </Field>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <span id="desc-label" className="text-sm font-medium text-slate-700">Full description</span>
          <div role="tablist" aria-label="Description editor" className="inline-flex rounded-md border bg-slate-50 p-0.5 text-xs font-medium">
            {[['write', 'Write'], ['preview', 'Preview']].map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
                className={cn('rounded px-3 py-1', tab === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>{l}</button>
            ))}
          </div>
        </div>
        {tab === 'write' ? (
          <TextArea aria-labelledby="desc-label" rows={10} value={d.description_md} onChange={(e) => onChange({ description_md: e.target.value })}
            className="font-mono text-[13px]" placeholder={'## Why you will love it\nA short paragraph…\n\n- **Fast:** Apple M2 chip\n- **Light:** only 1.24 kg'} />
        ) : (
          <div className="min-h-[180px] rounded-md border bg-white p-4"><MarkdownPreview source={d.description_md} /></div>
        )}
        <p className="text-xs text-muted-foreground">
          Formatting: <code>## Heading</code>, <code>**bold**</code>, <code>*italic*</code>, lines starting with <code>-</code> for a list, <code>[link text](https://…)</code>.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Field label="Badge" error={errors.badge} hint="Small label on the product photo, e.g. “Best seller”.">
          {(id) => <TextInput id={id} value={d.badge} onChange={(e) => onChange({ badge: e.target.value })} onKeyDown={noEnter} maxLength={40} placeholder="Optional" />}
        </Field>
        <Field label="Sort order" error={errors.sort_order} hint="Lower numbers show first in featured lists.">
          {(id) => <TextInput id={id} type="number" step="1" value={d.sort_order} onChange={(e) => onChange({ sort_order: e.target.value })} onKeyDown={noEnter} />}
        </Field>
      </div>

      <div className="grid gap-4 rounded-lg border bg-slate-50 p-4 md:grid-cols-3">
        <Checkbox label="Show on website" hint="Switch off to hide it without deleting." checked={d.is_active} onChange={(v) => onChange({ is_active: v })} />
        <Checkbox label="Featured" hint="Listed in “Featured” on the homepage." checked={d.is_featured} onChange={(v) => onChange({ is_featured: v })} />
        <Checkbox label="Track serial numbers" hint="Record each unit's serial / IMEI in stock." checked={d.is_serialized} onChange={(v) => onChange({ is_serialized: v })} />
      </div>
    </div>
  );
};

export default BasicsFields;
