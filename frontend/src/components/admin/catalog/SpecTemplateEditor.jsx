import React, { useMemo, useState } from 'react';
import { ClipboardList, Copy, Loader2, Lock, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { Modal } from '../Modal';
import { Field, TextInput, Select, TextArea } from '../Field';
import { Badge } from '../DataTable';
import { Button } from '../../ui/Button';
import { IconButton, MoveButtons, UnsavedPill } from './CatalogUi';
import {
  MAX_HIGHLIGHTS, SPEC_KEY_RE, SPEC_TYPES, keyify, moveItem, resolveTemplateLocal, sameJSON, templateFields, uid,
} from './catalogUtils';
import { useGetSpecTemplateQuery, useUpdateSpecTemplateMutation } from '../../../store/api/catalogApi';
import { useToast } from '../../../hooks/useToast';
import { useConfirm } from '../../../hooks/useConfirm';
import { errorText } from '../../../lib/apiError';

const MAX_GROUPS = 20;
const MAX_FIELDS = 40;
const MAX_OPTIONS = 50;

// ─── Draft ⇄ API shape ─────────────────────────────────────

const toDraft = (template, saved) => ({
  groups: (template?.groups || []).map((g) => ({
    _uid: uid('g'),
    name: g.name || '',
    fields: (g.fields || []).map((f) => ({
      _uid: uid('f'),
      _saved: saved,
      _keyTouched: true,
      key: f.key || '',
      label: f.label || '',
      type: f.type || 'text',
      unit: f.unit || '',
      optionsText: (f.options || []).join('\n'),
      highlight: !!f.highlight,
      filterable: !!f.filterable,
    })),
  })),
});

const parseOptions = (text) => [...new Set(String(text || '').split('\n').map((s) => s.trim()).filter(Boolean))];

const toPayload = (draft) => ({
  groups: draft.groups.map((g) => ({
    name: g.name.trim(),
    fields: g.fields.map((f) => {
      const out = { key: f.key.trim(), label: f.label.trim(), type: f.type, highlight: !!f.highlight, filterable: !!f.filterable };
      if (f.unit.trim() && (f.type === 'text' || f.type === 'number')) out.unit = f.unit.trim();
      if (f.type === 'select') out.options = parseOptions(f.optionsText);
      return out;
    }),
  })),
});

/** → { errors: { [uid]: message }, summary: string[] } */
const validate = (draft) => {
  const errors = {};
  const summary = [];
  const keys = new Map();
  const groupNames = new Set();
  if (draft.groups.length > MAX_GROUPS) summary.push(`Use at most ${MAX_GROUPS} groups.`);
  let highlights = 0;
  draft.groups.forEach((g) => {
    const name = g.name.trim();
    if (!name) errors[g._uid] = 'Give the group a name.';
    else if (name.length > 80) errors[g._uid] = 'Keep the group name under 80 characters.';
    else if (groupNames.has(name.toLowerCase())) errors[g._uid] = 'Two groups have this name.';
    groupNames.add(name.toLowerCase());
    if (g.fields.length > MAX_FIELDS) errors[g._uid] = `A group can have at most ${MAX_FIELDS} fields.`;
    g.fields.forEach((f) => {
      const msgs = [];
      const key = f.key.trim();
      if (!f.label.trim()) msgs.push('Label is required.');
      else if (f.label.trim().length > 60) msgs.push('Label: at most 60 characters.');
      if (!SPEC_KEY_RE.test(key)) msgs.push('Key: lowercase letters, numbers and _ only (max 40).');
      else if (keys.has(key)) msgs.push(`Key “${key}” is used twice.`);
      keys.set(key, true);
      if (f.unit.trim().length > 12) msgs.push('Unit: at most 12 characters.');
      if (f.type === 'select') {
        const opts = parseOptions(f.optionsText);
        if (!opts.length) msgs.push('Add at least one option.');
        if (opts.length > MAX_OPTIONS) msgs.push(`At most ${MAX_OPTIONS} options.`);
        if (opts.some((o) => o.length > 80)) msgs.push('Options: at most 80 characters each.');
      }
      if (f.highlight) highlights += 1;
      if (msgs.length) errors[f._uid] = msgs.join(' ');
    });
  });
  if (highlights > MAX_HIGHLIGHTS) summary.push(`Pick at most ${MAX_HIGHLIGHTS} key specs.`);
  if (Object.keys(errors).length) summary.push('Fix the fields marked in red.');
  return { errors, summary };
};

const newField = () => ({
  _uid: uid('f'), _saved: false, _keyTouched: false,
  key: '', label: '', type: 'text', unit: '', optionsText: '', highlight: false, filterable: false,
});

// ─── Modal wrapper ─────────────────────────────────────────

/**
 * Spec template editor for one category (opened from the Categories page).
 *   category: { id, name, parent_id }, categories: all admin rows (for names)
 *   onSwitchCategory(id): open another category's template (e.g. the parent's)
 */
export const SpecTemplateEditor = ({ category, categories, onClose, onSwitchCategory }) => (
  <Modal open={!!category} onClose={onClose} size="xl"
    title={category ? `Spec template · ${category.name}` : ''}
    description="The spec fields every product in this category fills in. They appear grouped on the product page, and up to 4 “key specs” show on product cards.">
    {category && <TemplateBody key={category.id} category={category} categories={categories} onClose={onClose} onSwitchCategory={onSwitchCategory} />}
  </Modal>
);

const TemplateBody = ({ category, categories, onClose, onSwitchCategory }) => {
  const { data: remote, isLoading, isFetching, error, refetch } = useGetSpecTemplateQuery(category.id);
  const [start, setStart] = useState(null); // draft when creating / customising
  const nameOf = (id) => categories.find((c) => c.id === id)?.name || 'parent category';
  // The public endpoint only serves active categories; hidden ones are
  // resolved from the staff list (each row carries its own template).
  const local = error ? resolveTemplateLocal(categories, category.id) : null;
  const data = remote ?? local;

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (error && !local) {
    return (
      <div className="space-y-3 py-8 text-center">
        <p className="text-sm text-red-600">
          {error.status === 404 ? 'Spec templates are not available on the server yet.' : errorText(error, 'Could not load the template.')}
        </p>
        <Button variant="outline" size="sm" onClick={refetch}>Try again</Button>
      </div>
    );
  }

  const template = data?.template || null;
  const source = data?.source_category_id || null;
  const own = template && source === category.id;

  if (own) {
    return (
      <TemplateForm key={JSON.stringify(template)} category={category} initial={toDraft(template, true)} hasOwn
        refreshing={isFetching} onClose={onClose} />
    );
  }
  if (start) {
    return <TemplateForm category={category} initial={start} hasOwn={false} onCancel={() => setStart(null)} onClose={onClose} />;
  }

  if (template) {
    const parentName = nameOf(source);
    const fields = templateFields(template);
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-slate-900">Uses {parentName}&apos;s template</p>
          <p className="mt-1 text-sm text-slate-600">
            {category.name} has no template of its own, so its products use the {fields.length} spec fields from {parentName}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => onSwitchCategory(source)}><Pencil className="mr-2 h-4 w-4" />Edit {parentName}&apos;s template</Button>
            <Button type="button" onClick={() => setStart(toDraft(template, true))}><Copy className="mr-2 h-4 w-4" />Customise for this category</Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">“Customise” copies {parentName}&apos;s fields into a separate template for {category.name}; later changes to {parentName} won&apos;t affect it.</p>
        </div>
        <TemplateSummary template={template} />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-6 text-center">
      <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
      <div>
        <p className="font-medium text-slate-900">No spec template yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Without a template, staff type every spec by hand. Add groups like “Processor” or “Display” with the fields you want filled in for each {category.name} product.
        </p>
      </div>
      <Button type="button" onClick={() => setStart({ groups: [{ _uid: uid('g'), name: 'General', fields: [newField()] }] })}>
        <Plus className="mr-2 h-4 w-4" />Create a template
      </Button>
    </div>
  );
};

