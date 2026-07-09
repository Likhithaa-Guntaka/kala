import assert from 'node:assert';
import { describe, it } from 'node:test';

import { getOrgTypeById, ORG_TYPES } from '../../../listeners/org-types.js';
import { buildAppHomeView, CATEGORIES, CHANGE_ORG_VALUE, TAGLINE } from '../../../listeners/views/app-home-builder.js';

/** @param {any} view @param {string} id */
function block(view, id) {
  return view.blocks.find((b) => b.block_id === id);
}
/** @param {any} view @param {string} type */
function blocksOfType(view, type) {
  return view.blocks.filter((b) => b.type === type);
}

describe('buildAppHomeView', () => {
  it('has a clean header, the tagline, and no wave emoji', () => {
    const view = buildAppHomeView();
    assert.strictEqual(view.type, 'home');
    const header = view.blocks.find((b) => b.type === 'header');
    assert.strictEqual(header.text.text, "Hi, I'm Benvu");
    assert.ok(!header.text.text.includes('👋'));

    const contexts = blocksOfType(view, 'context').map((b) => b.elements[0].text);
    assert.ok(contexts.includes(TAGLINE));
    assert.ok(TAGLINE.includes('any language'));
    assert.ok(!TAGLINE.includes('AI teammate'));
  });

  it('uses at most one divider in either state', () => {
    for (const orgType of [null, 'education']) {
      assert.ok(blocksOfType(buildAppHomeView(null, orgType), 'divider').length <= 1);
    }
  });

  describe('first open (no org type)', () => {
    it('shows only the org-type picker — no quick actions, no footer', () => {
      const view = buildAppHomeView();
      assert.ok(block(view, 'org_type_select_1'));
      assert.ok(block(view, 'org_type_select_2'));
      assert.ok(!block(view, 'primary_actions'), 'no action buttons on first open');
      assert.ok(!block(view, 'quick_actions'), 'no six-button grid on first open');
    });

    it('offers all six org types, none styled primary', () => {
      const view = buildAppHomeView();
      const els = [...block(view, 'org_type_select_1').elements, ...block(view, 'org_type_select_2').elements];
      assert.strictEqual(els.length, ORG_TYPES.length);
      for (const el of els) {
        assert.ok(el.action_id.startsWith('orgtype_'));
        assert.strictEqual(el.style, undefined);
      }
    });
  });

  describe('after onboarding', () => {
    it('shows the org type primary actions, exactly one styled primary', () => {
      const org = getOrgTypeById('mental_health');
      const view = buildAppHomeView(null, 'mental_health');
      const actions = block(view, 'primary_actions');
      assert.ok(actions);

      const buttons = actions.elements.filter((e) => e.type === 'button');
      assert.strictEqual(buttons.length, org.primaryActions.length);
      assert.deepStrictEqual(
        buttons.map((b) => b.action_id),
        org.primaryActions,
      );
      assert.strictEqual(buttons.filter((b) => b.style === 'primary').length, 1);
      assert.strictEqual(buttons[0].style, 'primary');
      assert.ok(!buttons.some((b) => b.style === 'danger'));
    });

    it('tucks the remaining actions + change-org into a single select menu', () => {
      const org = getOrgTypeById('mental_health');
      const view = buildAppHomeView(null, 'mental_health');
      const select = block(view, 'primary_actions').elements.find((e) => e.type === 'static_select');
      assert.ok(select);
      assert.strictEqual(select.action_id, 'more_actions_select');
      assert.ok(select.placeholder.text.includes('More things I can help with'));

      const actionOpts = select.option_groups[0].options.map((o) => o.value);
      const expected = CATEGORIES.filter((c) => !org.primaryActions.includes(c.actionId)).map((c) => c.value);
      assert.deepStrictEqual(actionOpts, expected);

      const settingsOpts = select.option_groups[1].options.map((o) => o.value);
      assert.deepStrictEqual(settingsOpts, [CHANGE_ORG_VALUE]);
    });

    it('shows a low-emphasis "Set up for" line and never re-shows the picker', () => {
      const view = buildAppHomeView(null, 'food_bank');
      const contexts = blocksOfType(view, 'context').map((b) => b.elements[0].text);
      assert.ok(contexts.some((t) => t.includes('Set up for: 🍎 Food Bank / Basic Needs')));
      assert.ok(!block(view, 'org_type_select_1'), 'picker is not shown again');
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
  it('still has all six actions', () => {
    assert.strictEqual(CATEGORIES.length, 6);
    for (const cat of CATEGORIES) {
      assert.ok(cat.actionId.startsWith('category_'));
      assert.ok(typeof cat.value === 'string');
    }
  });
});
