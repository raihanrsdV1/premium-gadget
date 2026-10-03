// Plain-language labels and badge colours for the operations screens
// (orders, inventory, POS), plus small helpers they share.

export const ORDER_STATUS = {
  pending: { label: 'Pending', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'blue' },
  processing: { label: 'Processing', tone: 'violet' },
  shipped: { label: 'Shipped', tone: 'blue' },
  delivered: { label: 'Delivered', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
  returned: { label: 'Returned', tone: 'red' },
};

export const PAYMENT_STATUS = {
  pending: { label: 'Not paid', tone: 'amber' },
  processing: { label: 'Held for review', tone: 'violet' },
  completed: { label: 'Paid', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  refunded: { label: 'Refunded', tone: 'slate' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};

export const PAYMENT_METHOD = {
  cod: 'Cash on delivery',
  card: 'Card',
  bkash: 'bKash',
  nagad: 'Nagad',
  net_banking: 'Net banking',
  cash: 'Cash',
  other: 'Other',
};

export const CHANNEL = { online: 'Website', pos: 'In store' };

/**
 * Allowed staff status changes; mirrors TRANSITIONS in the API's
 * order.service.js (anything else is refused there with a 409).
 */
export const ORDER_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

export const MOVEMENT_TYPE = {
  initial: { label: 'Opening stock', tone: 'slate' },
  received: { label: 'Received', tone: 'green' },
  sale: { label: 'Sold', tone: 'blue' },
  return: { label: 'Returned', tone: 'green' },
  reservation: { label: 'Reserved (online order)', tone: 'amber' },
  release: { label: 'Reservation released', tone: 'slate' },
  adjustment: { label: 'Adjustment', tone: 'violet' },
  correction: { label: 'Correction', tone: 'violet' },
  damaged: { label: 'Damaged', tone: 'red' },
  lost: { label: 'Lost', tone: 'red' },
  transfer_in: { label: 'Transfer in', tone: 'green' },
  transfer_out: { label: 'Transfer out', tone: 'amber' },
  written_off: { label: 'Written off', tone: 'red' },
};

export const ADJUST_REASONS = [
  { value: 'received', label: 'Received new stock' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'lost', label: 'Lost / missing' },
  { value: 'correction', label: 'Count correction' },
  { value: 'returned', label: 'Customer return' },
  { value: 'other', label: 'Other' },
];

export const UNIT_STATUS = {
  in_stock: { label: 'In stock', tone: 'green' },
  sold: { label: 'Sold', tone: 'blue' },
  returned: { label: 'Returned', tone: 'amber' },
  written_off: { label: 'Written off', tone: 'red' },
};

/** Serial-unit status changes; mirrors UNIT_TRANSITIONS in inventory.service.js. */
export const UNIT_TRANSITIONS = {
  in_stock: ['sold', 'written_off'],
  sold: ['returned'],
  returned: ['in_stock', 'written_off'],
  written_off: ['in_stock'],
};

export const POS_PAYMENT_METHODS = ['cash', 'card', 'bkash', 'nagad'];

export const COURIERS = ['Steadfast', 'Pathao', 'RedX', 'Sundarban Courier', 'SA Paribahan', 'Paperfly', 'eCourier', 'Own delivery'];

/** Today's date in Dhaka as YYYY-MM-DD. */
export const dhakaDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + 6 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return d.toISOString().slice(0, 10);
};

/** 01886670543 → 01886-670543 */
export const formatPhone = (phone) => {
  const p = String(phone || '').trim();
  return /^01\d{9}$/.test(p) ? `${p.slice(0, 5)}-${p.slice(5)}` : p;
};

export const SHOP_PHONE = '01886-670543';

/** The shipping address as lines for display, print and courier booking. */
export const addressLines = (a) => {
  if (!a) return [];
  return [
    a.full_name,
    a.phone,
    a.street,
    [a.area, a.district].filter(Boolean).join(', '),
    [a.division, a.postal_code].filter(Boolean).join(' '),
  ].filter(Boolean);
};

/** Copy text; falls back to execCommand where the Clipboard API is unavailable (plain-http LAN). */
export const copyText = async (text) => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('copy failed');
};

/** A signed quantity for the ledger: +3 / −2. */
export const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
