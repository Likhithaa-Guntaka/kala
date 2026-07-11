import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { _resetClosingSoonCache, countClosingSoon } from '../../../listeners/views/closing-soon.js';

// A fixed "now" so close-date math is deterministic: 2026-07-10.
const NOW = new Date('2026-07-10T00:00:00').getTime();

/** A search2 response whose hits close on the given MM/DD/YYYY dates. */
function searchResponse(dates) {
  return {
    ok: true,
    json: async () => ({ errorcode: 0, data: { oppHits: dates.map((closeDate) => ({ closeDate })) } }),
  };
}

describe('countClosingSoon', () => {
  beforeEach(() => _resetClosingSoonCache());

  it('returns null when there are no categories (line omitted)', async () => {
    assert.strictEqual(await countClosingSoon(undefined, { now: NOW }), null);
    assert.strictEqual(await countClosingSoon([], { now: NOW }), null);
  });

  it('counts only opportunities closing within the window', async () => {
    // Within 30 days of 2026-07-10 (cutoff 2026-08-09): the first two. The third
    // is far off; the fourth is already past.
    const fetchImpl = mock.fn(async () => searchResponse(['07/20/2026', '08/01/2026', '12/01/2026', '06/01/2026']));
    const count = await countClosingSoon(['FN', 'ISS'], { now: NOW, fetchImpl });
    assert.strictEqual(count, 2);
    // The category codes are sent pipe-joined as the funding filter.
    const body = JSON.parse(fetchImpl.mock.calls[0].arguments[1].body);
    assert.strictEqual(body.fundingCategories, 'FN|ISS');
  });

  it('returns null when the API errors (network throw)', async () => {
    const fetchImpl = mock.fn(async () => {
      throw new Error('network down');
    });
    assert.strictEqual(await countClosingSoon(['AR'], { now: NOW, fetchImpl }), null);
  });

  it('returns null on a non-OK response or an API error code', async () => {
    assert.strictEqual(await countClosingSoon(['AR'], { now: NOW, fetchImpl: async () => ({ ok: false }) }), null);
    _resetClosingSoonCache();
    const apiErr = async () => ({ ok: true, json: async () => ({ errorcode: 1, msg: 'bad' }) });
    assert.strictEqual(await countClosingSoon(['AR'], { now: NOW, fetchImpl: apiErr }), null);
  });

  it('returns null when the fetch exceeds the timeout (never delays Home)', async () => {
    // A fetch that hangs until aborted — the timeout must abort it and yield null.
    const hangFetch = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const count = await countClosingSoon(['HL'], { now: NOW, timeoutMs: 40, fetchImpl: hangFetch });
    assert.strictEqual(count, null);
  });

  it('caches a successful count so repeated Home opens do not refetch', async () => {
    const fetchImpl = mock.fn(async () => searchResponse(['07/20/2026']));
    const first = await countClosingSoon(['ED'], { now: NOW, fetchImpl });
    const second = await countClosingSoon(['ED'], { now: NOW + 1000, fetchImpl });
    assert.strictEqual(first, 1);
    assert.strictEqual(second, 1);
    assert.strictEqual(fetchImpl.mock.callCount(), 1, 'second call served from cache');
  });
});
