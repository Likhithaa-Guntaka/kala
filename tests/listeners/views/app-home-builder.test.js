import assert from 'node:assert';
import { describe, it } from 'node:test';

import { ARTS_CULTURE } from '../../../listeners/arts-culture.js';
import {
  buildAppHomeView,
  CATEGORIES,
  DESCRIPTION,
  greeting,
  TAGLINE,
} from '../../../listeners/views/app-home-builder.js';
import { assertNoEmoji } from '../../helpers/no-emoji.js';

/** @param {any} view @param {string} id */
function block(view, id) {
  return view.blocks.find((b) => b.block_id === id);
}
/** @param {any} view @param {string} type */
function blocksOfType(view, type) {
  return view.blocks.filter((b) => b.type === type);
}
/** The action buttons on the home: one accessory per card section. @param {any} view */
function cardButtons(view) {
  return blocksOfType(view, 'section')
    .filter((b) => b.accessory?.type === 'button')
    .map((b) => b.accessory);
}

const homeOpts = { firstName: 'A', now: new Date('2026-07-10T09:00:00') };

describe('buildAppHomeView', () => {
  it('greets as an arts and culture assistant from the first screen — no picker step', () => {
    const view = buildAppHomeView(null, homeOpts);
    assert.strictEqual(view.type, 'home');
    // No org-type picker anywhere.
    assert.ok(!view.blocks.some((b) => String(b.block_id || '').startsWith('org_type_select')), 'no picker');
    // The arts action grid renders immediately.
    assert.ok(block(view, 'quick_actions_1'), 'action grid present on first screen');
    assert.ok(block(view, 'home_tailored_prompts'), 'tailored prompt row present');
  });

  it('never contains emoji', () => {
    assertNoEmoji(buildAppHomeView(null, homeOpts));
  });

  describe('branded header', () => {
    it('leads with the arts-focused Kala name, tagline, and description, then a divider', () => {
      const blocks = buildAppHomeView(null, homeOpts).blocks;
      assert.strictEqual(blocks[0].type, 'header');
      assert.strictEqual(blocks[0].text.text, 'Kala');
      assert.strictEqual(blocks[1].text.text, TAGLINE);
      assert.strictEqual(blocks[2].text.text, DESCRIPTION);
      assert.strictEqual(blocks[3].type, 'divider');
      // The header names the arts and culture focus.
      assert.match(DESCRIPTION, /arts and culture nonprofits/i);
    });

    it('has exactly one header block, and it is the brand name (greeting is a section)', () => {
      const headers = blocksOfType(buildAppHomeView(null, homeOpts), 'header');
      assert.strictEqual(headers.length, 1);
      assert.strictEqual(headers[0].text.text, 'Kala');
    });
  });

  describe('personalized body', () => {
    const greetingText = (view) =>
      view.blocks.find((b) => b.type === 'section' && /^\*Good (morning|afternoon|evening)/.test(b.text?.text || ''))
        ?.text.text;

    it('greets the user by name and time of day in a bold section, below the Kala header', () => {
      const view = buildAppHomeView(null, { firstName: 'Dedeepya', now: new Date('2026-07-10T14:30:00') });
      assert.strictEqual(view.blocks.find((b) => b.type === 'header').text.text, 'Kala');
      assert.strictEqual(greetingText(view), '*Good afternoon, Dedeepya!*');
    });

    it('falls back to a neutral greeting when the name is missing', () => {
      const view = buildAppHomeView(null, { now: new Date('2026-07-10T20:00:00') });
      assert.strictEqual(greetingText(view), '*Good evening!*');
    });

    it('renders each action as a card: bold title, description, one button accessory', () => {
      const view = buildAppHomeView(null, homeOpts);
      const cards = blocksOfType(view, 'section').filter((b) => b.accessory?.type === 'button');
      assert.strictEqual(cards.length, CATEGORIES.length);
      for (const card of cards) {
        assert.match(card.text.text, /^\*[^*]+\*\n.+/s);
        assert.ok(card.accessory.action_id.startsWith('category_'));
      }
    });

    it('styles exactly one button primary — the #1 arts action — and none danger', () => {
      const view = buildAppHomeView(null, homeOpts);
      const buttons = cardButtons(view);
      assert.strictEqual(buttons.length, CATEGORIES.length);
      assert.strictEqual(buttons.filter((b) => b.style === 'primary').length, 1);
      assert.strictEqual(buttons[0].style, 'primary');
      assert.ok(!buttons.some((b) => b.style === 'danger'));
      assert.ok(block(view, 'quick_actions_1'), 'leading card is addressable');
      assert.strictEqual(block(view, 'quick_actions_1').accessory.style, 'primary');
    });

    it('orders the arts and culture primary actions first', () => {
      const view = buildAppHomeView(null, homeOpts);
      const buttons = cardButtons(view);
      assert.deepStrictEqual(
        buttons.slice(0, ARTS_CULTURE.primaryActions.length).map((b) => b.action_id),
        ARTS_CULTURE.primaryActions,
      );
    });

    it('renders the arts tailored and RTS prompt rows as prompt_run_ buttons', () => {
      const view = buildAppHomeView(null, homeOpts);
      const tailored = block(view, 'home_tailored_prompts');
      const rts = block(view, 'home_rts_prompts');
      assert.ok(tailored && rts, 'both prompt rows present');
      assert.strictEqual(tailored.elements.length, ARTS_CULTURE.tailoredPrompts.length);
      assert.strictEqual(rts.elements.length, ARTS_CULTURE.rtsPrompts.length);
      const all = [...tailored.elements, ...rts.elements];
      for (const el of all) {
        assert.ok(el.action_id.startsWith('prompt_run_'));
        assert.ok(typeof el.value === 'string' && el.value.length > 0);
      }
      // Action_ids stay unique across the two rows (RTS offset past the tailored ones).
      const ids = all.map((e) => e.action_id);
      assert.strictEqual(new Set(ids).size, ids.length);
    });

    it('groups cards with dividers between them, not after every element', () => {
      const dividers = blocksOfType(buildAppHomeView(null, homeOpts), 'divider').length;
      // brand-header rule + post-greeting rule + tailored-prompt rule + footer rule
      // (4), plus one divider between each pair of the CATEGORIES cards (N-1).
      assert.strictEqual(dividers, CATEGORIES.length + 3, `expected grouping dividers, got ${dividers}`);
    });
  });

  describe('closing-soon line', () => {
    const opts = (closingSoon) => ({ firstName: 'A', now: new Date('2026-07-10T09:00:00'), closingSoon });

    it('renders one plain context line when a positive count is provided', () => {
      const view = buildAppHomeView(null, opts({ count: 5, label: 'arts and culture' }));
      const line = blocksOfType(view, 'context').find((b) => /closing in the next 30 days/.test(b.elements[0].text));
      assert.ok(line, 'closing-soon context line present');
      assert.match(line.elements[0].text, /5 arts and culture grants closing in the next 30 days\./);
      assert.strictEqual(line.type, 'context');
      assertNoEmoji(view);
    });

    it('singularizes for a count of one', () => {
      const view = buildAppHomeView(null, opts({ count: 1, label: 'arts and culture' }));
      const line = blocksOfType(view, 'context').find((b) => /closing in the next 30 days/.test(b.elements[0].text));
      assert.match(line.elements[0].text, /1 arts and culture grant closing/);
    });

    it('omits the line when the count is null (API slow/down/failed)', () => {
      const view = buildAppHomeView(null, opts(null));
      const has = blocksOfType(view, 'context').some((b) => /closing in the next 30 days/.test(b.elements[0].text));
      assert.strictEqual(has, false);
    });

    it('omits the line when the count is zero (nothing closing soon)', () => {
      const view = buildAppHomeView(null, opts({ count: 0, label: 'arts and culture' }));
      const has = blocksOfType(view, 'context').some((b) => /closing in the next 30 days/.test(b.elements[0].text));
      assert.strictEqual(has, false);
    });
  });

  describe('notice banner', () => {
    it('shows a transient notice below the brand header and above the tailored rows', () => {
      const notice = 'Sent to your messages, open the Messages tab.';
      const view = buildAppHomeView(null, { firstName: 'A', now: new Date('2026-07-10T09:00:00'), notice });
      const noticeIdx = view.blocks.findIndex((b) => b.type === 'section' && b.text?.text === notice);
      const taglineIdx = view.blocks.findIndex((b) => b.type === 'section' && b.text?.text === TAGLINE);
      const tailoredIdx = view.blocks.findIndex((b) => b.block_id === 'home_tailored_prompts');
      assert.ok(noticeIdx >= 0, 'notice banner is present');
      assert.ok(taglineIdx >= 0 && taglineIdx < noticeIdx, 'notice sits below the stable brand header');
      assert.ok(noticeIdx < tailoredIdx, 'notice sits above the tailored prompt rows');
      assertNoEmoji(view);
    });

    it('omits the notice banner when none is passed (auto-clears on refresh)', () => {
      const view = buildAppHomeView(null, homeOpts);
      assert.ok(!view.blocks.some((b) => b.type === 'section' && /messages tab/i.test(b.text?.text || '')));
    });
  });

  describe('footer', () => {
    it('recedes into one light context line naming the arts focus and how to reach Kala — no change-org button', () => {
      const view = buildAppHomeView(null, homeOpts);
      const contexts = blocksOfType(view, 'context');
      const footer = contexts[contexts.length - 1];
      const texts = footer.elements.map((e) => e.text);
      assert.ok(texts.some((t) => t.includes(ARTS_CULTURE.label)));
      assert.ok(texts.some((t) => /direct message/i.test(t) && /mention/i.test(t)));
      // The removed multi-org controls must be gone.
      assert.ok(!block(view, 'org_settings'), 'no change-organization control');
      assert.ok(!view.blocks.some((b) => String(b.block_id || '').startsWith('org_type_select')), 'no picker');
    });
  });
});

