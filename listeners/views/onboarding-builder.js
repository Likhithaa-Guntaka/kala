import { ORG_TYPES } from '../org-types.js';
import { actions, button, context, header, section } from './kit.js';

/** Action ID prefix for the "run this example prompt" buttons. */
export const PROMPT_ACTION_PREFIX = 'prompt_run_';

/**
 * An actions block with one plain button per org type. Emoji-free labels; the
 * org id rides in the button value.
 * @returns {import('@slack/types').ActionsBlock}
 */
export function buildOrgTypeActionsBlock() {
  return actions(
    'org_type_select',
    ORG_TYPES.map((t) => button({ text: t.label, actionId: `orgtype_${t.id}`, value: t.id })),
  );
}

/**
 * An actions block with the three tailored example prompts as buttons. The full
 * prompt rides in the value; the label is truncated to Slack's button limit.
 * @param {import('../org-types.js').OrgType} orgType
 * @returns {import('@slack/types').ActionsBlock}
 */
export function buildPromptActionsBlock(orgType) {
  return actions(
    'tailored_prompts',
    orgType.prompts.map((prompt, i) =>
      button({ text: prompt, actionId: `${PROMPT_ACTION_PREFIX}${i}`, value: prompt }),
    ),
  );
}

/**
 * Blocks for the welcome DM: a warm header, a one-line intro with the org-type
 * question, the picker buttons, and a line on what happens next.
 * @returns {import('@slack/types').KnownBlock[]}
 */
export function buildWelcomeDmBlocks() {
  return [
    header('Welcome to Benvu'),
    section(
      "I'm Benvu. I find grants, draft reports, and track deadlines, in any language.\n\n" +
        'To get started, what kind of organization are you?',
    ),
    buildOrgTypeActionsBlock(),
    context('Pick one and I will tailor my suggestions. You can also just message me anytime, in any language.'),
  ];
}

/**
 * Blocks for the follow-up DM sent after a user picks their org type: a short
 * confirmation, three tailored example prompts, and a nudge on what to do next.
 * @param {import('../org-types.js').OrgType} orgType
 * @returns {import('@slack/types').KnownBlock[]}
 */
export function buildTailoredPromptsDmBlocks(orgType) {
  return [
    section(`Set up for *${orgType.label}*. Here are a few things I can do:`),
    buildPromptActionsBlock(orgType),
    context('Tap one, or just type what you need.'),
  ];
}
