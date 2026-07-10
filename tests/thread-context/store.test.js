import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import { SessionStore } from '../../thread-context/store.js';

describe('SessionStore', () => {
  let store;

  beforeEach(() => {
    store = new SessionStore();
  });

  it('stores and retrieves a session', () => {
    store.setSession('C1', 'T1', 'sid-abc');
    assert.strictEqual(store.getSession('C1', 'T1'), 'sid-abc');
  });

  it('returns null for missing key', () => {
    assert.strictEqual(store.getSession('C1', 'T99'), null);
  });

  it('keeps different threads independent', () => {
    store.setSession('C1', 'T1', 'sid-1');
    store.setSession('C1', 'T2', 'sid-2');
    assert.strictEqual(store.getSession('C1', 'T1'), 'sid-1');
    assert.strictEqual(store.getSession('C1', 'T2'), 'sid-2');
  });

  it('expires entries after TTL', async () => {
    const shortStore = new SessionStore(0);
    shortStore.setSession('C1', 'T1', 'sid-abc');
    // Need a tiny delay to ensure Date.now() advances past the stored timestamp
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.strictEqual(shortStore.getSession('C1', 'T1'), null);
  });

  it('evicts oldest entries when max is exceeded', () => {
    const smallStore = new SessionStore(86400, 2);
    smallStore.setSession('C1', 'T1', 'sid-1');
    smallStore.setSession('C1', 'T2', 'sid-2');
    smallStore.setSession('C1', 'T3', 'sid-3');
    assert.strictEqual(smallStore.getSession('C1', 'T1'), null);
    assert.strictEqual(smallStore.getSession('C1', 'T2'), 'sid-2');
    assert.strictEqual(smallStore.getSession('C1', 'T3'), 'sid-3');
  });

  it('overwrites existing key', () => {
    store.setSession('C1', 'T1', 'sid-old');
    store.setSession('C1', 'T1', 'sid-new');
    assert.strictEqual(store.getSession('C1', 'T1'), 'sid-new');
  });

  describe('org type', () => {
    it('stores and retrieves a user org type', () => {
      store.setOrgType('U1', 'education');
      assert.strictEqual(store.getOrgType('U1'), 'education');
    });

    it('returns null when no org type is set', () => {
      assert.strictEqual(store.getOrgType('U404'), null);
    });

    it('overwrites an existing org type', () => {
      store.setOrgType('U1', 'food_bank');
      store.setOrgType('U1', 'arts_culture');
      assert.strictEqual(store.getOrgType('U1'), 'arts_culture');
    });

    it('clears an org type', () => {
      store.setOrgType('U1', 'general');
      store.clearOrgType('U1');
      assert.strictEqual(store.getOrgType('U1'), null);
    });

    it('does not expire org types on TTL (they are durable preferences)', async () => {
      const shortStore = new SessionStore(0);
      shortStore.setOrgType('U1', 'education');
      await new Promise((resolve) => setTimeout(resolve, 5));
      assert.strictEqual(shortStore.getOrgType('U1'), 'education');
    });

    it('exports and re-imports org types (persistence round-trip)', () => {
      store.setOrgType('U1', 'education');
      store.setOrgType('U2', 'food_bank');
      const snapshot = store.exportOrgTypes();
      assert.deepStrictEqual(snapshot, { U1: 'education', U2: 'food_bank' });

      const fresh = new SessionStore();
      fresh.importOrgTypes(snapshot);
      assert.strictEqual(fresh.getOrgType('U1'), 'education');
      assert.strictEqual(fresh.getOrgType('U2'), 'food_bank');
    });

    it('invokes the change callback on set and clear', () => {
      let calls = 0;
      const s = new SessionStore(86400, 1000, () => {
        calls++;
      });
      s.setOrgType('U1', 'general');
      s.clearOrgType('U1');
      assert.strictEqual(calls, 2);
    });
  });

  describe('onboarding flag', () => {
    it('defaults to not onboarded, and marks idempotently', () => {
      assert.strictEqual(store.hasOnboarded('U1'), false);
      store.markOnboarded('U1');
      store.markOnboarded('U1');
      assert.strictEqual(store.hasOnboarded('U1'), true);
    });

    it('survives clearOrgType — the whole point of a separate store', () => {
      store.setOrgType('U1', 'food_bank');
      store.markOnboarded('U1');
      store.clearOrgType('U1');
      // Org type is gone (picker will show), but they are still onboarded.
      assert.strictEqual(store.getOrgType('U1'), null);
      assert.strictEqual(store.hasOnboarded('U1'), true);
    });

    it('setOrgType alone does not mark onboarded (only the DM path does)', () => {
      store.setOrgType('U1', 'education');
      assert.strictEqual(store.hasOnboarded('U1'), false);
    });

    it('importing persisted org types marks those users onboarded (survives restart)', () => {
      const fresh = new SessionStore();
      fresh.importOrgTypes({ U1: 'education', U2: 'food_bank' });
      assert.strictEqual(fresh.hasOnboarded('U1'), true);
      assert.strictEqual(fresh.hasOnboarded('U2'), true);
      assert.strictEqual(fresh.hasOnboarded('U3'), false);
    });
  });

  describe('onboarding message ref', () => {
    it('defaults to null and round-trips a stored ref', () => {
      assert.strictEqual(store.getOnboardingMessageRef('U1'), null);
      store.setOnboardingMessageRef('U1', { channel: 'D1', ts: '100' });
      assert.deepStrictEqual(store.getOnboardingMessageRef('U1'), { channel: 'D1', ts: '100' });
    });

    it('overwrites the ref when re-pointed to a newer message', () => {
      store.setOnboardingMessageRef('U1', { channel: 'D1', ts: '100' });
      store.setOnboardingMessageRef('U1', { channel: 'D1', ts: '200' });
      assert.deepStrictEqual(store.getOnboardingMessageRef('U1'), { channel: 'D1', ts: '200' });
    });
  });
});
