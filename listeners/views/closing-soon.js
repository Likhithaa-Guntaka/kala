/**
 * Best-effort "grants closing soon" count for the App Home tab.
 *
 * This is a purely informational nicety, so it is built to fail silently: it
 * self-times-out, swallows every error, and returns null (meaning "omit the
 * line") rather than ever throwing or delaying the Home render. Counts are
 * cached briefly per category set so repeatedly opening Home doesn't hammer
 * Grants.gov.
 */

const SEARCH_URL = 'https://api.grants.gov/v1/api/search2';

/** How long to trust a fetched count before refetching. */
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
/** Shorter TTL for a failed/omitted result, so an outage recovers quickly. */
const FAIL_TTL_MS = 60 * 1000; // 1 minute
/** Max time to wait on Grants.gov before giving up and omitting the line. */
const DEFAULT_TIMEOUT_MS = 2500;
const DAY_MS = 86_400_000;

/** @type {Map<string, { count: number | null, expires: number }>} */
const cache = new Map();

/**
 * Whether a Grants.gov "MM/DD/YYYY" close date falls within [now, now+window].
 * @param {string} closeDate
 * @param {number} now - epoch ms
 * @param {number} cutoff - epoch ms
 * @returns {boolean}
 */
function closesWithin(closeDate, now, cutoff) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(closeDate || '');
  if (!m) return false;
  const t = new Date(`${m[3]}-${m[1]}-${m[2]}T00:00:00`).getTime();
  return Number.isFinite(t) && t >= now && t <= cutoff;
}

/**
 * One lightweight search2 call (no per-opportunity detail fetches), counting how
 * many open opportunities in the given categories close within `days`. Aborts at
 * `timeoutMs`. Throws on any network/API/timeout error.
 * @param {string[]} codes
 * @param {number} days
 * @param {number} now
 * @param {number} timeoutMs
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<number>}
 */
async function fetchClosingCount(codes, days, now, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: '', oppStatuses: 'posted', rows: 100, fundingCategories: codes.join('|') }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json?.errorcode !== 0) throw new Error('search failed');
    const hits = json?.data?.oppHits ?? [];
    const cutoff = now + days * DAY_MS;
    return hits.filter((/** @type {any} */ h) => closesWithin(h.closeDate, now, cutoff)).length;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Count open grants in `categoryCodes` closing within `days`, cached and
 * fail-safe. Returns null on no categories, timeout, or any error — the caller
 * treats null as "omit the line".
 * @param {string[] | undefined} categoryCodes
 * @param {Object} [opts]
 * @param {number} [opts.days] - Window in days (default 30).
 * @param {number} [opts.timeoutMs] - Abort after this long (default 2500).
 * @param {number} [opts.now] - Injected clock (epoch ms) for testing.
 * @param {typeof fetch} [opts.fetchImpl] - Injected fetch for testing.
 * @returns {Promise<number | null>}
 */
export async function countClosingSoon(categoryCodes, opts = {}) {
  const { days = 30, timeoutMs = DEFAULT_TIMEOUT_MS, now = Date.now(), fetchImpl = fetch } = opts;
  if (!Array.isArray(categoryCodes) || categoryCodes.length === 0) return null;

  const key = categoryCodes.join('|');
  const cached = cache.get(key);
  if (cached && cached.expires > now) return cached.count;

  /** @type {number | null} */
  let count = null;
  try {
    // Belt-and-suspenders timeout: the AbortController stops the real fetch, and
    // this race catches a fetch mock that ignores the abort signal.
    count = await Promise.race([
      fetchClosingCount(categoryCodes, days, now, timeoutMs, fetchImpl),
      new Promise((_, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), timeoutMs);
        if (typeof t.unref === 'function') t.unref();
      }),
    ]);
  } catch {
    count = null;
  }

  cache.set(key, { count, expires: now + (count === null ? FAIL_TTL_MS : CACHE_TTL_MS) });
  return count;
}

/** Clear the count cache. Test helper. @returns {void} */
export function _resetClosingSoonCache() {
  cache.clear();
}