describe('CATEGORIES', () => {
  it('includes the operational-tracker cards, each with card copy that fits Slack limits', () => {
    assert.strictEqual(CATEGORIES.length, 9);
    assert.ok(
      CATEGORIES.some((c) => c.actionId === 'category_track_engagement'),
      'engagement card present',
    );
    assert.ok(
      CATEGORIES.some((c) => c.actionId === 'category_track_event'),
      'event RSVP card present',
    );
    assert.ok(
      CATEGORIES.some((c) => c.actionId === 'category_track_schedule'),
      'schedule-change card present',
    );
    for (const cat of CATEGORIES) {
      assert.ok(cat.actionId.startsWith('category_'));
      assert.ok(typeof cat.value === 'string');
      assert.ok(cat.description.length > 0 && cat.description.length <= 150, cat.actionId);
      assert.ok(cat.cta.length > 0 && cat.cta.length <= 75, cat.actionId);
      assert.ok(!cat.description.includes('\n'), `${cat.actionId} description must be one line`);
    }
  });

  it('the arts primary actions all exist in CATEGORIES', () => {
    const ids = CATEGORIES.map((c) => c.actionId);
    assert.ok(ARTS_CULTURE.primaryActions.length >= 2 && ARTS_CULTURE.primaryActions.length <= 3);
    for (const a of ARTS_CULTURE.primaryActions) assert.ok(ids.includes(a), a);
  });
});

describe('greeting', () => {
  it('picks morning / afternoon / evening by the hour', () => {
    assert.strictEqual(greeting(new Date('2026-07-10T06:00:00'), 'Sam'), 'Good morning, Sam!');
    assert.strictEqual(greeting(new Date('2026-07-10T11:59:00'), 'Sam'), 'Good morning, Sam!');
    assert.strictEqual(greeting(new Date('2026-07-10T12:00:00'), 'Sam'), 'Good afternoon, Sam!');
    assert.strictEqual(greeting(new Date('2026-07-10T17:59:00'), 'Sam'), 'Good afternoon, Sam!');
    assert.strictEqual(greeting(new Date('2026-07-10T18:00:00'), 'Sam'), 'Good evening, Sam!');
    assert.strictEqual(greeting(new Date('2026-07-10T23:30:00'), 'Sam'), 'Good evening, Sam!');
  });

  it('drops the name cleanly when it is missing or blank', () => {
    assert.strictEqual(greeting(new Date('2026-07-10T09:00:00')), 'Good morning!');
    assert.strictEqual(greeting(new Date('2026-07-10T09:00:00'), '   '), 'Good morning!');
  });
});
