import assert from 'node:assert';
import { describe, it } from 'node:test';

import { ORG_TYPES } from '../../../listeners/org-types.js';
import { buildAppHomeView, CATEGORIES } from '../../../listeners/views/app-home-builder.js';

/** @param {any} view */
function actionsBlocks(view) {
  return view.blocks.filter((b) => b.type === 'actions');
}

describe('buildAppHomeView', () => {
  it('returns a home view with blocks', () => {
    const view = buildAppHomeView();
    assert.strictEqual(view.type, 'home');
    assert.ok(Array.isArray(view.blocks));
    assert.ok(view.blocks.length > 0);
  });

  describe('onboarding state (no org type)', () => {
    it('shows the org-type question with one button per ORG_TYPES entry', () => {
      const view = buildAppHomeView();
      const orgBlock = view.blocks.find((b) => b.block_id === 'org_type_select');
      assert.ok(orgBlock, 'expected an org_type_select actions block');
      assert.strictEqual(orgBlock.elements.length, ORG_TYPES.length);
      for (const el of orgBlock.elements) {
        assert.ok(el.action_id.startsWith('orgtype_'));
        assert.ok(typeof el.value === 'string');
      }
    });

    it('still offers the quick-action category buttons', () => {
      const view = buildAppHomeView();
      const quick = view.blocks.find((b) => b.block_id === 'quick_actions');
      assert.ok(quick);
      assert.strictEqual(quick.elements.length, CATEGORIES.length);
    });
  });

  describe('personalized state (org type set)', () => {
    it('shows the org label and tailored prompt buttons', () => {
      const view = buildAppHomeView(null, false, null, 'education');
      const edu = ORG_TYPES.find((t) => t.id === 'education');
      const sectionTexts = view.blocks.filter((b) => b.type === 'section').map((b) => b.text.text);
      assert.ok(sectionTexts.some((t) => t.includes(edu.label)));

      const prompts = view.blocks.find((b) => b.block_id === 'tailored_prompts');
      assert.ok(prompts);
      assert.strictEqual(prompts.elements.length, edu.prompts.length);
      for (const el of prompts.elements) {
        assert.ok(el.action_id.startsWith('prompt_run_'));
      }
    });

    it('offers a change-organization-type button', () => {
      const view = buildAppHomeView(null, false, null, 'education');
      const change = view.blocks.find((b) => b.block_id === 'change_org');
      assert.ok(change);
      assert.strictEqual(change.elements[0].action_id, 'change_org_type');
    });

    it('does not show the onboarding org-type question', () => {
      const view = buildAppHomeView(null, false, null, 'education');
      assert.ok(!view.blocks.find((b) => b.block_id === 'org_type_select'));
    });
  });

  describe('MCP status footer', () => {
    it('shows disconnected with learn-more link by default', () => {
      const view = buildAppHomeView();
      const texts = view.blocks.filter((b) => b.type === 'section').map((b) => b.text.text);
      const mcp = texts.find((t) => t.includes('MCP Server'));
      assert.ok(mcp.includes('disconnected'));
      assert.ok(mcp.includes('Learn how to enable'));
    });

    it('shows connected status when isConnected is true', () => {
      const view = buildAppHomeView(null, true);
      const texts = view.blocks.filter((b) => b.type === 'section').map((b) => b.text.text);
      assert.ok(texts.some((t) => t.includes('connected')));
    });
  });

  it('includes bot mention in context when botUserId is provided', () => {
    const view = buildAppHomeView(null, false, 'U0BOT');
    const contextBlock = view.blocks.find((b) => b.type === 'context');
    assert.ok(contextBlock.elements[0].text.includes('<@U0BOT>'));
  });
});

describe('CATEGORIES', () => {
  it('each category has required fields', () => {
    for (const cat of CATEGORIES) {
      assert.ok(typeof cat.actionId === 'string');
      assert.ok(typeof cat.text === 'string');
      assert.ok(typeof cat.value === 'string');
    }
  });
});
