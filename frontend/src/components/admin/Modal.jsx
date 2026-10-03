import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ConfirmContext } from './contexts';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';

// Open dialogs, innermost last: only the top one reacts to Esc / Tab, so Esc
// on a confirm stacked over a form closes just the confirm.
const openStack = [];

/**
 * Accessible dialog: Esc and backdrop close it, focus moves into it and
 * returns to the opener, Tab stays inside.
 *   <Modal open={open} onClose={close} title="Edit branch" footer={<Button>Save</Button>}>…</Modal>
 */
export const Modal = ({ open, onClose, title, description, children, footer, size = 'md' }) => {
  const panelRef = useRef(null);
  const titleId = useId();
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  // Latest onClose without re-running the effect: callers often pass inline
  // handlers, and re-running would yank focus back to the first field.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const panel = panelRef.current;
    openStack.push(panel);
    const focusables = () => panel?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || [];
    (focusables()[0] || panel)?.focus();
    const onKey = (e) => {
      if (openStack[openStack.length - 1] !== panel) return;
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current?.(); }
      if (e.key === 'Tab') {
        const els = [...focusables()].filter((el) => !el.disabled);
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      openStack.splice(openStack.indexOf(panel), 1);
      if (!openStack.length) document.body.style.overflow = '';
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`w-full ${width} rounded-xl bg-white shadow-2xl outline-none my-auto`}>
        <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t bg-slate-50 px-6 py-3 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
};

// ─── Confirm dialog (promise-based; use via hooks/useConfirm.js) ───
/**
 *   const confirm = useConfirm();
 *   if (await confirm({ title: 'Delete product?', body: '…', confirmLabel: 'Delete', danger: true })) …
 */
export const ConfirmProvider = ({ children }) => {
  const [state, setState] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (result) => { state?.resolve(result); setState(null); };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title || 'Are you sure?'} size="sm"
        footer={<>
          <Button variant="outline" onClick={() => close(false)}>{state?.cancelLabel || 'Cancel'}</Button>
          <Button variant={state?.danger ? 'destructive' : 'default'} onClick={() => close(true)}>{state?.confirmLabel || 'Confirm'}</Button>
        </>}>
        <div className="flex gap-3">
          {state?.danger && <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />}
          <div className="text-sm text-slate-700 leading-relaxed">{state?.body}</div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
};
