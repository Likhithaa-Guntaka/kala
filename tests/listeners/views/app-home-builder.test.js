import assert from 'node:assert';
import { describe, it } from 'node:test';

import { ORG_TYPES } from '../../../listeners/org-types.js';
import { buildAppHomeView, CATEGORIES } from '../../../listeners/views/app-home-builder.js';

/** @param {any} view @param {string} id */
function block(view, id) {
  return view.blocks.find((b) => b.block_id === id);
}

describe('buildAppHomeView', () => {
  it('returns a home view with blocks', () => {
    const view = buildAppHomeView();
    assert.strictEqual(view.type, 'home');
    assert.ok(view.blocks.length > 0);
  });

  it('has a clean header with no wave emoji', () => {
    const view = buildAppHomeView();
    const header = view.blocks.find((b) => b.type === 'header');
    assert.strictEqual(header.text.text, "Hi, I'm Benvu");
    assert.ok(!header.text.text.includes('👋'));
    assert.ok(!header.text.text.includes(':wave:'));
  });

  it('never renders an MCP Server block', () => {
    const view = buildAppHomeView(null, 'education');
    const allText = JSON.stringify(view.blocks);
    assert.ok(!allText.includes('MCP Server'));
  });

  it('always shows the six quick actions', () => {
    for (const orgType of [null, 'education']) {
      const view = buildAppHomeView(null, orgType);
      const quick = block(view, 'quick_actions');
      assert.ok(quick, `quick_actions present for orgType=${orgType}`);
      assert.strictEqual(quick.elements.length, CATEGORIES.length);
      assert.strictEqual(CATEGORIES.length, 6);
    }
  });

  it('footer mentions the bot and any-language support', () => {
    const view = buildAppHomeView('U0BOT');
    const contexts = view.blocks.filter((b) => b.type === 'context').map((b) => b.elements[0].text);
    const footer = contexts.find((t) => t.includes('any language'));
    assert.ok(footer);
    assert.ok(footer.includes('<@U0BOT>'));
  });

  describe('onboarding state (no org type)', () => {
    it('asks the org-type question with two rows of three plain buttons', () => {
      const view = buildAppHomeView();
      const row1 = block(view, 'org_type_select_1');
      const row2 = block(view, 'org_type_select_2');
      assert.ok(row1 && row2);
      assert.strictEqual(row1.elements.length, 3);
      assert.strictEqual(row2.elements.length, 3);
      assert.strictEqual(row1.elements.length + row2.elements.length, ORG_TYPES.length);
      for (const el of [...row1.elements, ...row2.elements]) {
        assert.ok(el.action_id.startsWith('orgtype_'));
        // plain label only — no emoji baked into the text
        assert.ok(!/\p{Extended_Pictographic}/u.test(el.text.text));
      }
    });
  });

  describe('personalized state (org type set)', () => {
    it('shows the org label, tailored prompts, and a change-type button', () => {
      const view = buildAppHomeView(null, 'food_bank');
      const contexts = view.blocks.filter((b) => b.type === 'context').map((b) => b.elements[0].text);
      assert.ok(contexts.some((t) => t.includes('Organization: Food Bank / Basic Needs')));

      const prompts = block(view, 'tailored_prompts');
      assert.ok(prompts);
      assert.strictEqual(prompts.elements.length, 3);

      const change = block(view, 'change_org');
      assert.ok(change);
      assert.strictEqual(change.elements[0].action_id, 'change_org_type');
    });

    it('does not show the onboarding org-type question', () => {
      const view = buildAppHomeView(null, 'food_bank');
      assert.ok(!block(view, 'org_type_select_1'));
    });
  });
});

describe('CATEGORIES', () => {
  it('has six quick actions each with required fields', () => {
    assert.strictEqual(CATEGORIES.length, 6);
    for (const cat of CATEGORIES) {
      assert.ok(typeof cat.actionId === 'string' && cat.actionId.startsWith('category_'));
      assert.ok(typeof cat.text === 'string');
      assert.ok(typeof cat.value === 'string');
    }
  });
});
