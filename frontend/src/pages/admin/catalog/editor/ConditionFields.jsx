import React from 'react';
import { Field, TextInput, TextArea, Select } from '../../../../components/admin/Field';
import { WARRANTY_TYPES, conditionInfo } from '../../../../components/admin/catalog/catalogUtils';
import { GRADES } from './productModel';

const noEnter = (e) => { if (e.key === 'Enter') e.preventDefault(); };

const UsedDetails = ({ d, onChange, errors }) => (
  <div className="grid gap-5 md:grid-cols-3">
    <Field label="Grade" hint="A+ = like new … C = heavy wear.">
      {(id) => (
        <Select id={id} value={d.condition_grade} onChange={(e) => onChange({ condition_grade: e.target.value })}>
          <option value="">Not graded</option>
          {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
          {d.condition_grade && !GRADES.includes(d.condition_grade) && <option value={d.condition_grade}>Grade {d.condition_grade}</option>}
        </Select>
      )}
    </Field>
    <Field label="Battery health (%)" error={errors.battery_health}>
      {(id) => <TextInput id={id} type="number" min="0" max="100" step="1" inputMode="numeric" value={d.battery_health}
        onChange={(e) => onChange({ battery_health: e.target.value })} onKeyDown={noEnter} placeholder="e.g. 89" />}
    </Field>
    <Field label="Charge cycles" error={errors.battery_cycles}>
      {(id) => <TextInput id={id} type="number" min="0" step="1" inputMode="numeric" value={d.battery_cycles}
        onChange={(e) => onChange({ battery_cycles: e.target.value })} onKeyDown={noEnter} placeholder="e.g. 160" />}
    </Field>
    <Field label="Condition notes" className="md:col-span-3" error={errors.condition_notes}
      hint="Be honest about marks, scratches or repairs — it builds trust and avoids returns.">
      {(id) => <TextArea id={id} rows={3} value={d.condition_notes} onChange={(e) => onChange({ condition_notes: e.target.value })}
        maxLength={2000} placeholder="e.g. Tiny scratch on the lid, screen and keyboard are perfect." />}
    </Field>
  </div>
);

/**
 * Condition (grade, battery, notes) and warranty. Used / refurbished /
 * open-box details are shown up front; for new items they sit in a fold.
 */
export const ConditionFields = ({ value: d, onChange, errors = {}, condition }) => {
  const isNewItem = condition === 'new';
  return (
    <div className="space-y-6">
      {isNewItem ? (
        <details className="rounded-lg border bg-slate-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Grade, battery and condition notes (for used items)</summary>
          <div className="pt-4"><UsedDetails d={d} onChange={onChange} errors={errors} /></div>
        </details>
      ) : (
        <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-4">
          <p className="mb-4 text-sm font-semibold text-amber-900">{conditionInfo(condition).label} item — customers look for these details first</p>
          <UsedDetails d={d} onChange={onChange} errors={errors} />
        </div>
      )}

      <Field label="In the box / accessories" error={errors.accessories} hint="What the customer gets, e.g. “Original 65W charger, box”.">
        {(id) => <TextArea id={id} rows={2} value={d.accessories} onChange={(e) => onChange({ accessories: e.target.value })} maxLength={2000} />}
      </Field>

      <div className="grid gap-5 md:grid-cols-3">
        <Field label="Warranty type">
          {(id) => (
            <Select id={id} value={d.warranty_type} onChange={(e) => onChange({ warranty_type: e.target.value })}>
              {WARRANTY_TYPES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Warranty (months)" error={errors.warranty_months}>
          {(id) => <TextInput id={id} type="number" min="0" max="120" step="1" inputMode="numeric" value={d.warranty_months}
            disabled={d.warranty_type === 'none'} onChange={(e) => onChange({ warranty_months: e.target.value })} onKeyDown={noEnter} placeholder="e.g. 12" />}
        </Field>
        <Field label="Warranty notes" className="md:col-span-3" error={errors.warranty_notes} hint="What is and isn't covered.">
          {(id) => <TextArea id={id} rows={2} value={d.warranty_notes} onChange={(e) => onChange({ warranty_notes: e.target.value })} maxLength={2000} />}
        </Field>
      </div>
    </div>
  );
};

export default ConditionFields;
