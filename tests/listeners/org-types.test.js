import assert from 'node:assert';
import { describe, it } from 'node:test';

import { getOrgTypeById, ORG_TYPES } from '../../listeners/org-types.js';

describe('ORG_TYPES', () => {
  it('has exactly six types', () => {
    assert.strictEqual(ORG_TYPES.length, 6);
  });

  it('each type has an id, emoji, label, primary actions, and tailored prompts', () => {
    for (const t of ORG_TYPES) {
      assert.ok(typeof t.id === 'string' && t.id.length > 0);
      assert.ok(typeof t.emoji === 'string' && t.emoji.length > 0);
      assert.ok(typeof t.label === 'string' && t.label.length > 0);
      assert.ok(Array.isArray(t.primaryActions) && t.primaryActions.length > 0);
      assert.ok(Array.isArray(t.tailoredPrompts) && t.tailoredPrompts.length > 0);
      // No more than 4, since suggested prompts are capped at Slack's limit.
      assert.ok(t.tailoredPrompts.length <= 4);
      for (const p of t.tailoredPrompts) assert.ok(typeof p === 'string' && p.length > 0);
    }
  });

  it('has unique ids', () => {
    const ids = ORG_TYPES.map((t) => t.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('deeply-tailored types carry valid Grants.gov category codes and a flagship', () => {
    // Codes Grants.gov's live facet reports; guards against a typo'd default code.
    const VALID = new Set(['FN', 'ISS', 'HL', 'HO', 'ED', 'AR', 'HU', 'CD', 'ELT']);
    for (const t of ORG_TYPES) {
      if (t.defaultGrantCategories) {
        assert.ok(t.defaultGrantCategories.length > 0);
        for (const code of t.defaultGrantCategories) assert.ok(VALID.has(code), `unexpected code ${code} on ${t.id}`);
      }
      if (t.flagship) assert.ok(typeof t.flagship.kind === 'string');
    }
  });

  it('Food Bank is fully tailored across all four dimensions', () => {
    const fb = getOrgTypeById('food_bank');
    assert.deepStrictEqual(fb?.defaultGrantCategories, ['FN', 'ISS']);
    assert.ok(fb.tailoredPrompts.length > 0);
    assert.ok((fb.rtsPrompts?.length ?? 0) > 0);
    assert.strictEqual(fb.flagship?.kind, 'seed_deadlines');
    assert.ok(fb.flagship.kind === 'seed_deadlines' && fb.flagship.deadlines.some((d) => d.rule === 'irs990'));
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
