import React, { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Form building blocks with labels wired to inputs.
 *   <Field label="Price (৳)" hint="Before discounts" error={errors.price}>
 *     {(id) => <TextInput id={id} type="number" … />}
 *   </Field>
 * Children may also be a plain element; then pass `id` yourself.
 */
export const Field = ({ label, hint, error, required, className, children }) => {
  const id = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}{required && <span className="text-red-600"> *</span>}
        </label>
      )}
      {typeof children === 'function' ? children(id) : children}
      {error ? <p className="text-xs text-red-600">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
};

const base = 'w-full rounded-md border border-input bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

export const TextInput = React.forwardRef(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(base, 'h-10', className)} {...props} />
));
TextInput.displayName = 'TextInput';

export const TextArea = React.forwardRef(({ className, rows = 4, ...props }, ref) => (
  <textarea ref={ref} rows={rows} className={cn(base, 'py-2 leading-relaxed', className)} {...props} />
));
TextArea.displayName = 'TextArea';

export const Select = React.forwardRef(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(base, 'h-10 pr-8', className)} {...props}>{children}</select>
));
Select.displayName = 'Select';

export const Checkbox = ({ label, hint, checked, onChange, disabled }) => (
  <label className={cn('flex items-start gap-3', disabled ? 'opacity-60' : 'cursor-pointer')}>
    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={!!checked} disabled={disabled}
      onChange={(e) => onChange?.(e.target.checked)} />
    <span>
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </span>
  </label>
);

/** Money input: shows ৳, keeps the value a string while typing. */
export const MoneyInput = React.forwardRef(({ className, ...props }, ref) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">৳</span>
    <input ref={ref} type="number" inputMode="decimal" min="0" step="1" className={cn(base, 'h-10 pl-7', className)} {...props} />
  </div>
));
MoneyInput.displayName = 'MoneyInput';
