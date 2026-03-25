/**
 * retryFetch
 *
 * Wraps a single HTTP call with automatic retry logic for transient 5xx errors
 * and network failures.  4xx responses (including 409 move-conflict) are
 * returned immediately — retrying them would not help and could cause harm.
 *
 * @param {string}  url
 * @param {object}  options      - fetch RequestInit (method, headers, body, …)
 * @param {object}  [config]
 * @param {number}  [config.maxRetries=3]
 * @param {number[]}[config.delays=[300,900,2700]]  - ms to wait before each retry
 * @param {Function}[config.fetchFn=fetch]          - injectable for tests
 *
 * @returns {Promise<Response>}  Resolves with the first non-5xx response.
 * @throws  {Error}              After all retries are exhausted.
 */
export async function retryFetch(url, options, {
  maxRetries = 3,
  delays     = [300, 900, 2700],
  fetchFn    = fetch,
} = {}) {
  let lastError

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetchFn(url, options)

      // 2xx or 4xx — return immediately, no retry
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return res
      }

      // 5xx — will retry
      lastError = new Error(`HTTP ${res.status}`)
    } catch (err) {
      // Network-level failure (offline, DNS, timeout) — will retry
      lastError = err
    }

    if (attempt < maxRetries - 1) {
      const delay = delays[attempt] ?? delays[delays.length - 1]
      await new Promise(r => setTimeout(r, delay))
    }
  }

  throw lastError
}
