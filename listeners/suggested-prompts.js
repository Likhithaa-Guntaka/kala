import { ARTS_CULTURE } from './arts-culture.js';

/** Fixed title above the suggested-prompt list on the Messages tab. */
export const SUGGESTED_PROMPTS_TITLE = 'How can I help you today?';

/**
 * Build the suggested-prompts payload (a title plus up to 4 prompts) for the
 * Messages tab. Reuses the arts and culture tailored prompt copy verbatim as both
 * the card title and the message that gets sent. Slack rejects more than 4
 * prompts, so the list is sliced defensively.
 * @returns {{ title: string, prompts: { title: string, message: string }[] }}
 */
export function suggestedPrompts() {
  const prompts = ARTS_CULTURE.tailoredPrompts.slice(0, 4).map((message) => ({ title: message, message }));
  return { title: SUGGESTED_PROMPTS_TITLE, prompts };
}
