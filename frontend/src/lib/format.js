// Display helpers shared by every admin screen.

const bdt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** ৳1,65,000 — South-Asian digit grouping, as customers see it on the website. */
export const formatBDT = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? `৳${bdt.format(n)}` : '—';
};

const dt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka',
});
const d = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' });

export const formatDateTime = (value) => (value ? dt.format(new Date(value)) : '—');
export const formatDate = (value) => (value ? d.format(new Date(value)) : '—');

/** Convert an ISO timestamp to a value for <input type="datetime-local"> (Dhaka time). */
export const toLocalInput = (iso) => {
  if (!iso) return '';
  const date = new Date(new Date(iso).getTime() + 6 * 3600 * 1000); // Asia/Dhaka is UTC+6, no DST
  return date.toISOString().slice(0, 16);
};

/** Inverse of toLocalInput: a Dhaka-time "YYYY-MM-DDTHH:mm" back to an ISO string. */
export const fromLocalInput = (value) => (value ? new Date(`${value}:00+06:00`).toISOString() : null);
