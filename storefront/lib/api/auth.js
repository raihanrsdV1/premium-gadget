import { apiFetch } from "./http";

// Returns { success, data: { user, token } }
export function login(credentials) {
  return apiFetch("/auth/login", { method: "POST", body: credentials });
}

export function register(data) {
  return apiFetch("/auth/register", { method: "POST", body: data });
}
