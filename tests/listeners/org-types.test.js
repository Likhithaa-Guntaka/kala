import assert from 'node:assert';
import { describe, it } from 'node:test';

import { getOrgTypeById, ORG_TYPES } from '../../listeners/org-types.js';

describe('ORG_TYPES', () => {
  it('has exactly six types', () => {
    assert.strictEqual(ORG_TYPES.length, 6);
  });

  it('each type has an id, emoji, label, and three prompts', () => {
    for (const t of ORG_TYPES) {
      assert.ok(typeof t.id === 'string' && t.id.length > 0);
      assert.ok(typeof t.emoji === 'string' && t.emoji.length > 0);
      assert.ok(typeof t.label === 'string' && t.label.length > 0);
      assert.strictEqual(t.prompts.length, 3);
      for (const p of t.prompts) assert.ok(typeof p === 'string' && p.length > 0);
    }
  });

  it('has unique ids', () => {
    const ids = ORG_TYPES.map((t) => t.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });
});

describe('getOrgTypeById', () => {
  it('finds a known type', () => {
    assert.strictEqual(getOrgTypeById('education')?.label, 'Education / Youth Programs');
  });

  it('returns undefined for unknown or nullish ids', () => {
    assert.strictEqual(getOrgTypeById('nope'), undefined);
    assert.strictEqual(getOrgTypeById(null), undefined);
    assert.strictEqual(getOrgTypeById(undefined), undefined);
  });
});
