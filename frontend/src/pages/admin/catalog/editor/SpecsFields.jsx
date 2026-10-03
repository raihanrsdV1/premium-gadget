import React from 'react';
import { Link } from 'react-router-dom';
import { Info, Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { Field, TextInput, Select } from '../../../../components/admin/Field';
import { Button } from '../../../../components/ui/Button';
import { IconButton, MoveButtons } from '../../../../components/admin/catalog/CatalogUi';
import { moveItem, uid } from '../../../../components/admin/catalog/catalogUtils';

const noEnter = (e) => { if (e.key === 'Enter') e.preventDefault(); };

const TemplateInput = ({ field: f, value, onChange, error }) => {
  const v = value ?? '';
  const label = (
    <span className="inline-flex items-center gap-1">
      {f.label}
      {f.highlight && <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-label="Key spec (shown on product cards)" />}
    </span>
  );
  return (
    <Field label={label} error={error}>
      {(id) => {
        if (f.type === 'select') {
          const opts = f.options || [];
          return (
            <Select id={id} value={v} onChange={(e) => onChange(e.target.value)}>
              <option value="">—</option>
              {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              {v && !opts.includes(v) && <option value={v}>{v} (not in list)</option>}
            </Select>
          );
        }
        if (f.type === 'boolean') {
          return (
            <Select id={id} value={v} onChange={(e) => onChange(e.target.value)}>
              <option value="">—</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              {v && v !== 'Yes' && v !== 'No' && <option value={v}>{v}</option>}
            </Select>
          );
        }
        return (
          <div className="relative">
            <TextInput id={id} value={v} onChange={(e) => onChange(e.target.value)} onKeyDown={noEnter} maxLength={2000}
              inputMode={f.type === 'number' ? 'decimal' : undefined} className={f.unit ? 'pr-14' : ''} />
            {f.unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{f.unit}</span>}
          </div>
        );
      }}
    </Field>
  );
};

/**
 * Specification form: the category's template fields (grouped) plus free
 * "custom" rows. value = { values: { [field_key]: string }, custom: [{ _uid, label, value, group }] }.
 */
export const SpecsFields = ({ value, onChange, errors = {}, templateState, categoryId, note }) => {
  const { loading, template, sourceName, isInherited } = templateState;
  const setValue = (key, v) => onChange({ ...value, values: { ...value.values, [key]: v } });
  const setCustom = (custom) => onChange({ ...value, custom });
  const groupNames = [...new Set([...(template?.groups || []).map((g) => g.name), ...value.custom.map((c) => c.group).filter(Boolean)])];

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      {note && <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"><Info className="mt-0.5 h-4 w-4 shrink-0" />{note}</p>}

      {!categoryId ? (
        <p className="text-sm text-slate-500">Pick a category in Basics first — its spec fields appear here.</p>
      ) : template ? (
        <>
          <p className="text-sm text-slate-600">
            Fields from {isInherited ? `${sourceName}'s` : `the ${sourceName}`} spec template. Leave a field empty if it doesn&apos;t apply.
            {' '}<Star className="inline h-3 w-3 fill-amber-400 text-amber-400" /> = key spec, shown on product cards.
          </p>
          {template.groups.map((g) => (
            <fieldset key={g.name} className="rounded-lg border p-4">
              <legend className="px-1 text-sm font-semibold text-slate-800">{g.name}</legend>
              <div className="grid gap-4 md:grid-cols-2">
                {(g.fields || []).map((f) => (
                  <TemplateInput key={f.key} field={f} value={value.values[f.key]} error={errors[f.key]} onChange={(v) => setValue(f.key, v)} />
                ))}
              </div>
            </fieldset>
          ))}
        </>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-dashed bg-slate-50 p-4 text-sm text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            This category has no spec template yet, so add specs below by hand. A template gives every product in the category the same
            spec fields (and powers the key specs on product cards).{' '}
            <Link to={`/admin/categories?template=${categoryId}`} className="font-medium text-primary hover:underline">Set up a template</Link>
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{template ? 'Custom specs' : 'Specs'}</h3>
          <p className="text-xs text-muted-foreground">{template ? 'Anything the template doesn’t cover.' : 'e.g. Processor — Intel Core i5-1135G7.'} The group is optional (e.g. “Display”).</p>
        </div>
        {value.custom.length > 0 && (
          <ul className="space-y-2">
            {value.custom.map((c, i) => (
              <li key={c._uid} className="rounded-md border bg-white p-2">
                <div className="grid items-center gap-2 md:grid-cols-[1fr_1.6fr_0.9fr_auto]">
                  <TextInput aria-label={`Spec ${i + 1} label`} value={c.label} placeholder="Label, e.g. Weight" maxLength={120} onKeyDown={noEnter}
                    onChange={(e) => setCustom(value.custom.map((x) => (x._uid === c._uid ? { ...x, label: e.target.value } : x)))} />
                  <TextInput aria-label={`Spec ${i + 1} value`} value={c.value} placeholder="Value, e.g. 1.24 kg" maxLength={2000} onKeyDown={noEnter}
                    onChange={(e) => setCustom(value.custom.map((x) => (x._uid === c._uid ? { ...x, value: e.target.value } : x)))} />
                  <TextInput aria-label={`Spec ${i + 1} group`} value={c.group} placeholder="Group (optional)" maxLength={80} list="spec-group-names" onKeyDown={noEnter}
                    onChange={(e) => setCustom(value.custom.map((x) => (x._uid === c._uid ? { ...x, group: e.target.value } : x)))} />
                  <div className="flex items-center justify-end">
                    <MoveButtons index={i} count={value.custom.length} label={`spec ${c.label || i + 1}`} onMove={(a, b) => setCustom(moveItem(value.custom, a, b))} />
                    <IconButton icon={Trash2} tone="danger" label={`Remove spec ${c.label || i + 1}`} onClick={() => setCustom(value.custom.filter((x) => x._uid !== c._uid))} />
                  </div>
                </div>
                {errors[c._uid] && <p className="mt-1 px-1 text-xs text-red-600">{errors[c._uid]}</p>}
              </li>
            ))}
          </ul>
        )}
        <datalist id="spec-group-names">{groupNames.map((g) => <option key={g} value={g} />)}</datalist>
        <Button type="button" variant="outline" size="sm" disabled={value.custom.length >= 150}
          onClick={() => setCustom([...value.custom, { _uid: uid('spec'), label: '', value: '', group: '' }])}>
          <Plus className="mr-1 h-3.5 w-3.5" />Add a spec
        </Button>
      </div>
    </div>
  );
};

export default SpecsFields;
