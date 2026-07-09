import { ORG_TYPES } from '../org-types.js';

/** Action ID prefix for the "run this example prompt" buttons. */
export const PROMPT_ACTION_PREFIX = 'prompt_run_';

/** Slack button labels max out at 75 chars — keep the full text in `value`. @param {string} s */
function truncate(s, max = 72) {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/**
 * An actions block with one button per org type (native Slack buttons).
 * @returns {import('@slack/types').ActionsBlock}
 */
export function buildOrgTypeActionsBlock() {
  return {
    type: 'actions',
    block_id: 'org_type_select',
    elements: ORG_TYPES.map((t) => ({
      type: 'button',
      text: { type: 'plain_text', text: `${t.emoji} ${t.label}`, emoji: true },
      action_id: `orgtype_${t.id}`,
      value: t.id,
    })),
  };
}

/**
 * An actions block with the three tailored example prompts as buttons.
 * @param {import('../org-types.js').OrgType} orgType
 * @returns {import('@slack/types').ActionsBlock}
 */
export function buildPromptActionsBlock(orgType) {
  return {
    type: 'actions',
    block_id: 'tailored_prompts',
    elements: orgType.prompts.map((prompt, i) => ({
      type: 'button',
      text: { type: 'plain_text', text: truncate(prompt), emoji: true },
      action_id: `${PROMPT_ACTION_PREFIX}${i}`,
      value: prompt,
    })),
  };
}

/**
 * Blocks for the welcome DM: a short intro and the org-type question with buttons.
 * @returns {import('@slack/types').KnownBlock[]}
 */
export function buildWelcomeDmBlocks() {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          "Hi, I'm *Benvu*. I find grants, draft reports, and track deadlines, in any language.\n\n" +
          'What kind of organization are you?',
      },
    },
    buildOrgTypeActionsBlock(),
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'You can also just message me anytime, in any language.' }],
    },
  ];
}

/**
 * Blocks for the follow-up DM sent after a user picks their org type.
 * @param {import('../org-types.js').OrgType} orgType
 * @returns {import('@slack/types').KnownBlock[]}
 */
export function buildTailoredPromptsDmBlocks(orgType) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Set up for ${orgType.emoji} *${orgType.label}*.`,
      },
    },
    buildPromptActionsBlock(orgType),
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'Tap one, or just type what you need.' }],
    },
  ];
}
