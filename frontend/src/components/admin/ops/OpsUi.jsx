import React, { useEffect, useRef, useState } from 'react';
import { Lock, AlertTriangle, Info, Search, X } from 'lucide-react';
import { useSelector } from 'react-redux';
import { Badge } from '../DataTable';
import { Select, TextInput } from '../Field';
import { useGetBranchesAdminQuery } from '../../../store/api/commonApi';
import { useDebounce } from '../../../hooks/useDebounce';
import {
  ORDER_STATUS, PAYMENT_STATUS, PAYMENT_METHOD, MOVEMENT_TYPE, UNIT_STATUS,
} from './labels';

/** Small shared pieces for the operations screens. */

export const OrderStatusBadge = ({ status }) => {
  const s = ORDER_STATUS[status] || { label: status, tone: 'slate' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
};

export const PaymentStatusBadge = ({ status }) => {
  const s = PAYMENT_STATUS[status] || { label: status, tone: 'slate' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
};

export const PaymentCell = ({ method, status }) => (
  <div className="flex flex-col items-start gap-1">
    <span className="whitespace-nowrap text-slate-700">{PAYMENT_METHOD[method] || method || '—'}</span>
    {status && <PaymentStatusBadge status={status} />}
  </div>
);

export const MovementBadge = ({ type }) => {
  const s = MOVEMENT_TYPE[type] || { label: type, tone: 'slate' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
};

export const UnitStatusBadge = ({ status }) => {
  const s = UNIT_STATUS[status] || { label: status, tone: 'slate' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
};

/** "Only a super admin can …" note shown instead of a hidden action. */
export const RoleNote = ({ children }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
    <Lock className="h-3.5 w-3.5 shrink-0" />{children}
  </span>
);

/** Inline alert box. tone: warn | danger | info */
export const Notice = ({ tone = 'info', title, children, className = '' }) => {
  const styles = {
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
    danger: 'border-red-300 bg-red-50 text-red-900',
    info: 'border-blue-200 bg-blue-50 text-blue-900',
  }[tone];
  const Icon = tone === 'info' ? Info : AlertTriangle;
  return (
    <div role={tone === 'danger' ? 'alert' : undefined} className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${styles} ${className}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
};

/**
 * Branch filter. Super admin: "All branches" (optional) or one branch.
 * Branch staff: fixed to their own branch, shown read-only.
 */
export const BranchFilter = ({ value, onChange, allowAll = true, id, label = 'Branch', className = '' }) => {
  const user = useSelector((s) => s.auth.user);
  const { data: branches = [] } = useGetBranchesAdminQuery();
  const isSuper = user?.role === 'super_admin';
  if (!isSuper) {
    const own = branches.find((b) => b.id === user?.branch_id);
    return (
      <div className={className}>
        <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
        <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-slate-50 px-3 text-sm text-slate-700" title="Branch staff see their own branch only">
          <Lock className="h-3.5 w-3.5 text-slate-400" />{own?.name || 'Your branch'}
        </div>
      </div>
    );
  }
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-slate-600">{label}</label>
      <Select id={id} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {allowAll ? <option value="">All branches</option> : <option value="" disabled>Choose a branch…</option>}
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.is_active ? '' : ' (closed)'}</option>)}
      </Select>
    </div>
  );
};

/** From / to date inputs (YYYY-MM-DD, whole Dhaka days). */
export const DateRange = ({ from, to, onChange, idPrefix }) => (
  <div className="flex items-end gap-2">
    <div>
      <label htmlFor={`${idPrefix}-from`} className="mb-1.5 block text-xs font-medium text-slate-600">From</label>
      <TextInput id={`${idPrefix}-from`} type="date" value={from || ''} max={to || undefined}
        onChange={(e) => onChange({ from: e.target.value, to })} className="w-[9.5rem]" />
    </div>
    <div>
      <label htmlFor={`${idPrefix}-to`} className="mb-1.5 block text-xs font-medium text-slate-600">To</label>
      <TextInput id={`${idPrefix}-to`} type="date" value={to || ''} min={from || undefined}
        onChange={(e) => onChange({ from, to: e.target.value })} className="w-[9.5rem]" />
    </div>
  </div>
);

/** Labelled filter control wrapper for filter bars. */
export const FilterField = ({ label, htmlFor, children, className = '' }) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-slate-600">{label}</label>
    {children}
  </div>
);

/** Tabs with counts; `tabs` = [{ value, label, count? }]. */
export const Tabs = ({ tabs, value, onChange, label }) => (
  <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b">
    {tabs.map((t) => {
      const active = t.value === value;
      return (
        <button key={t.value} type="button" role="tab" aria-selected={active} onClick={() => onChange(t.value)}
          className={`-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
            active ? 'border-primary text-primary' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}>
          {t.icon && <t.icon className="h-4 w-4" />}
          {t.label}
          {t.count > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${active ? 'bg-primary text-primary-foreground' : 'bg-amber-100 text-amber-800'}`}>{t.count}</span>
          )}
        </button>
      );
    })}
  </div>
);

/** Label/value row for detail cards. */
export const InfoRow = ({ label, children }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm">
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-right font-medium text-slate-900">{children}</dd>
  </div>
);

/**
 * Debounced search box. Keeps its own text and reports the trimmed value
 * after a pause. To clear it from outside, remount it with a new `key`.
 */
export const SearchBox = ({ value, onSearch, placeholder, id, label = 'Search', className = '', inputClassName = '' }) => {
  const [text, setText] = useState(value || '');
  const debounced = useDebounce(text, 350);
  const latest = useRef({ value, onSearch });
  useEffect(() => { latest.current = { value, onSearch }; });
  useEffect(() => {
    const { value: current, onSearch: report } = latest.current;
    if (debounced.trim() !== (current || '')) report(debounced.trim());
  }, [debounced]);

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-slate-600">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <TextInput id={id} type="text" enterKeyHint="search" value={text} placeholder={placeholder} autoComplete="off"
          onChange={(e) => setText(e.target.value)} className={`pl-9 pr-8 ${inputClassName}`} />
        {text && (
          <button type="button" aria-label="Clear search" onClick={() => setText('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
