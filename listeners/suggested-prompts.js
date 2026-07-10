import { getOrgTypeById } from './org-types.js';

/** Fixed title above the suggested-prompt list on the Messages tab. */
export const SUGGESTED_PROMPTS_TITLE = 'How can I help you today?';

/**
 * Generic suggested prompts shown before a user has chosen an org type. Kept in
 * sync with the hard-coded fallbacks in manifest.json's
 * `features.agent_view.suggested_prompts`, which cover the same ground for the
 * moment before any runtime call fires. Capped at Slack's limit of 4.
 * @type {{ title: string, message: string }[]}
 */
export const GENERIC_SUGGESTED_PROMPTS = [
  { title: 'Find grants', message: 'Find grants for youth education in New York under $50k' },
  { title: 'Draft a report', message: 'Draft an impact report, we served 300 families this quarter' },
  { title: 'Track a deadline', message: 'Remind me about the Ford Foundation grant deadline on August 15' },
];

/**
 * Build the suggested-prompts payload (a title plus up to 4 prompts) for the
 * Messages tab, tailored to a user's org type when known and generic otherwise.
 * Reuses each org type's own tailored prompt copy verbatim as both the card
 * title and the message that gets sent. Slack rejects more than 4 prompts, so
 * the list is sliced defensively.
 * @param {string | null | undefined} orgTypeId
 * @returns {{ title: string, prompts: { title: string, message: string }[] }}
 */
export function suggestedPromptsForOrg(orgTypeId) {
  const org = getOrgTypeById(orgTypeId);
  const prompts = org
    ? org.tailoredPrompts.slice(0, 4).map((message) => ({ title: message, message }))
    : GENERIC_SUGGESTED_PROMPTS.slice(0, 4);
  return { title: SUGGESTED_PROMPTS_TITLE, prompts };
}
