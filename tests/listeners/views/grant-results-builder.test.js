import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  buildGrantResults,
  GRANT_TRACK_ACTION,
  grantCardsFor,
  trackValue,
} from '../../../listeners/views/grant-results-builder.js';
import { assertNoEmoji } from '../../helpers/no-emoji.js';

/** A structured grant fixture. */
function grant(overrides = {}) {
  return {
    title: 'Youth Mental Health Grant',
    url: 'https://www.grants.gov/search-results-detail/111',
    agency: 'HHS',
    category: 'health',
    amount: 50000,
    deadline: 'Aug 9, 2026',
    deadlineIso: '2026-08-09',
    ...overrides,
  };
}

describe('buildGrantResults', () => {
  it('renders one card per grant: linked title, amount/deadline fields, agency context', () => {
    const blocks = buildGrantResults([grant()], { language: 'en' });

    const title = blocks.find((b) => b.type === 'section' && b.text);
    assert.ok(title.text.text.includes('<https://www.grants.gov/search-results-detail/111|Youth Mental Health Grant>'));

    const fields = blocks.find((b) => b.type === 'section' && b.fields);
    const fieldText = fields.fields.map((f) => f.text).join('\n');
    assert.ok(fieldText.includes('*Amount*') && fieldText.includes('$50,000'));
    assert.ok(fieldText.includes('*Deadline*') && fieldText.includes('Aug 9, 2026'));

    const ctx = blocks.find((b) => b.type === 'context');
    assert.ok(ctx.elements[0].text.includes('Agency: HHS'));
  });

  it('attaches a Track deadline accessory carrying the title and ISO date', () => {
    const blocks = buildGrantResults([grant()], { language: 'en' });
    const title = blocks.find((b) => b.type === 'section' && b.accessory);
    assert.strictEqual(title.accessory.action_id, GRANT_TRACK_ACTION);
    assert.strictEqual(title.accessory.text.text, 'Track deadline');
    assert.deepStrictEqual(JSON.parse(title.accessory.value), { t: 'Youth Mental Health Grant', d: '2026-08-09' });
  });

  it('omits the Track button when there is no firm ISO date', () => {
    const blocks = buildGrantResults([grant({ deadlineIso: undefined })], { language: 'en' });
    const title = blocks.find((b) => b.type === 'section' && b.text);
    assert.strictEqual(title.accessory, undefined);
  });

  it('localizes the static labels (Spanish)', () => {
    const blocks = buildGrantResults([grant()], { language: 'es' });
    const fields = blocks.find((b) => b.type === 'section' && b.fields);
    const fieldText = fields.fields.map((f) => f.text).join('\n');
    assert.ok(fieldText.includes('*Monto*'));
    assert.ok(fieldText.includes('*Fecha límite*'));
    const title = blocks.find((b) => b.type === 'section' && b.accessory);
    assert.strictEqual(title.accessory.text.text, 'Seguir plazo');
    const ctx = blocks.find((b) => b.type === 'context');
    assert.ok(ctx.elements[0].text.includes('Agencia: HHS'));
  });

  it('caps at the limit and shows a localized "+N more" note when truncated', () => {
    const many = Array.from({ length: 8 }, (_, i) => grant({ title: `Grant ${i}`, url: `https://x/${i}` }));
    const blocks = buildGrantResults(many, { language: 'en', limit: 5 });
    const cards = blocks.filter((b) => b.type === 'section' && b.text && !b.fields);
    assert.strictEqual(cards.length, 5);
    const footer = blocks.at(-1);
    assert.strictEqual(footer.type, 'context');
    assert.ok(footer.elements[0].text.includes('+3 more'));
  });

  it('has no emoji', () => {
    assertNoEmoji(buildGrantResults([grant(), grant({ title: 'Another' })], { language: 'fr' }));
  });
});

describe('trackValue', () => {
  it('truncates very long titles to fit the button value limit', () => {
    const v = JSON.parse(trackValue(grant({ title: 'x'.repeat(500) })));
    assert.ok(v.t.length <= 181);
  });
});

describe('grantCardsFor', () => {
  it('returns [] when there are no grants', () => {
    assert.deepStrictEqual(grantCardsFor([], 'anything'), []);
    assert.deepStrictEqual(grantCardsFor(undefined, 'anything'), []);
  });

  it('localizes from the user text language', () => {
    const blocks = grantCardsFor([grant()], 'necesito subvenciones para jóvenes');
    const title = blocks.find((b) => b.type === 'section' && b.accessory);
    assert.strictEqual(title.accessory.text.text, 'Seguir plazo');
  });
});
