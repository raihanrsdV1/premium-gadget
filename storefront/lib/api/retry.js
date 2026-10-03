// One retry for transient API failures: 502/503/504 (e.g. the API answering
// "busy, try again" while its database pool is momentarily full) or a dropped
// connection. A timeout is not retried: the caller's AbortSignal already
// bounds the total wait.
const RETRYABLE = new Set([502, 503, 504]);

export async function fetchWithRetry(url, init, { retries = 1, backoffMs = 400 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch(url, init);
      if (!RETRYABLE.has(res.status) || attempt >= retries) return res;
    } catch (err) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError" || attempt >= retries) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
  }
}
