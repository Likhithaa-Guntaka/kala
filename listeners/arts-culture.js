/**
 * Kala is a dedicated assistant for Arts & Culture nonprofits. This is the single
 * source of truth for that tailoring: the funding-category defaults, the tailored
 * operational prompts, the RTS-grounded prompts, and the funding-match behavior.
 * Listeners and the agent read this data; they never hardcode tailoring of their own.
 *
 * @typedef {Object} ArtsCultureConfig
 * @property {string} label - Human label for the focus area.
 * @property {string[]} primaryActions - Action IDs of the quick actions surfaced first on the Home tab.
 * @property {string[]} tailoredPrompts - Operational-language example prompts (App Home rows, onboarding, suggested prompts).
 * @property {string[]} defaultGrantCategories - Grants.gov funding-category CODES (primary first), e.g. ['AR','HU'].
 * @property {string} grantLabel - Short human noun phrase for the funding area (used in the "closing soon" Home line).
 * @property {string[]} rtsPrompts - Summarize/draft prompts framed to ground answers in the team's own channels via search_workspace.
 * @property {string[]} featurePrompts - Starter prompts for Kala's operational trackers (engagements, event RSVPs, schedule-change acks), surfaced on the Home tab and welcome DM.
 * @property {{ ratio: string, source: string }} match - The nonfederal funding-match Kala can track (e.g. an NEA 1:1 match).
 */

/** @type {ArtsCultureConfig} */
export const ARTS_CULTURE = {
  label: 'Arts & Culture',
  primaryActions: ['category_find_grants', 'category_donor_thankyou', 'category_draft_report'],
  tailoredPrompts: [
    'Draft our Challenge America project summary (max $10K)',
    'Draft our new season program announcement',
    'Find arts and culture funding',
  ],
  defaultGrantCategories: ['AR', 'HU'],
  grantLabel: 'arts and culture',
  rtsPrompts: ["Summarize what we decided about next season's programming", 'Catch me up on our gala planning'],
  featurePrompts: [
    'Track a new artist or contractor engagement',
    'Track RSVPs for an upcoming event',
    'Track acknowledgments for a schedule change',
  ],
  match: { ratio: '1:1', source: 'NEA' },
};
