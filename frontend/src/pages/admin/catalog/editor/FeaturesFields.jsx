import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { TextInput } from '../../../../components/admin/Field';
import { Button } from '../../../../components/ui/Button';
import { IconButton, MoveButtons } from '../../../../components/admin/catalog/CatalogUi';
import { moveItem, uid } from '../../../../components/admin/catalog/catalogUtils';

const MAX = 50;

/** Short selling points shown as a bullet list near the price. value = [{ _uid, text }]. */
export const FeaturesFields = ({ value, onChange, errors = {} }) => {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t || value.length >= MAX) return;
    onChange([...value, { _uid: uid('kf'), text: t }]);
    setText('');
  };
  return (
    <div className="space-y-3">
      {value.length === 0 && <p className="text-sm text-slate-500">No key features yet. Add 3–6 short points customers care about.</p>}
      {value.length > 0 && (
        <ol className="space-y-2">
          {value.map((f, i) => (
            <li key={f._uid}>
              <div className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-right text-sm tabular-nums text-slate-400">{i + 1}.</span>
                <TextInput aria-label={`Key feature ${i + 1}`} value={f.text} maxLength={255}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                  onChange={(e) => onChange(value.map((x) => (x._uid === f._uid ? { ...x, text: e.target.value } : x)))} />
                <MoveButtons index={i} count={value.length} label={`feature ${i + 1}`} onMove={(a, b) => onChange(moveItem(value, a, b))} />
                <IconButton icon={Trash2} tone="danger" label={`Remove key feature ${i + 1}`} onClick={() => onChange(value.filter((x) => x._uid !== f._uid))} />
              </div>
              {errors[f._uid] && <p className="ml-8 mt-1 text-xs text-red-600">{errors[f._uid]}</p>}
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <TextInput aria-label="New key feature" value={text} maxLength={255} placeholder="e.g. Up to 18 hours battery life"
          disabled={value.length >= MAX}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Button type="button" variant="outline" onClick={add} disabled={!text.trim() || value.length >= MAX}><Plus className="mr-1 h-4 w-4" />Add</Button>
      </div>
    </div>
  );
};

export default FeaturesFields;
