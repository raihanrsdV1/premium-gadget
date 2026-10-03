import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Banknote, CheckCircle2, CreditCard, History, Loader2, Minus, Plus, Printer, ScanBarcode, Search,
  ShoppingCart, Smartphone, Tag, Trash2, X,
} from 'lucide-react';
import { PageHeader } from '@/components/admin/DataTable';
import { Field, MoneyInput, TextInput } from '@/components/admin/Field';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BranchFilter, Notice } from '@/components/admin/ops/OpsUi';
import { Receipt } from '@/components/admin/ops/Receipt';
import { PrintPortal } from '@/components/admin/ops/PrintPortal';
import { PAYMENT_METHOD } from '@/components/admin/ops/labels';
import { useCreateSaleMutation, useLazyPosCatalogQuery, usePosCatalogQuery } from '@/store/api/opsApi';
import { useGetBranchesAdminQuery } from '@/store/api/commonApi';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { formatBDT } from '@/lib/format';
import { errorText } from '@/lib/apiError';
import PriceModal from './PriceModal';

const PAY_BUTTONS = [
  { value: 'cash', icon: Banknote },
  { value: 'card', icon: CreditCard },
  { value: 'bkash', icon: Smartphone },
  { value: 'nagad', icon: Smartphone },
];

const BD_PHONE = /^01[3-9]\d{8}$/;
const normPhone = (v) => v.replace(/[\s-]/g, '').replace(/^\+?880/, '0');
const round2 = (n) => Math.round(n * 100) / 100;

const storageKey = (userId) => `pos.draft.${userId || 'anon'}`;
const readDraft = (userId) => {
  try { return JSON.parse(sessionStorage.getItem(storageKey(userId))) || null; } catch { return null; }
};

const emptyDraft = (branchId) => ({
  branchId, cart: [], discount: '', discountReason: '', coupon: '', phone: '', name: '', payment: 'cash',
});

const lineTotal = (l) => round2((l.override ? l.override.price : Number(l.list_price)) * l.quantity);

