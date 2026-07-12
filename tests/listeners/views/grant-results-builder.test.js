import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  buildGrantResults,
  GRANT_TRACK_ACTION,
  GRANT_VIEW_ACTION,
  grantCardsFor,
  trackValue,
} from '../../../listeners/views/grant-results-builder.js';
import { assertNoEmoji } from '../../helpers/no-emoji.js';

/** The fields of a card as a flat list of "label|value" strings. @param {any[]} blocks */
function fieldPairs(blocks) {
  const f = blocks.find((b) => b.type === 'section' && b.fields);
  return f ? f.fields.map((cell) => cell.text) : [];
}

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
  it('renders a linked title and a 2x2 fields grid (Amount|Deadline / Agency|Category)', () => {
    const blocks = buildGrantResults([grant()], { language: 'en' });

    const title = blocks.find((b) => b.type === 'section' && b.text);
    assert.ok(title.text.text.includes('<https://www.grants.gov/search-results-detail/111|Youth Mental Health Grant>'));

    // Exactly four field cells, in reading order: Amount, Deadline, Agency, Category.
    const pairs = fieldPairs(blocks);
    assert.strictEqual(pairs.length, 4);
    assert.strictEqual(pairs[0], '*Amount*\n$50,000');
    assert.strictEqual(pairs[1], '*Deadline*\nAug 9, 2026');
    assert.strictEqual(pairs[2], '*Agency*\nHHS');
    assert.strictEqual(pairs[3], '*Category*\nhealth');

    // Agency/category no longer live in a context line — the only context block
    // is the source footer.
    const contexts = blocks.filter((b) => b.type === 'context');
    assert.strictEqual(contexts.length, 1);
    assert.ok(contexts[0].elements[0].text.includes('Grants.gov'));
    assert.ok(!contexts[0].elements[0].text.includes('Agency'));
  });

  it('gracefully drops the Category cell when category is absent (Agency stands alone)', () => {
    const pairs = fieldPairs(buildGrantResults([grant({ category: undefined })], { language: 'en' }));
    assert.strictEqual(pairs.length, 3);
    assert.deepStrictEqual(pairs, ['*Amount*\n$50,000', '*Deadline*\nAug 9, 2026', '*Agency*\nHHS']);
    // No blank/empty Category cell leaked in.
    assert.ok(!pairs.some((p) => p.includes('*Category*')));
  });

  it('attaches a Track deadline accessory carrying the title and ISO date', () => {
    const blocks = buildGrantResults([grant()], { language: 'en' });
    const title = blocks.find((b) => b.type === 'section' && b.accessory);
    assert.strictEqual(title.accessory.action_id, GRANT_TRACK_ACTION);
    assert.strictEqual(title.accessory.text.text, 'Track deadline');
    assert.deepStrictEqual(JSON.parse(title.accessory.value), { t: 'Youth Mental Health Grant', d: '2026-08-09' });
  });

  it('falls back to a "View opportunity" URL button when there is no ISO date but a url', () => {
    const blocks = buildGrantResults([grant({ deadlineIso: undefined })], { language: 'en' });
    const title = blocks.find((b) => b.type === 'section' && b.text);
    assert.ok(title.accessory, 'has a fallback accessory');
    assert.strictEqual(title.accessory.action_id, GRANT_VIEW_ACTION);
    assert.strictEqual(title.accessory.text.text, 'View opportunity');
    assert.strictEqual(title.accessory.url, 'https://www.grants.gov/search-results-detail/111');
    assert.strictEqual(title.accessory.style, undefined, 'default style');
    assert.strictEqual(title.accessory.value, undefined, 'URL button carries no value');
  });

  it('has no accessory when there is neither an ISO date nor a url', () => {
    const blocks = buildGrantResults([grant({ deadlineIso: undefined, url: undefined })], { language: 'en' });
    const title = blocks.find((b) => b.type === 'section' && b.text);
    assert.strictEqual(title.accessory, undefined);
  });

  it('localizes the fields, the Track button, and the View opportunity button (Spanish/French)', () => {
    const es = buildGrantResults([grant()], { language: 'es' });
    const esPairs = fieldPairs(es);
    assert.ok(esPairs[0].includes('*Monto*'));
    assert.ok(esPairs[1].includes('*Fecha límite*'));
    assert.ok(esPairs[2].includes('*Agencia*\nHHS'));
    assert.ok(esPairs[3].includes('*Categoría*'));
    assert.strictEqual(es.find((b) => b.accessory).accessory.text.text, 'Seguir plazo');

    // The fallback button is localized too.
    const fr = buildGrantResults([grant({ deadlineIso: undefined })], { language: 'fr' });
    assert.strictEqual(fr.find((b) => b.accessory).accessory.text.text, 'Voir l’offre');
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

  it('has no emoji (Track button, View opportunity fallback, and no-accessory cards)', () => {
    for (const language of ['en', 'es', 'fr', 'de', 'pt', 'it']) {
      assertNoEmoji(
        buildGrantResults(
          [
            grant(), // Track deadline button
            grant({ title: 'No date', deadlineIso: undefined }), // View opportunity fallback
            grant({ title: 'Bare', deadlineIso: undefined, url: undefined, category: undefined }), // no accessory
          ],
          { language },
        ),
      );
    }
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
