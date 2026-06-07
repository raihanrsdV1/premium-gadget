import { apiFetch } from "./http";

// Public repair lookup by ticket number + registered phone.
// Returns { success, data: ticket } or throws (404 when no match).
export async function trackRepair(ticketNumber, phone) {
  const qs = new URLSearchParams({ ticket_number: ticketNumber, phone });
  const json = await apiFetch(`/repairs/track?${qs.toString()}`);
  return json?.data ?? null;
}