/** /admin/pos — counter sale: search or scan, cart, payment, receipt. */
const PosPage = () => {
  const user = useSelector((s) => s.auth.user);
  const isSuper = user?.role === 'super_admin';
  const toast = useToast();
  const confirm = useConfirm();
  const searchRef = useRef(null);

  // The unfinished sale survives an accidental refresh or a quick visit to another page.
  const [draft, setDraft] = useState(() => {
    const saved = readDraft(user?.id);
    const own = user?.branch_id || '';
    if (saved && (isSuper || saved.branchId === own)) return { ...emptyDraft(own), ...saved };
    return emptyDraft(own);
  });
  const patch = (p) => setDraft((d) => ({ ...d, ...p }));
  useEffect(() => {
    try { sessionStorage.setItem(storageKey(user?.id), JSON.stringify(draft)); } catch { /* storage unavailable */ }
  }, [draft, user?.id]);

  const { branchId, cart } = draft;
  const cartRef = useRef(cart);
  useEffect(() => { cartRef.current = cart; }, [cart]);
  const [text, setText] = useState('');
  const [priceLine, setPriceLine] = useState(null);
  const [saleError, setSaleError] = useState(null);
  const [sale, setSale] = useState(null);
  // Scan / add feedback shown under the search box (toasts would cover the cart's buttons).
  const [scanNote, setScanNote] = useState(null);
  const [flash, setFlash] = useState(null);
  const say = (tone, text) => setScanNote((prev) => ({ tone, text, at: (prev?.at || 0) + 1 }));
  const closePrice = useCallback(() => setPriceLine(null), []);

  const { data: branches = [] } = useGetBranchesAdminQuery();
  const branch = branches.find((b) => b.id === branchId);
  const q = useDebounce(text.trim(), 250);
  const { data: results = [], isFetching, error: searchError } = usePosCatalogQuery(
    { q, branch_id: branchId || undefined },
    { skip: !q || !branchId },
  );
  const [lookup] = useLazyPosCatalogQuery();
  const [createSale, { isLoading: saving }] = useCreateSaleMutation();

  // Typing anywhere on the page (e.g. a barcode scan after clicking a button) goes to the search box.
  useEffect(() => {
    if (sale) return undefined;
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      const typing = el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
      if (typing || document.querySelector('[role="dialog"]')) return;
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sale]);

  // ─── Cart operations ───
  // Scans resolve asynchronously, so cart changes use functional updates
  // (two quick scans must not overwrite each other); checks read the latest
  // cart through a ref.
  const updateCart = (fn) => setDraft((d) => ({ ...d, cart: fn(d.cart) }));

  const addToCart = (row, { unitId = null, serial = null } = {}) => {
    const name = `${row.product_name} (${row.variant_name})`;
    if (row.available <= 0) {
      say('error', `${name} is out of stock at this branch.`);
      return false;
    }
    const existing = cartRef.current.find((l) => l.variant_id === row.variant_id);
    if (existing && unitId && existing.unit_ids.includes(unitId)) {
      say('info', 'That serial number is already in the cart.');
      return false;
    }
    if (existing && existing.quantity >= row.available) {
      say('error', `Only ${row.available} of ${name} available at this branch.`);
      return false;
    }
    updateCart((lines) => {
      const line = lines.find((l) => l.variant_id === row.variant_id);
      if (!line) {
        return [...lines, {
          variant_id: row.variant_id,
          product_name: row.product_name,
          variant_name: row.variant_name,
          sku: row.sku,
          list_price: Number(row.effective_price),
          compare_at_price: row.compare_at_price,
          min_staff_price: row.min_staff_price ?? null,
          available: row.available,
          quantity: 1,
          unit_ids: unitId ? [unitId] : [],
          serials: serial ? [serial] : [],
          override: null,
        }];
      }
      if (line.quantity >= row.available || (unitId && line.unit_ids.includes(unitId))) return lines;
      return lines.map((l) => (l === line ? {
        ...l,
        quantity: l.quantity + 1,
        available: row.available,
        unit_ids: unitId ? [...l.unit_ids, unitId] : l.unit_ids,
        serials: serial ? [...l.serials, serial] : l.serials,
      } : l));
    });
    setSaleError(null);
    setFlash(row.variant_id);
    setTimeout(() => setFlash((f) => (f === row.variant_id ? null : f)), 1500);
    return true;
  };

  const setQty = (variantId, qty) => {
    updateCart((lines) => lines.map((l) => {
      if (l.variant_id !== variantId) return l;
      const quantity = Math.max(1, Math.min(qty, l.available));
      return { ...l, quantity, unit_ids: l.unit_ids.slice(0, quantity), serials: l.serials.slice(0, quantity) };
    }));
    setSaleError(null);
  };
  const removeLine = (variantId) => {
    updateCart((lines) => lines.filter((l) => l.variant_id !== variantId));
    setSaleError(null);
    searchRef.current?.focus();
  };
  const savePrice = (override) => {
    const id = priceLine.variant_id;
    updateCart((lines) => lines.map((l) => (l.variant_id === id ? { ...l, override } : l)));
    setPriceLine(null);
    setSaleError(null);
  };

  // ─── Search / scan ───
  const onSearchKey = async (e) => {
    if (e.key === 'Escape') { setText(''); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const term = text.trim();
    if (!term || !branchId) return;
    // Clear at once so the next scan can start while this one is looked up.
    setText('');
    const restore = () => setText((cur) => (cur === '' ? term : cur));
    try {
      const rows = await lookup({ q: term, branch_id: branchId }).unwrap();
      const exact = rows.find((r) => r.exact_sku) || rows.find((r) => r.matched_unit_id);
      if (exact) {
        const bySerial = !exact.exact_sku && exact.matched_unit_id;
        if (addToCart(exact, bySerial ? { unitId: exact.matched_unit_id, serial: term } : {})) {
          say('success', `Added ${exact.product_name} (${exact.variant_name})${bySerial ? ` · S/N ${term}` : ''}`);
        }
      } else if (rows.length) {
        restore();
        say('info', `No exact SKU match for "${term}" — pick the product from the list.`);
      } else {
        restore();
        say('error', `Nothing found for "${term}".`);
      }
    } catch (err) {
      restore();
      say('error', errorText(err));
    }
  };

  const pickResult = (row) => {
    if (addToCart(row)) {
      say('success', `Added ${row.product_name} (${row.variant_name})`);
      setText('');
      searchRef.current?.focus();
    }
  };

  // ─── Totals ───
  const subtotal = round2(cart.reduce((s, l) => s + lineTotal(l), 0));
  const listSubtotal = round2(cart.reduce((s, l) => s + Number(l.list_price) * l.quantity, 0));
  const discount = Number(draft.discount) || 0;
  const total = round2(Math.max(0, subtotal - discount));
  const capLine = cart.find((l) => l.min_staff_price != null && Number(l.list_price) > 0);
  const pct = capLine ? round2((1 - Number(capLine.min_staff_price) / Number(capLine.list_price)) * 100) : (isSuper ? null : 10);
  const maxStaffDiscount = !isSuper && pct != null ? round2(Math.min(subtotal * pct / 100, listSubtotal * pct / 100 - (listSubtotal - subtotal))) : null;
  const phoneNorm = normPhone(draft.phone.trim());
  const phoneBad = draft.phone.trim() !== '' && !BD_PHONE.test(phoneNorm);

  const changeBranch = async (next) => {
    if (next === branchId) return;
    if (cart.length && !(await confirm({ title: 'Switch branch?', body: 'The cart will be emptied: stock is different at each branch.', confirmLabel: 'Switch and empty cart' }))) return;
    patch({ branchId: next, cart: [] });
    setSaleError(null);
  };

  const clearSale = async () => {
    if (!cart.length) return;
    if (!(await confirm({ title: 'Empty the cart?', body: 'All items, the discount and the customer details are removed.', confirmLabel: 'Empty cart', danger: true }))) return;
    setDraft(emptyDraft(branchId));
    setSaleError(null);
    searchRef.current?.focus();
  };

  const complete = async () => {
    if (saving || !cart.length || !branchId) return;
    if (phoneBad) { setSaleError('The customer phone number looks wrong. Use 01XXXXXXXXX or leave it empty.'); return; }
    if (discount < 0 || discount > subtotal) { setSaleError('The discount must be between 0 and the subtotal.'); return; }
    setSaleError(null);
    const body = {
      branch_id: isSuper ? branchId : undefined,
      items: cart.map((l) => ({
        variant_id: l.variant_id,
        quantity: l.quantity,
        ...(l.override ? { unit_price: l.override.price, price_override_reason: l.override.reason } : {}),
        ...(l.unit_ids.length ? { unit_ids: l.unit_ids } : {}),
      })),
      discount: discount > 0 ? discount : 0,
      discount_reason: discount > 0 && draft.discountReason.trim() ? draft.discountReason.trim() : undefined,
      coupon_code: draft.coupon.trim() || undefined,
      customer_phone: phoneNorm || undefined,
      customer_name: draft.name.trim() || undefined,
      payment_method: draft.payment,
    };
    try {
      const result = await createSale(body).unwrap();
      setSale(result);
      setDraft(emptyDraft(branchId));
      setText('');
      toast.success(`Sale ${result.order_number} complete · ${formatBDT(result.total_amount)}`);
    } catch (err) {
      const msg = errorText(err);
      setSaleError(msg);
      toast.error(msg);
    }
  };

  const newSale = () => {
    setSale(null);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  // ─── Receipt screen ───
  if (sale) {
    return (
      <div className="space-y-5">
        <PageHeader title="Sale complete" description={`${sale.order_number} · ${sale.branch_name}`}
          actions={<Link to="/admin/pos/sales"><Button variant="outline"><History className="mr-2 h-4 w-4" />Sales history</Button></Link>} />
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <Card className="flex flex-col items-center justify-center gap-4 p-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-600" />
            <div>
              <p className="text-sm text-slate-500">Total received ({PAYMENT_METHOD[sale.payment_method]})</p>
              <p className="text-4xl font-bold tracking-tight text-slate-900">{formatBDT(sale.total_amount)}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={() => window.print()}><Printer className="mr-2 h-5 w-5" />Print receipt</Button>
              <Button size="lg" variant="outline" onClick={newSale} autoFocus><Plus className="mr-2 h-5 w-5" />New sale</Button>
            </div>
            <p className="text-xs text-slate-500">You can reprint this receipt later from Sales history.</p>
          </Card>
          <div className="rounded-lg border bg-white p-3 shadow-sm" aria-label="Receipt preview">
            <Receipt sale={sale} branch={branch} />
          </div>
        </div>
        <PrintPortal page="receipt"><Receipt sale={sale} branch={branch} /></PrintPortal>
      </div>
    );
  }

  const needsBranch = isSuper && !branchId;

  return (
    <div className="space-y-4">
      <PageHeader
        title="POS — in-store sale"
        description={branch ? `Selling from ${branch.name}` : 'Choose the branch you are selling from'}
        actions={<>
          {isSuper && !needsBranch && (
            <BranchFilter id="pos-branch" label="Branch" allowAll={false} value={branchId} onChange={changeBranch} className="w-44" />
          )}
          <Link to="/admin/pos/sales" className="self-end"><Button variant="outline"><History className="mr-2 h-4 w-4" />Sales history</Button></Link>
        </>}
      />

      {needsBranch ? (
        <Card className="mx-auto max-w-md space-y-4 p-6">
          <p className="text-sm text-slate-700">Your account isn&apos;t tied to a branch. Choose the branch this counter sells from — stock is taken from there.</p>
          <BranchFilter id="pos-branch-first" label="Branch" allowAll={false} value="" onChange={changeBranch} />
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* ─── Left: search / scan ─── */}
          <div className="space-y-3">
            <div className="relative">
              <label htmlFor="pos-search" className="sr-only">Search product or scan barcode</label>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input id="pos-search" ref={searchRef} autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onSearchKey}
                placeholder="Scan barcode, or type name / SKU" autoComplete="off" spellCheck={false} enterKeyHint="search"
                className="h-14 w-full rounded-lg border-2 border-input bg-white pl-12 pr-12 text-lg shadow-sm placeholder:text-slate-400 focus-visible:border-primary focus-visible:outline-none" />
              {isFetching ? (
                <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-slate-400" />
              ) : text && (
                <button type="button" aria-label="Clear search" onClick={() => { setText(''); searchRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              )}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-slate-500"><ScanBarcode className="h-3.5 w-3.5" />Scanning a barcode (SKU or serial number) adds the item straight to the cart. Press F2 to jump back here.</p>

            {scanNote && (
              <p key={scanNote.at} role="status" className={`rounded-md px-3 py-2 text-sm font-medium ${{
                success: 'bg-emerald-50 text-emerald-800', info: 'bg-blue-50 text-blue-800', error: 'bg-red-50 text-red-700',
              }[scanNote.tone]}`}>{scanNote.text}</p>
            )}
            {searchError && <Notice tone="danger">{errorText(searchError)}</Notice>}
            {!q ? (
              <div className="rounded-lg border border-dashed bg-white px-6 py-14 text-center text-sm text-slate-500">
                <ScanBarcode className="mx-auto mb-2 h-8 w-8 text-slate-300" />Scan or search to add items.
              </div>
            ) : results.length === 0 && !isFetching ? (
              <div className="rounded-lg border bg-white px-6 py-10 text-center text-sm text-slate-500">No product matches &ldquo;{q}&rdquo;.</div>
            ) : (
              <ul className="divide-y overflow-hidden rounded-lg border bg-white" aria-label="Search results">
                {results.map((r) => {
                  const inCart = cart.find((l) => l.variant_id === r.variant_id)?.quantity || 0;
                  const out = r.available <= 0;
                  return (
                    <li key={r.variant_id}>
                      <button type="button" disabled={out} onClick={() => pickResult(r)}
                        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-primary/5 focus:bg-primary/5 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60">
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900">{r.product_name}</span>
                          <span className="block text-sm text-slate-600">{r.variant_name}</span>
                          <span className="block font-mono text-xs text-slate-500">{r.sku}{r.serial_units_in_stock > 0 && ` · ${r.serial_units_in_stock} with serial`}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-base font-semibold text-slate-900">{formatBDT(r.effective_price)}</span>
                          {r.compare_at_price && Number(r.compare_at_price) > Number(r.effective_price) && (
                            <span className="block text-xs text-slate-400 line-through">{formatBDT(r.compare_at_price)}</span>
                          )}
                          <span className={`block text-xs font-medium ${out ? 'text-red-600' : 'text-emerald-700'}`}>
                            {out ? 'Out of stock here' : `${r.available} available`}{inCart ? ` · ${inCart} in cart` : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ─── Right: cart ─── */}
          <Card className="lg:sticky lg:top-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="flex items-center gap-2 font-semibold"><ShoppingCart className="h-4 w-4" />Cart{cart.length > 0 && <span className="text-sm font-normal text-slate-500">({cart.reduce((n, l) => n + l.quantity, 0)} items)</span>}</h2>
              {cart.length > 0 && <Button variant="ghost" size="sm" onClick={clearSale} className="text-slate-500">Empty cart</Button>}
            </div>

            {cart.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">The cart is empty.</p>
            ) : (
              <ul className="max-h-[42vh] divide-y overflow-y-auto">
                {cart.map((l) => (
                  <li key={l.variant_id} className={`space-y-2 px-4 py-3 transition-colors duration-700 ${flash === l.variant_id ? 'bg-emerald-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug text-slate-900">{l.product_name}</p>
                        <p className="text-xs text-slate-500">{l.variant_name} · <span className="font-mono">{l.sku}</span></p>
                        {l.serials.length > 0 && <p className="text-xs text-slate-600">S/N {l.serials.join(', ')}</p>}
                      </div>
                      <button type="button" onClick={() => removeLine(l.variant_id)} aria-label={`Remove ${l.product_name} from cart`}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-md border" role="group" aria-label={`Quantity of ${l.product_name}`}>
                        <button type="button" onClick={() => setQty(l.variant_id, l.quantity - 1)} disabled={l.quantity <= 1} aria-label="One less"
                          className="flex h-9 w-9 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                        <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{l.quantity}</span>
                        <button type="button" onClick={() => setQty(l.variant_id, l.quantity + 1)} disabled={l.quantity >= l.available} aria-label="One more"
                          className="flex h-9 w-9 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                      </div>
                      <button type="button" onClick={() => setPriceLine(l)} className="text-right text-xs text-primary hover:underline">
                        {l.override ? (
                          <><span className="text-slate-400 line-through">{formatBDT(l.list_price)}</span> {formatBDT(l.override.price)} each</>
                        ) : <>{formatBDT(l.list_price)} each</>}
                        <span className="block">Change price</span>
                      </button>
                      <span className="w-24 text-right text-sm font-semibold tabular-nums">{formatBDT(lineTotal(l))}</span>
                    </div>
                    {l.override && <p className="text-xs text-amber-700">Price changed: {l.override.reason}</p>}
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-3 border-t px-4 py-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Discount (৳)" hint={maxStaffDiscount != null && cart.length ? `Up to ${formatBDT(Math.max(0, maxStaffDiscount))}` : undefined}>
                  {(id) => <MoneyInput id={id} value={draft.discount} onChange={(e) => { patch({ discount: e.target.value }); setSaleError(null); }} placeholder="0" />}
                </Field>
                <Field label="Coupon code">
                  {(id) => <TextInput id={id} value={draft.coupon} onChange={(e) => { patch({ coupon: e.target.value.toUpperCase() }); setSaleError(null); }} placeholder="Optional" maxLength={40} className="uppercase" />}
                </Field>
              </div>
              {discount > 0 && (
                <Field label="Discount reason">
                  {(id) => <TextInput id={id} value={draft.discountReason} onChange={(e) => patch({ discountReason: e.target.value })} maxLength={255} placeholder="e.g. Regular customer" />}
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Customer phone" error={phoneBad ? 'Use 01XXXXXXXXX' : undefined}>
                  {(id) => <TextInput id={id} type="tel" inputMode="tel" value={draft.phone} onChange={(e) => patch({ phone: e.target.value })} placeholder="Optional" maxLength={16} />}
                </Field>
                <Field label="Customer name">
                  {(id) => <TextInput id={id} value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Optional" maxLength={120} />}
                </Field>
              </div>

              <div>
                <span id="pos-pay-label" className="mb-1.5 block text-sm font-medium text-slate-700">Payment</span>
                <div role="group" aria-labelledby="pos-pay-label" className="grid grid-cols-4 gap-2">
                  {PAY_BUTTONS.map(({ value, icon: Icon }) => {
                    const on = draft.payment === value;
                    return (
                      <button key={value} type="button" aria-pressed={on} onClick={() => patch({ payment: value })}
                        className={`flex h-12 flex-col items-center justify-center rounded-md border text-xs font-semibold transition-colors ${on ? 'border-primary bg-primary text-primary-foreground' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
                        <Icon className="mb-0.5 h-4 w-4" />{PAYMENT_METHOD[value]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <dl className="space-y-1 border-t pt-3 text-sm">
                <div className="flex justify-between"><dt className="text-slate-600">Subtotal</dt><dd className="tabular-nums">{formatBDT(subtotal)}</dd></div>
                {discount > 0 && <div className="flex justify-between"><dt className="text-slate-600">Discount</dt><dd className="tabular-nums">−{formatBDT(discount)}</dd></div>}
                {draft.coupon.trim() && <div className="flex justify-between text-xs"><dt className="flex items-center gap-1 text-slate-500"><Tag className="h-3 w-3" />Coupon {draft.coupon.trim()}</dt><dd className="text-slate-500">applied when you complete</dd></div>}
                <div className="flex items-baseline justify-between pt-1"><dt className="text-base font-semibold">Total</dt><dd className="text-2xl font-bold tabular-nums">{formatBDT(total)}</dd></div>
              </dl>

              {saleError && <Notice tone="danger" title="Sale not completed">{saleError}</Notice>}

              <Button type="button" size="lg" className="h-14 w-full text-base" onClick={complete} disabled={saving || !cart.length}>
                {saving ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Completing…</> : <>Complete sale{cart.length ? ` · ${formatBDT(total)}` : ''}</>}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {priceLine && <PriceModal line={priceLine} pct={pct} onSave={savePrice} onClose={closePrice} />}
    </div>
  );
};

export default PosPage;
