// One place that makes an outbound portal request. Realistic browser headers, a
// timeout, and fail-soft (returns null on any non-OK / error) so a blocked or
// slow source degrades instead of throwing. Injectable fetchFn for tests.

import { USER_AGENT, RUN_LIMITS } from '../config.js'

export async function fetchHtml(url, { fetchFn = fetch, timeoutMs = RUN_LIMITS.fetchTimeoutMs, headers = {} } = {}) {
  if (!url) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetchFn(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        ...headers,
      },
    })
    if (!res.ok) {
      console.warn(`fetchHtml ${url} → HTTP ${res.status}`)
      return null
    }
    return await res.text()
  } catch (e) {
    console.warn(`fetchHtml ${url} failed: ${e.message}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
