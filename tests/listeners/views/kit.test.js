import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  actions,
  button,
  context,
  divider,
  header,
  LIMITS,
  plain,
  section,
  sectionFields,
  splitSections,
  truncate,
} from '../../../listeners/views/kit.js';

describe('kit primitives', () => {
  it('truncate cuts to max with an ellipsis', () => {
    assert.strictEqual(truncate('hello', 10), 'hello');
    const t = truncate('x'.repeat(50), 10);
    assert.strictEqual(t.length, 10);
    assert.ok(t.endsWith('…'));
  });

  it('header is a header block capped at the header limit', () => {
    const h = header('Kala');
    assert.strictEqual(h.type, 'header');
    assert.strictEqual(h.text.type, 'plain_text');
    assert.strictEqual(h.text.text, 'Kala');
    assert.ok(header('y'.repeat(300)).text.text.length <= LIMITS.headerText);
  });

  it('plain disables emoji parsing', () => {
    assert.strictEqual(plain('hi').emoji, false);
  });

  it('section is an mrkdwn section, with optional accessory', () => {
    const s = section('body text');
    assert.strictEqual(s.type, 'section');
    assert.strictEqual(s.text.type, 'mrkdwn');
    assert.strictEqual(s.accessory, undefined);

    const withBtn = section('body', button({ text: 'Go', actionId: 'go' }));
    assert.strictEqual(withBtn.accessory.type, 'button');
  });

  it('section text is capped at the section limit', () => {
    assert.ok(section('z'.repeat(4000)).text.text.length <= LIMITS.sectionText);
  });

  it('sectionFields renders label/value pairs and caps at 10', () => {
    const s = sectionFields([
      ['Amount', '$50,000'],
      ['Deadline', 'Aug 9, 2026'],
    ]);
    assert.strictEqual(s.fields.length, 2);
    assert.ok(s.fields[0].text.includes('*Amount*'));
    assert.ok(s.fields[0].text.includes('$50,000'));

    const many = sectionFields(Array.from({ length: 20 }, (_, i) => [`k${i}`, `v${i}`]));
    assert.strictEqual(many.fields.length, LIMITS.fieldsPerSection);
  });

  it('divider and context build the expected blocks', () => {
    assert.deepStrictEqual(divider(), { type: 'divider' });
    const c = context('one', 'two');
    assert.strictEqual(c.type, 'context');
    assert.strictEqual(c.elements.length, 2);
    assert.strictEqual(c.elements[0].type, 'mrkdwn');
  });

  it('button caps text at 75, carries value/style/url only when set', () => {
    const b = button({ text: 'Track deadline', actionId: 'track', value: 'v', style: 'primary' });
    assert.strictEqual(b.type, 'button');
    assert.strictEqual(b.action_id, 'track');
    assert.strictEqual(b.value, 'v');
    assert.strictEqual(b.style, 'primary');
    assert.strictEqual(b.url, undefined);
    assert.ok(button({ text: 'x'.repeat(200), actionId: 'a' }).text.text.length <= LIMITS.buttonText);

    const bare = button({ text: 'Plain', actionId: 'a' });
    assert.strictEqual(bare.value, undefined);
    assert.strictEqual(bare.style, undefined);
  });

  it('actions caps elements at 10', () => {
    const els = Array.from({ length: 15 }, (_, i) => button({ text: `b${i}`, actionId: `a${i}` }));
    const a = actions('grid', els);
    assert.strictEqual(a.type, 'actions');
    assert.strictEqual(a.block_id, 'grid');
    assert.strictEqual(a.elements.length, LIMITS.elementsPerActions);
  });

  it('splitSections keeps each section under the limit and preserves all text', () => {
    const long = 'a'.repeat(7000);
    const parts = splitSections(long);
    assert.ok(parts.length >= 3);
    for (const p of parts) assert.ok(p.text.text.length <= LIMITS.sectionText);
    assert.strictEqual(parts.map((p) => p.text.text).join(''), long);
  });

  it('splitSections always returns at least one section for empty text', () => {
    assert.strictEqual(splitSections('').length, 1);
  });
});
