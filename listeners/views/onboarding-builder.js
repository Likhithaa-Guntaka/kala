import { ARTS_CULTURE } from '../arts-culture.js';
import { actions, button, context, header, section } from './kit.js';

/** Action ID prefix for the "run this example prompt" buttons. */
export const PROMPT_ACTION_PREFIX = 'prompt_run_';

/**
 * An actions block of prompt buttons. The full prompt rides in the value (so the
 * agent runs the exact prompt); the label is truncated to Slack's button limit.
 * `startIndex` offsets the action_ids so multiple prompt rows can coexist in one
 * view without colliding.
 * @param {string[]} prompts
 * @param {string} blockId
 * @param {number} [startIndex]
 * @returns {import('@slack/types').ActionsBlock}
 */
export function buildPromptButtons(prompts, blockId, startIndex = 0) {
  return actions(
    blockId,
    prompts.map((prompt, i) =>
      button({ text: prompt, actionId: `${PROMPT_ACTION_PREFIX}${startIndex + i}`, value: prompt }),
    ),
  );
}

/**
 * Blocks for the welcome DM: a warm header, a one-line intro that names Kala's
 * arts and culture focus, and the tailored example prompts as buttons so the user
 * can get started immediately — no selection step.
 * @returns {import('@slack/types').KnownBlock[]}
 */
export function buildWelcomeDmBlocks() {
  return [
    header('Welcome to Kala'),
    section(
      "I'm Kala, your AI teammate for arts and culture nonprofits. I find real arts and culture grants, draft " +
        'your reports, and track every deadline — in any language.\n\nHere are a few things I can do:',
    ),
    buildPromptButtons(ARTS_CULTURE.tailoredPrompts, 'tailored_prompts'),
    section('*Operational trackers*'),
    // Offset the action_ids past the tailored ones so both rows coexist in one message.
    buildPromptButtons(ARTS_CULTURE.featurePrompts, 'feature_prompts', ARTS_CULTURE.tailoredPrompts.length),
    context('Tap one, or just type what you need.'),
  ];
}
