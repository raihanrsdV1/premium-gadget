import { apiFetch } from "./http";

// Public repair lookup by ticket number + registered phone.
// Returns { success, data: ticket } or throws (404 when no match).
export async function trackRepair(ticketNumber, phone) {
  const qs = new URLSearchParams({ ticket_number: ticketNumber, phone });
  const json = await apiFetch(`/repairs/track?${qs.toString()}`);
  return json?.data ?? null;
}

/** Book a repair (public). Returns { ticket_number, status, branch } or throws with err.data.message. */
export async function createRepairTicket(body) {
  const json = await apiFetch("/repairs/tickets", { method: "POST", body, auth: true });
  return json?.data ?? null;
}
