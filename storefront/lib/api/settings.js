import { apiFetch } from "./http";

/** Public store settings: contact info, delivery zones, COD availability. */
export async function getPublicSettings() {
  const json = await apiFetch("/settings");
  return json.data;
}
