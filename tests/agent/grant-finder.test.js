import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { createFindGrantsTool, searchGrants } from '../../agent/tools/grant-finder.js';

const SEARCH = {
  errorcode: 0,
  data: {
    oppHits: [
      { id: '111', title: 'Youth Mental Health Grant', agency: 'HHS', closeDate: '08/09/2026' },
      { id: '222', title: 'Rural Food Access', agency: 'USDA', closeDate: '10/01/2026' },
    ],
  },
};
const DETAIL = { data: { synopsis: { awardCeiling: '50000' } } };

/** Fake global fetch: search2 returns SEARCH, fetchOpportunity returns DETAIL. */
function installFakeFetch() {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => (String(url).includes('fetchOpportunity') ? DETAIL : SEARCH),
  });
  return () => {
    globalThis.fetch = original;
  };
}

describe('searchGrants', () => {
  let restore;
  beforeEach(() => {
    restore = installFakeFetch();
  });
  afterEach(() => restore());

  it('returns structured grants alongside the text', async () => {
    const { grants, text } = await searchGrants({ query: 'youth mental health' });

    assert.ok(grants.length >= 1);
    const g = grants[0];
    assert.strictEqual(g.title, 'Youth Mental Health Grant');
    assert.strictEqual(g.agency, 'HHS');
    assert.strictEqual(g.amount, 50000);
    assert.strictEqual(g.deadline, 'Aug 9, 2026');
    assert.strictEqual(g.deadlineIso, '2026-08-09'); // MM/DD/YYYY -> ISO
    assert.ok(g.url.includes('111'));

    // The text is the human-facing list the model still sees.
    assert.ok(text.includes('Youth Mental Health Grant'));
    assert.ok(text.includes('Grants.gov'));
  });

  it('carries the category through to structured results', async () => {
    const { grants } = await searchGrants({ query: 'food', category: 'nutrition' });
    assert.strictEqual(grants[0].category, 'nutrition');
  });

  it('returns an empty list with a helpful message when the API errors', async () => {
    globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
    const { grants, text } = await searchGrants({ query: 'anything' });
    assert.deepStrictEqual(grants, []);
    assert.ok(/couldn't reach|couldn’t reach|try again/i.test(text));
  });
});

describe('per-org grant-category defaulting', () => {
  /** Fake fetch that records each search2 request body so we can assert the filter. */
  function installRecordingFetch() {
    const original = globalThis.fetch;
    /** @type {any[]} */
    const bodies = [];
    globalThis.fetch = async (url, init) => {
      if (!String(url).includes('fetchOpportunity')) bodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => (String(url).includes('fetchOpportunity') ? DETAIL : SEARCH) };
    };
    return { bodies, restore: () => (globalThis.fetch = original) };
  }

  it("applies the org's default category codes (pipe-joined) when the user names no category", async () => {
    const { bodies, restore } = installRecordingFetch();
    try {
      await searchGrants({ query: 'food', defaultCategoryCodes: ['FN', 'ISS'] });
      assert.strictEqual(bodies[0].fundingCategories, 'FN|ISS');
    } finally {
      restore();
    }
  });

  it("lets the user's explicit category override the org defaults", async () => {
    const { bodies, restore } = installRecordingFetch();
    try {
      await searchGrants({ query: 'schools', category: 'education', defaultCategoryCodes: ['FN', 'ISS'] });
      assert.strictEqual(bodies[0].fundingCategories, 'ED');
    } finally {
      restore();
    }
  });

  it('drops an unknown default code and searches unfiltered rather than sending a bad filter', async () => {
    const { bodies, restore } = installRecordingFetch();
    try {
      await searchGrants({ query: 'food', defaultCategoryCodes: ['ZZ'] });
      assert.strictEqual(bodies[0].fundingCategories, undefined);
    } finally {
      restore();
    }
  });

  it('sends no category filter when neither a user category nor org defaults are given', async () => {
    const { bodies, restore } = installRecordingFetch();
    try {
      await searchGrants({ query: 'anything' });
      assert.strictEqual(bodies[0].fundingCategories, undefined);
    } finally {
      restore();
    }
  });
});

describe('createFindGrantsTool passthrough', () => {
  let restore;
  beforeEach(() => {
    restore = installFakeFetch();
  });
  afterEach(() => restore());

  it('invokes onResults with the structured grants while returning the text (the runBenvuAgent capture mechanism)', async () => {
    /** @type {any[]} */
    const collected = [];
    const tool = createFindGrantsTool((grants) => {
      collected.length = 0;
      collected.push(...grants);
    });

    const result = await tool.handler({ query: 'youth mental health' });

    // Structured grants captured out-of-band...
    assert.ok(collected.length >= 1);
    assert.strictEqual(collected[0].title, 'Youth Mental Health Grant');
    // ...and the text the model receives is unchanged.
    assert.strictEqual(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Youth Mental Health Grant'));
  });
});
