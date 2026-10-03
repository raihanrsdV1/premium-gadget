import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Truck, Store, Share2, ShoppingBag, Search, Plus, Trash2, X, Check, AlertCircle, Loader2, Lock, Megaphone, ArrowUp, ArrowDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useGetAdminSettingsQuery, useUpdateSettingMutation } from '../../store/api/settingsApi';
import { BD_DIVISIONS } from '../../lib/bdLocations';

const ALL_DISTRICTS = Object.values(BD_DIVISIONS).flat().sort();
const DIVISIONS = Object.keys(BD_DIVISIONS);

// Empty text inputs are stored as null; numbers come back from inputs as strings.
const orNull = (v) => (v === '' || v === undefined ? null : v);
const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

// zone code from its label: "Inside Chattogram" → "inside_chattogram"
const codeFrom = (label, taken) => {
  const base = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'zone';
  let code = base;
  for (let i = 2; taken.has(code); i++) code = `${base}_${i}`;
  return code;
};

const errorText = (err) => {
  const data = err?.data;
  if (data?.errors?.length) return data.errors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)).join(' · ');
  return data?.message || 'Could not save. Check your connection and try again.';
};

// ─── Small building blocks ───────────────────────────────────

const Field = ({ label, hint, children }) => (
  <label className="block space-y-1.5">
    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
    {children}
    {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
  </label>
);

const Toggle = ({ checked, onChange, disabled, label, hint }) => (
  <label className={`flex items-start gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
    <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={!!checked} disabled={disabled}
      onChange={(e) => onChange(e.target.checked)} />
    <span>
      <span className="block text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </span>
  </label>
);

const Chips = ({ items, onRemove, disabled }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((item) => (
      <span key={item} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium">
        {item}
        {!disabled && (
          <button type="button" onClick={() => onRemove(item)} aria-label={`Remove ${item}`} className="hover:text-red-600">
            <X className="h-3 w-3" />
          </button>
        )}
      </span>
    ))}
  </div>
);

const AddSelect = ({ options, placeholder, onAdd, disabled }) => (
  <select
    className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
    value=""
    disabled={disabled || !options.length}
    onChange={(e) => e.target.value && onAdd(e.target.value)}
  >
    <option value="">{options.length ? placeholder : 'All assigned'}</option>
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

/**
 * One settings card with its own Save button. `draft` is local state seeded
 * from the server; `toValue` turns it into the API payload.
 */
const Section = ({ icon: Icon, title, description, settingKey, initial, toValue, canEdit, children }) => {
  const [draft, setDraft] = useState(initial);
  const [updateSetting, { isLoading }] = useUpdateSettingMutation();
  const [status, setStatus] = useState(null); // { ok: boolean, text: string }

  useEffect(() => { setDraft(initial); }, [initial]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const save = async () => {
    setStatus(null);
    try {
      await updateSetting({ key: settingKey, value: toValue(draft) }).unwrap();
      setStatus({ ok: true, text: 'Saved — the website uses this within a minute.' });
    } catch (err) {
      setStatus({ ok: false, text: errorText(err) });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            {description && <CardDescription className="mt-1">{description}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {children(draft, setDraft)}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
          {canEdit ? (
            <>
              <Button onClick={save} disabled={!dirty || isLoading}>
                {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : 'Save changes'}
              </Button>
              {dirty && (
                <Button variant="ghost" onClick={() => { setDraft(initial); setStatus(null); }} disabled={isLoading}>
                  Discard
                </Button>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Only a super admin can change this.</span>
          )}
          {status && (
            <span className={`inline-flex items-center gap-1.5 text-sm ${status.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {status.ok ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {status.text}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Delivery zones ──────────────────────────────────────────

const ZonesEditor = ({ draft, setDraft, canEdit }) => {
  const zones = draft.zones;
  const used = (field) => new Set(zones.flatMap((z) => z[field] || []));
  const update = (i, patch) => setDraft({ ...draft, zones: zones.map((z, j) => (j === i ? { ...z, ...patch } : z)) });
  const makeDefault = (i) => setDraft({ ...draft, zones: zones.map((z, j) => ({ ...z, is_default: j === i })) });
  const remove = (i) => setDraft({ ...draft, zones: zones.filter((_, j) => j !== i) });
  const add = () => setDraft({
    ...draft,
    zones: [...zones, { code: null, label: '', fee: '', eta: '', districts: [], divisions: [], is_default: false }],
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        At checkout the zone is picked from the customer&apos;s address: first a zone listing their <b>district</b>,
        then one listing their <b>division</b>, otherwise the <b>default</b> zone (&ldquo;everywhere else&rdquo;).
      </p>

      {zones.map((zone, i) => {
        const takenDistricts = used('districts');
        const takenDivisions = used('divisions');
        return (
          <div key={zone.code || `new-${i}`} className={`rounded-lg border p-4 space-y-4 ${zone.is_default ? 'border-primary/40 bg-primary/5' : ''}`}>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
              <Field label="Zone name (shown to customers)">
                <Input value={zone.label} disabled={!canEdit} placeholder="Inside Chattogram"
                  onChange={(e) => update(i, { label: e.target.value })} />
              </Field>
              <Field label="Delivery charge (৳)">
                <Input type="number" min="0" step="1" inputMode="numeric" value={zone.fee} disabled={!canEdit}
                  onChange={(e) => update(i, { fee: e.target.value })} />
              </Field>
              <Field label="Delivery time">
                <Input value={zone.eta || ''} disabled={!canEdit} placeholder="1-2 days"
                  onChange={(e) => update(i, { eta: e.target.value })} />
              </Field>
            </div>

            {zone.is_default ? (
              <p className="text-sm text-primary font-medium">Default zone — used for every address not listed in another zone.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <span className="text-sm font-medium">Districts</span>
                  <Chips items={zone.districts} disabled={!canEdit}
                    onRemove={(d) => update(i, { districts: zone.districts.filter((x) => x !== d) })} />
                  <AddSelect placeholder="+ Add district" disabled={!canEdit}
                    options={ALL_DISTRICTS.filter((d) => !takenDistricts.has(d))}
                    onAdd={(d) => update(i, { districts: [...zone.districts, d] })} />
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-medium">Whole divisions</span>
                  <Chips items={zone.divisions} disabled={!canEdit}
                    onRemove={(d) => update(i, { divisions: zone.divisions.filter((x) => x !== d) })} />
                  <AddSelect placeholder="+ Add division" disabled={!canEdit}
                    options={DIVISIONS.filter((d) => !takenDivisions.has(d))}
                    onAdd={(d) => update(i, { divisions: [...zone.divisions, d] })} />
                </div>
              </div>
            )}

            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {!zone.is_default && (
                  <Button type="button" variant="outline" size="sm" onClick={() => makeDefault(i)}>Make default (everywhere else)</Button>
                )}
                {zones.length > 1 && !zone.is_default && (
                  <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => remove(i)}>
                    <Trash2 className="h-4 w-4 mr-1" /> Remove zone
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {canEdit && (
        <Button type="button" variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1" /> Add zone</Button>
      )}

      <Field label="Free delivery on orders from (৳)" hint="Leave empty for no free delivery.">
        <Input type="number" min="0" step="1" inputMode="numeric" className="max-w-xs" disabled={!canEdit}
          value={draft.free_shipping_threshold ?? ''}
          onChange={(e) => setDraft({ ...draft, free_shipping_threshold: e.target.value })} />
      </Field>
    </div>
  );
};

const shippingToValue = (d) => {
  const taken = new Set(d.zones.filter((z) => z.code).map((z) => z.code));
  return {
    zones: d.zones.map((z) => {
      const code = z.code || codeFrom(z.label, taken);
      taken.add(code);
      return {
        code,
        label: z.label.trim(),
        fee: Number(z.fee || 0),
        eta: orNull(z.eta?.trim()),
        districts: z.is_default ? [] : z.districts,
        divisions: z.is_default ? [] : z.divisions,
        is_default: !!z.is_default,
      };
    }),
    free_shipping_threshold: numOrNull(d.free_shipping_threshold),
  };
};

// ─── Page ────────────────────────────────────────────────────

const STORE_FIELDS = [
  ['name', 'Shop name'],
  ['phone', 'Phone', '01XXXXXXXXX'],
  ['whatsapp', 'WhatsApp number', '01XXXXXXXXX'],
  ['email', 'Email'],
  ['address', 'Main address'],
  ['hours', 'Opening hours', 'Sat–Thu, 10am–9pm'],
  ['map_url', 'Google Maps link', 'https://maps.google.com/…'],
];

const SOCIAL_FIELDS = [
  ['facebook', 'Facebook page'],
  ['instagram', 'Instagram'],
  ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'],
];

const AnnouncementEditor = ({ draft, setDraft, canEdit }) => {
  const items = draft.items;
  const setItems = (next) => setDraft({ ...draft, items: next });
  const edit = (i, patch) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i, to) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [it] = next.splice(i, 1);
    next.splice(to, 0, it);
    setItems(next);
  };
  const linkBad = (l) => l.trim() && !(/^\/(?!\/)/.test(l.trim()) || /^https:\/\//i.test(l.trim()));
  return (
    <div className="space-y-4">
      <Toggle label="Show the announcement bar" checked={draft.enabled} disabled={!canEdit}
        hint={draft.enabled && items.length === 0 ? 'Add at least one message, or nothing will show.' : 'Turn off to hide the bar without losing your messages.'}
        onChange={(v) => setDraft({ ...draft, enabled: v })} />
      <div className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Message {i + 1}</span>
              <span className="flex-1" />
              {canEdit && (
                <>
                  <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move message ${i + 1} up`} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => move(i, i + 1)} disabled={i === items.length - 1} aria-label={`Move message ${i + 1} down`} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Remove message ${i + 1}`} className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </>
              )}
            </div>
            <Field label="Text" hint={`${it.text.length}/160`}>
              <Input value={it.text} maxLength={160} disabled={!canEdit} placeholder="Free delivery in Chattogram over ৳5,000" onChange={(e) => edit(i, { text: e.target.value })} />
            </Field>
            <Field label="Link (optional)" hint="A page of the website, like /collections/hot-sale, or a full https:// link.">
              <Input value={it.link} disabled={!canEdit} placeholder="/collections/hot-sale" onChange={(e) => edit(i, { link: e.target.value })} />
            </Field>
            {linkBad(it.link) && <p className="text-xs text-red-600">Use a path starting with a single / or a link starting with https://</p>}
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
      </div>
      {canEdit && items.length < 5 && (
        <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, { text: '', link: '' }])}><Plus className="h-4 w-4 mr-1.5" />Add a message</Button>
      )}
      {canEdit && items.length >= 5 && <p className="text-xs text-muted-foreground">Up to 5 messages.</p>}
    </div>
  );
};

const Settings = () => {
  const { user } = useSelector((s) => s.auth);
  const canEdit = user?.role === 'super_admin';
  const { data, isLoading, isError, error, refetch } = useGetAdminSettingsQuery();

  // Stable initial drafts per section (recomputed only when server data changes).
  const initial = useMemo(() => data && ({
    shipping: {
      ...data.shipping,
      zones: data.shipping.zones.map((z) => ({ ...z, fee: String(z.fee), eta: z.eta || '', districts: z.districts || [], divisions: z.divisions || [] })),
    },
    store: Object.fromEntries(STORE_FIELDS.map(([k]) => [k, data.store[k] ?? ''])),
    social: Object.fromEntries(SOCIAL_FIELDS.map(([k]) => [k, data.social[k] ?? ''])),
    checkout: { ...data.checkout },
    announcement: {
      enabled: !!data.announcement?.enabled,
      items: (data.announcement?.items || []).map((i) => ({ text: i.text, link: i.link || '' })),
    },
    seo: { default_title: data.seo.default_title, default_description: data.seo.default_description, og_image: data.seo.og_image ?? '' },
  }), [data]);

  if (isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground p-6"><Loader2 className="h-5 w-5 animate-spin" /> Loading settings…</div>;
  }
  if (isError) {
    return (
      <Card className="border-red-200">
        <CardContent className="p-6 flex items-center justify-between gap-4">
          <span className="text-red-600 text-sm">Couldn&apos;t load settings: {errorText(error)}</span>
          <Button variant="outline" onClick={refetch}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Changes here go live on the website automatically — no developer needed.
        </p>
      </div>

      <Section icon={Truck} title="Delivery zones & charges" settingKey="shipping" canEdit={canEdit}
        description="What customers pay for delivery, based on their address."
        initial={initial.shipping} toValue={shippingToValue}>
        {(d, set) => <ZonesEditor draft={d} setDraft={set} canEdit={canEdit} />}
      </Section>

      <Section icon={ShoppingBag} title="Checkout & cash on delivery" settingKey="checkout" canEdit={canEdit}
        description="Rules that protect your stock from fake or abandoned orders."
        initial={initial.checkout}
        toValue={(d) => ({
          cod_enabled: !!d.cod_enabled,
          cod_requires_verified_phone: !!d.cod_requires_verified_phone,
          cod_max_order_value: numOrNull(d.cod_max_order_value),
          max_units_per_order: Number(d.max_units_per_order),
          cod_confirm_hours: Number(d.cod_confirm_hours),
          reservation_minutes: Number(d.reservation_minutes),
          pending_order_limit: Number(d.pending_order_limit),
        })}>
        {(d, set) => (
          <div className="space-y-5">
            <div className="space-y-3">
              <Toggle label="Offer cash on delivery" checked={d.cod_enabled} disabled={!canEdit}
                onChange={(v) => set({ ...d, cod_enabled: v })} />
              <Toggle label="Require an SMS-verified phone for cash on delivery"
                hint="Turn on once an SMS gateway is connected — until then customers can't verify their number."
                checked={d.cod_requires_verified_phone} disabled={!canEdit}
                onChange={(v) => set({ ...d, cod_requires_verified_phone: v })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Largest cash-on-delivery order (৳)" hint="Empty = no limit.">
                <Input type="number" min="1" inputMode="numeric" disabled={!canEdit} value={d.cod_max_order_value ?? ''}
                  onChange={(e) => set({ ...d, cod_max_order_value: e.target.value })} />
              </Field>
              <Field label="Cancel unconfirmed COD orders after (hours)" hint="Staff confirm COD orders by phone; unconfirmed ones release their stock.">
                <Input type="number" min="1" max="720" inputMode="numeric" disabled={!canEdit} value={d.cod_confirm_hours}
                  onChange={(e) => set({ ...d, cod_confirm_hours: e.target.value })} />
              </Field>
              <Field label="Most items in one order">
                <Input type="number" min="1" max="100" inputMode="numeric" disabled={!canEdit} value={d.max_units_per_order}
                  onChange={(e) => set({ ...d, max_units_per_order: e.target.value })} />
              </Field>
              <Field label="Hold stock for unpaid online orders (minutes)">
                <Input type="number" min="5" max="1440" inputMode="numeric" disabled={!canEdit} value={d.reservation_minutes}
                  onChange={(e) => set({ ...d, reservation_minutes: e.target.value })} />
              </Field>
              <Field label="Unpaid orders allowed per customer">
                <Input type="number" min="1" max="20" inputMode="numeric" disabled={!canEdit} value={d.pending_order_limit}
                  onChange={(e) => set({ ...d, pending_order_limit: e.target.value })} />
              </Field>
            </div>
          </div>
        )}
      </Section>

      <Section icon={Store} title="Shop information" settingKey="store" canEdit={canEdit}
        description="Shown in the website footer, contact pages and Google search results."
        initial={initial.store}
        toValue={(d) => Object.fromEntries(STORE_FIELDS.map(([k]) => [k, k === 'name' ? d.name.trim() : orNull(String(d[k]).trim())]))}>
        {(d, set) => (
          <div className="grid gap-4 sm:grid-cols-2">
            {STORE_FIELDS.map(([k, label, placeholder]) => (
              <Field key={k} label={label}>
                <Input value={d[k]} placeholder={placeholder} disabled={!canEdit} onChange={(e) => set({ ...d, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        )}
      </Section>

      <Section icon={Share2} title="Social media" settingKey="social" canEdit={canEdit}
        description="Full links, e.g. https://www.facebook.com/premiumgadget.official/"
        initial={initial.social}
        toValue={(d) => Object.fromEntries(SOCIAL_FIELDS.map(([k]) => [k, orNull(String(d[k]).trim())]))}>
        {(d, set) => (
          <div className="grid gap-4 sm:grid-cols-2">
            {SOCIAL_FIELDS.map(([k, label]) => (
              <Field key={k} label={label}>
                <Input type="url" value={d[k]} placeholder="https://" disabled={!canEdit} onChange={(e) => set({ ...d, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        )}
      </Section>

      <Section icon={Megaphone} title="Announcement bar" settingKey="announcement" canEdit={canEdit}
        description="A thin message bar at the very top of the website, e.g. “Free delivery in Chattogram over ৳5,000”. With several messages, they take turns."
        initial={initial.announcement}
        toValue={(d) => ({ enabled: d.enabled, items: d.items.map((i) => ({ text: i.text.trim(), link: orNull(i.link.trim()) })) })}>
        {(d, set) => <AnnouncementEditor draft={d} setDraft={set} canEdit={canEdit} />}
      </Section>

      <Section icon={Search} title="Search engine defaults" settingKey="seo" canEdit={canEdit}
        description="Used on pages that don't have their own title/description."
        initial={initial.seo}
        toValue={(d) => ({ default_title: d.default_title.trim(), default_description: d.default_description.trim(), og_image: orNull(d.og_image.trim()) })}>
        {(d, set) => (
          <div className="space-y-4">
            <Field label="Default title" hint={`${d.default_title.length}/120`}>
              <Input value={d.default_title} maxLength={120} disabled={!canEdit} onChange={(e) => set({ ...d, default_title: e.target.value })} />
            </Field>
            <Field label="Default description" hint={`${d.default_description.length}/320`}>
              <textarea rows={3} maxLength={320} disabled={!canEdit}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                value={d.default_description} onChange={(e) => set({ ...d, default_description: e.target.value })} />
            </Field>
            <Field label="Default share image (link)" hint="Shown when the site is shared on Facebook/WhatsApp.">
              <Input type="url" value={d.og_image} placeholder="https://" disabled={!canEdit} onChange={(e) => set({ ...d, og_image: e.target.value })} />
            </Field>
          </div>
        )}
      </Section>
    </div>
  );
};

export default Settings;
