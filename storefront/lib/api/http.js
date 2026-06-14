// Shared fetch helper for client-side storefront API calls.
// Mirrors the legacy axiosInstance: attaches the bearer token and unwraps the
// { success, data } envelope. Duplicated intentionally (apps don't share code).

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5001/api/v1";

function authHeaders() {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: any, auth?: boolean }} [opts]
 * @returns {Promise<any>} parsed JSON ({ success, data, ... })
 * @throws {Error & { status: number, data: any }} on non-2xx
 */
export async function apiFetch(path, { method = "GET", body, auth = false } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(auth ? authHeaders() : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  let json = {};
  try {
    json = await res.json();
  } catch {
    /* empty / non-JSON body */
  }

  if (!res.ok) {
    const message = json?.message || `Request failed (${res.status})`;
    // Surface API errors in the console for debuggability.
    console.error(`API ${method} ${path} → ${res.status}: ${message}`);

    // A 401 on an authenticated request means a stale/expired token — clear it
    // and bounce to login (mirrors the legacy axios interceptor) so the user
    // isn't wedged "logged in" with an invalid token.
    if (res.status === 401 && auth && typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = `/login?session=expired`;
      }
    }

    const err = new Error(message);
    err.status = res.status;
    err.data = json;
    throw err;
  }
  return json;
}