const TemplateSummary = ({ template }) => (
  <div className="grid gap-3 sm:grid-cols-2">
    {(template.groups || []).map((g) => (
      <div key={g.name} className="rounded-lg border p-3">
        <p className="text-sm font-semibold text-slate-800">{g.name}</p>
        <ul className="mt-1.5 space-y-1 text-sm text-slate-600">
          {(g.fields || []).map((f) => (
            <li key={f.key} className="flex items-center gap-1.5">
              {f.highlight && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Key spec" />}
              {f.label}{f.unit ? <span className="text-slate-400">({f.unit})</span> : null}
              <span className="text-xs text-slate-400">· {SPEC_TYPES.find((t) => t.value === f.type)?.label}</span>
            </li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

// ─── Editor ────────────────────────────────────────────────

const TemplateForm = ({ category, initial, hasOwn, onCancel, onClose, refreshing }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [save, { isLoading: saving }] = useUpdateSpecTemplateMutation();

  const dirty = !hasOwn || !sameJSON(toPayload(draft), toPayload(initial));
  const { errors, summary } = useMemo(() => validate(draft), [draft]);
  const highlightCount = draft.groups.reduce((n, g) => n + g.fields.filter((f) => f.highlight).length, 0);

  const setGroups = (fn) => setDraft((d) => ({ ...d, groups: fn(d.groups) }));
  const updateGroup = (gi, patch) => setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  const updateField = (gi, fi, patch) => setGroups((gs) => gs.map((g, i) => (i !== gi ? g : {
    ...g,
    fields: g.fields.map((f, j) => {
      if (j !== fi) return f;
      const next = { ...f, ...patch };
      // New fields: the key follows the label until someone edits it.
      if (patch.label !== undefined && !f._saved && !f._keyTouched) next.key = keyify(patch.label);
      return next;
    }),
  })));

  const removeGroup = async (gi) => {
    const g = draft.groups[gi];
    if (g.fields.length && !(await confirm({
      title: `Remove the “${g.name || 'unnamed'}” group?`,
      body: `Its ${g.fields.length} field(s) are removed from the template when you save. Values already saved on products stay, but show under “Other”.`,
      confirmLabel: 'Remove group', danger: true,
    }))) return;
    setGroups((gs) => gs.filter((_, i) => i !== gi));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (summary.length) { setShowErrors(true); toast.error(summary.join(' ')); return; }
    try {
      await save({ id: category.id, template: toPayload(draft) }).unwrap();
      toast.success(`Spec template saved for ${category.name}.`);
      onCancel?.();
    } catch (err) {
      toast.error(errorText(err, 'Could not save the template.'));
    }
  };

  const removeTemplate = async () => {
    if (!(await confirm({
      title: `Remove ${category.name}'s own template?`,
      body: 'Products keep the spec values they already have. If a parent category has a template, this category will use that one instead.',
      confirmLabel: 'Remove template', danger: true,
    }))) return;
    try {
      await save({ id: category.id, template: null }).unwrap();
      toast.success('Template removed.');
    } catch (err) {
      toast.error(errorText(err, 'Could not remove the template.'));
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-slate-600">
          {draft.groups.length} group(s) · {draft.groups.reduce((n, g) => n + g.fields.length, 0)} field(s) ·{' '}
          <span className={highlightCount > MAX_HIGHLIGHTS ? 'font-medium text-red-600' : ''}>{highlightCount} / {MAX_HIGHLIGHTS} key specs</span>
        </span>
        <div className="flex items-center gap-2">
          {refreshing && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          <UnsavedPill show={dirty && hasOwn} />
          {!hasOwn && <Badge tone="blue">New template — not saved yet</Badge>}
          <Button type="submit" size="sm" disabled={saving || !dirty}>{hasOwn ? 'Save template' : 'Create template'}</Button>
        </div>
      </div>

      {draft.groups.map((g, gi) => (
        <fieldset key={g._uid} className="rounded-lg border bg-slate-50/60">
          <legend className="sr-only">Group {g.name}</legend>
          <div className="flex flex-wrap items-start gap-2 border-b bg-white px-3 py-2.5 rounded-t-lg">
            <div className="min-w-[200px] flex-1">
              <TextInput value={g.name} onChange={(e) => updateGroup(gi, { name: e.target.value })} aria-label="Group name" placeholder="Group name, e.g. Processor" maxLength={80}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} className="font-semibold" />
              {showErrors && errors[g._uid] && <p className="mt-1 text-xs text-red-600">{errors[g._uid]}</p>}
            </div>
            <MoveButtons index={gi} count={draft.groups.length} label={`group ${g.name}`} onMove={(a, b) => setGroups((gs) => moveItem(gs, a, b))} />
            <IconButton icon={Trash2} tone="danger" label={`Remove group ${g.name}`} onClick={() => removeGroup(gi)} />
          </div>

          <div className="space-y-2 p-3">
            {g.fields.length === 0 && <p className="text-sm text-slate-500">No fields in this group yet.</p>}
            {g.fields.map((f, fi) => (
              <FieldRow key={f._uid} field={f} index={fi} count={g.fields.length} error={showErrors ? errors[f._uid] : null}
                highlightFull={highlightCount >= MAX_HIGHLIGHTS}
                onChange={(patch) => updateField(gi, fi, patch)}
                onMove={(a, b) => updateGroup(gi, { fields: moveItem(g.fields, a, b) })}
                onRemove={() => updateGroup(gi, { fields: g.fields.filter((_, j) => j !== fi) })} />
            ))}
            <Button type="button" variant="outline" size="sm" disabled={g.fields.length >= MAX_FIELDS}
              onClick={() => updateGroup(gi, { fields: [...g.fields, newField()] })}>
              <Plus className="mr-1 h-3.5 w-3.5" />Add field
            </Button>
          </div>
        </fieldset>
      ))}

      <Button type="button" variant="outline" disabled={draft.groups.length >= MAX_GROUPS}
        onClick={() => setGroups((gs) => [...gs, { _uid: uid('g'), name: '', fields: [newField()] }])}>
        <Plus className="mr-2 h-4 w-4" />Add group
      </Button>

      {showErrors && summary.length > 0 && <p role="alert" className="text-sm text-red-600">{summary.join(' ')}</p>}

      <div className="-mx-6 -mb-5 flex flex-wrap items-center gap-2 rounded-b-xl border-t bg-slate-50 px-6 py-3">
        <Button type="submit" disabled={saving || !dirty}>
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : hasOwn ? 'Save template' : 'Create template'}
        </Button>
        {!hasOwn && <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>}
        {hasOwn && dirty && <Button type="button" variant="ghost" disabled={saving} onClick={() => { setDraft(initial); setShowErrors(false); }}>Discard changes</Button>}
        <span className="flex-1" />
        {hasOwn && <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" disabled={saving} onClick={removeTemplate}>Remove template</Button>}
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Close</Button>
      </div>
    </form>
  );
};

const FieldRow = ({ field: f, index, count, error, highlightFull, onChange, onMove, onRemove }) => {
  const noEnter = (e) => { if (e.key === 'Enter') e.preventDefault(); };
  return (
    <div className={`rounded-md border bg-white p-3 ${error ? 'border-red-300' : ''}`}>
      <div className="grid gap-3 md:grid-cols-[1.4fr_1.1fr_1fr_0.7fr_auto]">
        <Field label="Label">
          {(id) => <TextInput id={id} value={f.label} onChange={(e) => onChange({ label: e.target.value })} onKeyDown={noEnter} placeholder="e.g. Battery life" maxLength={60} />}
        </Field>
        <Field label="Key" hint={f._saved ? 'Locked: products store values under it' : 'Made from the label'}>
          {(id) => (
            <div className="relative">
              <TextInput id={id} value={f.key} readOnly={f._saved} onKeyDown={noEnter} maxLength={40}
                onChange={(e) => onChange({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'), _keyTouched: true })}
                className={`font-mono text-xs ${f._saved ? 'bg-slate-50 pr-8 text-slate-500' : ''}`} />
              {f._saved && <Lock className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />}
            </div>
          )}
        </Field>
        <Field label="Type">
          {(id) => (
            <Select id={id} value={f.type} onChange={(e) => onChange({ type: e.target.value })}>
              {SPEC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Unit">
          {(id) => <TextInput id={id} value={f.unit} onChange={(e) => onChange({ unit: e.target.value })} onKeyDown={noEnter} maxLength={12}
            placeholder={f.type === 'number' ? 'e.g. GB' : '—'} disabled={f.type === 'select' || f.type === 'boolean'} />}
        </Field>
        <div className="flex items-end justify-end gap-1 pb-1">
          <MoveButtons index={index} count={count} label={`field ${f.label}`} onMove={onMove} />
          <IconButton icon={Trash2} tone="danger" label={`Remove field ${f.label}`} onClick={onRemove} />
        </div>
      </div>
      {f.type === 'select' && (
        <Field label="Options (one per line)" className="mt-3" hint={`${parseOptions(f.optionsText).length} option(s), up to ${MAX_OPTIONS}`}>
          {(id) => <TextArea id={id} rows={3} value={f.optionsText} onChange={(e) => onChange({ optionsText: e.target.value })} placeholder={'8 GB\n16 GB\n32 GB'} />}
        </Field>
      )}
      <div className="mt-3 flex flex-wrap gap-5">
        <label className={`flex items-center gap-2 text-sm ${!f.highlight && highlightFull ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-700'}`}>
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.highlight} disabled={!f.highlight && highlightFull} onChange={(e) => onChange({ highlight: e.target.checked })} />
          Key spec <span className="text-xs text-slate-400">(shown on product cards{!f.highlight && highlightFull ? ' · 4 already picked' : ''})</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.filterable} onChange={(e) => onChange({ filterable: e.target.checked })} />
          Can filter by it <span className="text-xs text-slate-400">(website filters)</span>
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
};

export default SpecTemplateEditor;
