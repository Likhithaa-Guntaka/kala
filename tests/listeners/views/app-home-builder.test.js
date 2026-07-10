import assert from 'node:assert';
import { describe, it } from 'node:test';

import { getOrgTypeById, ORG_TYPES } from '../../../listeners/org-types.js';
import {
  buildAppHomeView,
  CATEGORIES,
  CHANGE_ORG_ACTION,
  CHANGE_ORG_VALUE,
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

describe('buildAppHomeView', () => {
  it('leads with a header naming Benvu and a purpose section', () => {
    const view = buildAppHomeView();
    assert.strictEqual(view.type, 'home');
    const h = view.blocks.find((b) => b.type === 'header');
    assert.strictEqual(h.text.text, 'Benvu');

    const sections = blocksOfType(view, 'section').map((b) => b.text.text);
    assert.ok(sections.includes(TAGLINE));
    assert.ok(TAGLINE.includes('any language'));
  });

  it('never contains emoji in either state', () => {
    assertNoEmoji(buildAppHomeView());
    assertNoEmoji(buildAppHomeView(null, 'food_bank'));
  });

  describe('first open (no org type)', () => {
    it('shows a setup prompt and the org-type picker, no action grid', () => {
      const view = buildAppHomeView();
      assert.ok(block(view, 'org_type_select_1'));
      assert.ok(block(view, 'org_type_select_2'));
      assert.ok(!block(view, 'quick_actions_1'), 'no action grid before onboarding');
      const sections = blocksOfType(view, 'section').map((b) => b.text.text);
      assert.ok(sections.some((t) => /what kind of organization/i.test(t)));
    });

    it('offers all six org types as plain buttons, none primary, no emoji labels', () => {
      const view = buildAppHomeView();
      const els = [...block(view, 'org_type_select_1').elements, ...block(view, 'org_type_select_2').elements];
      assert.strictEqual(els.length, ORG_TYPES.length);
      for (const el of els) {
        assert.strictEqual(el.type, 'button');
        assert.ok(el.action_id.startsWith('orgtype_'));
        assert.strictEqual(el.style, undefined);
      }
      // Labels are the plain org label, without the data-model emoji.
      const org = ORG_TYPES[0];
      const btn = els.find((e) => e.action_id === `orgtype_${org.id}`);
      assert.strictEqual(btn.text.text, org.label);
    });
  });

  describe('after onboarding', () => {
    it('renders all six actions across tidy rows, exactly one primary', () => {
      const view = buildAppHomeView(null, 'mental_health');
      const rows = [block(view, 'quick_actions_1'), block(view, 'quick_actions_2')].filter(Boolean);
      const buttons = rows.flatMap((r) => r.elements);
      assert.strictEqual(buttons.length, CATEGORIES.length);
      assert.ok(rows.every((r) => r.elements.length <= 10));

      const primaries = buttons.filter((b) => b.style === 'primary');
      assert.strictEqual(primaries.length, 1);
      assert.strictEqual(buttons[0].style, 'primary');
      assert.ok(!buttons.some((b) => b.style === 'danger'));

      // Action IDs are preserved so the existing category_* modal handler still fires.
      for (const b of buttons) assert.ok(b.action_id.startsWith('category_'));
    });

    it('orders the org type primary actions first', () => {
      const org = getOrgTypeById('food_bank');
      const view = buildAppHomeView(null, 'food_bank');
      const buttons = [...block(view, 'quick_actions_1').elements, ...block(view, 'quick_actions_2').elements];
      assert.deepStrictEqual(
        buttons.slice(0, org.primaryActions.length).map((b) => b.action_id),
        org.primaryActions,
      );
    });

    it('shows an org-tailored context line and a "how to reach me" footer', () => {
      const org = getOrgTypeById('education');
      const view = buildAppHomeView(null, 'education');
      const contexts = blocksOfType(view, 'context').map((b) => b.elements[0].text);
      assert.ok(contexts.some((t) => t.includes(org.label)));
      assert.ok(contexts.some((t) => /direct message/i.test(t) && /mention/i.test(t)));
      assert.ok(!block(view, 'org_type_select_1'), 'picker is not shown after onboarding');
    });

    it('offers a change-organization button wired to the handler', () => {
      const view = buildAppHomeView(null, 'general');
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
  it('still has all six actions', () => {
    assert.strictEqual(CATEGORIES.length, 6);
    for (const cat of CATEGORIES) {
      assert.ok(cat.actionId.startsWith('category_'));
      assert.ok(typeof cat.value === 'string');
    }
  });
});
