import assert from 'node:assert';
import { describe, it } from 'node:test';

import { getOrgTypeById, ORG_TYPES } from '../../../listeners/org-types.js';
import {
  buildAppHomeView,
  CATEGORIES,
  CHANGE_ORG_ACTION,
  CHANGE_ORG_VALUE,
  DESCRIPTION,
  greeting,
  PICKER_PROMPT,
  PICKER_TAGLINE,
  PICKER_VALUE,
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
/** The action buttons on the onboarded home: one accessory per card section. @param {any} view */
function cardButtons(view) {
  return blocksOfType(view, 'section')
    .filter((b) => b.accessory?.type === 'button')
    .map((b) => b.accessory);
}

describe('buildAppHomeView', () => {
  it('leads with the Benvu name, tagline, and value line (pre-selection)', () => {
    const view = buildAppHomeView();
    assert.strictEqual(view.type, 'home');
    const h = view.blocks.find((b) => b.type === 'header');
    assert.strictEqual(h.text.text, 'Benvu');

    const sections = blocksOfType(view, 'section').map((b) => b.text.text);
    assert.ok(sections.includes(PICKER_TAGLINE));
    assert.ok(sections.includes(PICKER_VALUE));
    // The old branded-header copy must not leak into the picker screen.
    assert.ok(!sections.includes(TAGLINE));
    assert.ok(!sections.includes(DESCRIPTION));
  });

  it('never contains emoji in either state', () => {
    assertNoEmoji(buildAppHomeView());
    assertNoEmoji(buildAppHomeView(null, 'food_bank', { firstName: 'Dedeepya', now: new Date('2026-07-10T08:00:00') }));
  });

  describe('first open (no org type)', () => {
    it('shows the picker prompt and the org-type picker, no action grid', () => {
      const view = buildAppHomeView();
      assert.ok(block(view, 'org_type_select_1'));
      assert.ok(block(view, 'org_type_select_2'));
      assert.ok(!block(view, 'quick_actions_1'), 'no action grid before onboarding');
      const sections = blocksOfType(view, 'section').map((b) => b.text.text);
      assert.ok(sections.includes(PICKER_PROMPT));
    });

    it('has the exact block order: wordmark image, Benvu, tagline, value, divider, prompt, then picker rows', () => {
      const blocks = buildAppHomeView().blocks;
      // The wordmark image leads the pre-selection screen, above the Benvu header.
      assert.strictEqual(blocks[0].type, 'image');
      assert.ok(blocks[0].image_url.startsWith('https://'));
      assert.strictEqual(blocks[0].alt_text, 'Benvu — your AI teammate for nonprofits');
      assert.strictEqual(blocks[1].type, 'header');
      assert.strictEqual(blocks[1].text.text, 'Benvu');
      assert.strictEqual(blocks[2].text.text, PICKER_TAGLINE);
      assert.strictEqual(blocks[3].text.text, PICKER_VALUE);
      assert.strictEqual(blocks[4].type, 'divider');
      assert.strictEqual(blocks[5].text.text, PICKER_PROMPT);
      // Everything after the prompt is a picker actions row — nothing trails the buttons.
      const tail = blocks.slice(6);
      assert.ok(tail.length > 0);
      assert.ok(
        tail.every((b) => b.type === 'actions' && String(b.block_id).startsWith('org_type_select_')),
        'only picker rows follow the prompt',
      );
    });

    it('offers every org type as a plain button, none primary, no emoji labels', () => {
      const view = buildAppHomeView();
      // Gather all picker rows (rows of three, so the count grows with the types).
      const els = view.blocks
        .filter((b) => b.type === 'actions' && String(b.block_id).startsWith('org_type_select_'))
        .flatMap((b) => b.elements);
      assert.strictEqual(els.length, ORG_TYPES.length);
      for (const el of els) {
        assert.strictEqual(el.type, 'button');
        assert.ok(el.action_id.startsWith('orgtype_'));
        assert.strictEqual(el.style, undefined);
      }
      // Every picker button must render the plain org label — never the
      // data-model emoji, and never an emoji-prefixed label. Check all of them,
      // not just the first, so a partial regression can't slip through.
      for (const org of ORG_TYPES) {
        const btn = els.find((e) => e.action_id === `orgtype_${org.id}`);
        assert.strictEqual(btn.text.text, org.label, `${org.id} button must be the plain label`);
      }
    });

    it('the org-type picker blocks contain no emoji', () => {
      const view = buildAppHomeView();
      const picker = view.blocks.filter(
        (b) => b.type === 'actions' && String(b.block_id).startsWith('org_type_select_'),
      );
      assertNoEmoji(picker);
    });
  });

  describe('onboarded top (no branded header)', () => {
    const view = () => buildAppHomeView(null, 'food_bank', { firstName: 'A', now: new Date('2026-07-10T09:00:00') });

    it('has no header block — the branded header lives only on the pre-selection screen', () => {
      assert.strictEqual(view().blocks.filter((b) => b.type === 'header').length, 0);
    });

    it('leads with the greeting section as the first block', () => {
      const blocks = view().blocks;
      assert.strictEqual(blocks[0].type, 'section');
      assert.match(blocks[0].text.text, /^\*Good (morning|afternoon|evening)/);
    });

    it('does not show the branded tagline or description', () => {
      const sections = blocksOfType(view(), 'section').map((b) => b.text?.text);
      assert.ok(!sections.includes(TAGLINE));
      assert.ok(!sections.includes(DESCRIPTION));
    });

    it('the onboarded top contains no emoji', () => {
      assertNoEmoji(view().blocks.slice(0, 4));
    });
  });

  describe('after onboarding', () => {
    // The onboarded Home has no header block; the greeting is the leading bold section.
    const greetingText = (view) =>
      view.blocks.find((b) => b.type === 'section' && /^\*Good (morning|afternoon|evening)/.test(b.text?.text || ''))
        ?.text.text;

    it('greets the user by name and time of day as the first block, with no header', () => {
      const view = buildAppHomeView(null, 'mental_health', {
        firstName: 'Dedeepya',
        now: new Date('2026-07-10T14:30:00'),
      });
      // No header block; the greeting leads.
      assert.strictEqual(
        view.blocks.find((b) => b.type === 'header'),
        undefined,
      );
      assert.strictEqual(view.blocks[0].type, 'section');
      assert.strictEqual(greetingText(view), '*Good afternoon, Dedeepya!*');
    });

    it('falls back to a neutral greeting when the name is missing', () => {
      const view = buildAppHomeView(null, 'mental_health', { now: new Date('2026-07-10T20:00:00') });
      assert.strictEqual(greetingText(view), '*Good evening!*');
    });

    it('renders each action as a card: bold title, description, one button accessory', () => {
      const view = buildAppHomeView(null, 'mental_health', { firstName: 'A', now: new Date('2026-07-10T09:00:00') });
      const cards = blocksOfType(view, 'section').filter((b) => b.accessory?.type === 'button');
      assert.strictEqual(cards.length, CATEGORIES.length);
      for (const card of cards) {
        // Title is bold on its own line, with a description line under it.
        assert.match(card.text.text, /^\*[^*]+\*\n.+/s);
        assert.ok(card.accessory.action_id.startsWith('category_'));
      }
    });

    it("styles exactly one button primary — the org type's #1 action — and none danger", () => {
      const view = buildAppHomeView(null, 'mental_health', { firstName: 'A', now: new Date('2026-07-10T09:00:00') });
      const buttons = cardButtons(view);
      assert.strictEqual(buttons.length, CATEGORIES.length);
      assert.strictEqual(buttons.filter((b) => b.style === 'primary').length, 1);
      assert.strictEqual(buttons[0].style, 'primary');
      assert.ok(!buttons.some((b) => b.style === 'danger'));

      // The primary card lives at the addressable quick_actions_1 block.
      assert.ok(block(view, 'quick_actions_1'), 'leading card is addressable');
      assert.strictEqual(block(view, 'quick_actions_1').accessory.style, 'primary');
    });

    it('orders the org type primary actions first', () => {
      const org = getOrgTypeById('food_bank');
      const view = buildAppHomeView(null, 'food_bank', { firstName: 'A', now: new Date('2026-07-10T09:00:00') });
      const buttons = cardButtons(view);
      assert.deepStrictEqual(
        buttons.slice(0, org.primaryActions.length).map((b) => b.action_id),
        org.primaryActions,
      );
    });

    it('groups cards with dividers between them, not after every element', () => {
      const view = buildAppHomeView(null, 'education', { firstName: 'A', now: new Date('2026-07-10T09:00:00') });
      // 6 cards → 5 dividers between them, plus the header rule, the tailored-prompt
      // section rule, and the footer rule.
      const dividers = blocksOfType(view, 'divider').length;
      assert.ok(dividers >= 5 && dividers <= 9, `expected grouping dividers, got ${dividers}`);
    });

    it('renders the org tailored and RTS prompt rows as prompt_run_ buttons (Food Bank)', () => {
      const view = buildAppHomeView(null, 'food_bank', { firstName: 'A', now: new Date('2026-07-10T09:00:00') });
      const org = getOrgTypeById('food_bank');
      const tailored = block(view, 'home_tailored_prompts');
      const rts = block(view, 'home_rts_prompts');
      assert.ok(tailored && rts, 'both prompt rows present');
      assert.strictEqual(tailored.elements.length, org.tailoredPrompts.length);
      assert.strictEqual(rts.elements.length, org.rtsPrompts.length);
      // Every prompt button runs via the shared prompt_run_ handler, full prompt in value.
      const all = [...tailored.elements, ...rts.elements];
      for (const el of all) {
        assert.ok(el.action_id.startsWith('prompt_run_'));
        assert.ok(typeof el.value === 'string' && el.value.length > 0);
      }
      // Action_ids stay unique across the two rows (RTS offset past the tailored ones).
      const ids = all.map((e) => e.action_id);
      assert.strictEqual(new Set(ids).size, ids.length);
    });

    it('omits the RTS row for a type that defines none (General Nonprofit)', () => {
      const view = buildAppHomeView(null, 'general', { firstName: 'A', now: new Date('2026-07-10T09:00:00') });
      assert.ok(block(view, 'home_tailored_prompts'), 'tailored row present');
      assert.strictEqual(block(view, 'home_rts_prompts'), undefined);
    });

    it('the reconfigured Food Bank home (with tailored + RTS rows) has no emoji', () => {
      const view = buildAppHomeView(null, 'food_bank', { firstName: 'A', now: new Date('2026-07-10T09:00:00') });
      assertNoEmoji(view);
    });

    describe('closing-soon line', () => {
      const opts = (closingSoon) => ({ firstName: 'A', now: new Date('2026-07-10T09:00:00'), closingSoon });

      it('renders one plain context line when a positive count is provided', () => {
        const view = buildAppHomeView(null, 'food_bank', opts({ count: 5, label: 'food and nutrition' }));
        const line = blocksOfType(view, 'context').find((b) => /closing in the next 30 days/.test(b.elements[0].text));
        assert.ok(line, 'closing-soon context line present');
        assert.match(line.elements[0].text, /5 food and nutrition grants closing in the next 30 days\./);
        // It is a context line, never a button/action.
        assert.strictEqual(line.type, 'context');
        assertNoEmoji(view);
      });

      it('singularizes for a count of one', () => {
        const view = buildAppHomeView(null, 'arts_culture', opts({ count: 1, label: 'arts and culture' }));
        const line = blocksOfType(view, 'context').find((b) => /closing in the next 30 days/.test(b.elements[0].text));
        assert.match(line.elements[0].text, /1 arts and culture grant closing/);
      });

      it('omits the line entirely when the count is null (API slow/down/failed)', () => {
        const view = buildAppHomeView(null, 'food_bank', opts(null));
        const has = blocksOfType(view, 'context').some((b) => /closing in the next 30 days/.test(b.elements[0].text));
        assert.strictEqual(has, false);
      });

      it('omits the line when the count is zero (nothing closing soon)', () => {
        const view = buildAppHomeView(null, 'food_bank', opts({ count: 0, label: 'food and nutrition' }));
        const has = blocksOfType(view, 'context').some((b) => /closing in the next 30 days/.test(b.elements[0].text));
        assert.strictEqual(has, false);
      });

      it('renders a normal, complete Home even with no closingSoon at all', () => {
        const view = buildAppHomeView(null, 'food_bank', { firstName: 'A', now: new Date('2026-07-10T09:00:00') });
        // Greeting, tailored row, and action cards all still present.
        assert.strictEqual(view.blocks[0].type, 'section');
        assert.ok(block(view, 'home_tailored_prompts'));
        assert.ok(block(view, 'quick_actions_1'));
      });
    });

    it('shows a transient notice banner below the greeting and above the tailored rows', () => {
      const notice = 'Sent to your messages, open the Messages tab.';
      const view = buildAppHomeView(null, 'education', {
        firstName: 'A',
        now: new Date('2026-07-10T09:00:00'),
        notice,
      });
      const noticeIdx = view.blocks.findIndex((b) => b.type === 'section' && b.text?.text === notice);
      const greetingIdx = view.blocks.findIndex(
        (b) => b.type === 'section' && /^\*Good (morning|afternoon|evening)/.test(b.text?.text || ''),
      );
      const tailoredIdx = view.blocks.findIndex((b) => b.block_id === 'home_tailored_prompts');
      assert.ok(noticeIdx >= 0, 'notice banner is present');
      assert.ok(greetingIdx >= 0 && greetingIdx < noticeIdx, 'notice sits below the greeting');
      assert.ok(noticeIdx < tailoredIdx, 'notice sits above the tailored prompt rows');
      assertNoEmoji(view);
    });

    it('omits the notice banner when none is passed (auto-clears on refresh)', () => {
      const view = buildAppHomeView(null, 'education', { firstName: 'A', now: new Date('2026-07-10T09:00:00') });
      assert.ok(!view.blocks.some((b) => b.type === 'section' && /messages tab/i.test(b.text?.text || '')));
    });

    it('moves org label + "reach me" into a single lighter context footer', () => {
      const org = getOrgTypeById('education');
      const view = buildAppHomeView(null, 'education', { firstName: 'A', now: new Date('2026-07-10T09:00:00') });
      const contexts = blocksOfType(view, 'context');
      // Both footer lines recede into one context block, not section blocks.
      const footer = contexts[contexts.length - 1];
      const texts = footer.elements.map((e) => e.text);
      assert.ok(texts.some((t) => t.includes(org.label)));
      assert.ok(texts.some((t) => /direct message/i.test(t) && /mention/i.test(t)));
      assert.ok(!block(view, 'org_type_select_1'), 'picker is not shown after onboarding');
    });

    it('offers a change-organization button wired to the handler', () => {
      const view = buildAppHomeView(null, 'general', { firstName: 'A', now: new Date('2026-07-10T09:00:00') });
      const settings = block(view, 'org_settings');
      assert.ok(settings);
      assert.strictEqual(settings.elements[0].action_id, CHANGE_ORG_ACTION);
      assert.strictEqual(settings.elements[0].value, CHANGE_ORG_VALUE);
      assert.strictEqual(settings.elements[0].style, undefined);
    });

    it('gives every org type 2-3 primary actions that exist in CATEGORIES', () => {
      const ids = CATEGORIES.map((c) => c.actionId);
      for (const org of ORG_TYPES) {
        assert.ok(org.primaryActions.length >= 2 && org.primaryActions.length <= 3, org.id);
        for (const a of org.primaryActions) assert.ok(ids.includes(a), `${org.id}: ${a}`);
      }
    });
  });
});

describe('CATEGORIES', () => {
  it('still has all six actions, each with card copy that fits Slack limits', () => {
    assert.strictEqual(CATEGORIES.length, 6);
    for (const cat of CATEGORIES) {
      assert.ok(cat.actionId.startsWith('category_'));
      assert.ok(typeof cat.value === 'string');
      // Card copy present and within limits (button label 75, description one line).
      assert.ok(cat.description.length > 0 && cat.description.length <= 150, cat.actionId);
      assert.ok(cat.cta.length > 0 && cat.cta.length <= 75, cat.actionId);
      assert.ok(!cat.description.includes('\n'), `${cat.actionId} description must be one line`);
    }
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
