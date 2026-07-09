import { getOrgTypeById, ORG_TYPES } from '../org-types.js';
import { buildPromptActionsBlock } from './onboarding-builder.js';

/**
 * @typedef {Object} Category
 * @property {string} actionId
 * @property {string} text
 * @property {string} value
 */

/** The quick actions shown in the "Things I can help with" row. */
/** @type {Category[]} */
export const CATEGORIES = [
  { actionId: 'category_find_grants', text: 'Find Grants', value: 'Find Grants' },
  { actionId: 'category_draft_report', text: 'Draft a Report', value: 'Draft a Report' },
  { actionId: 'category_track_deadline', text: 'Track a Deadline', value: 'Track a Deadline' },
  { actionId: 'category_summarize_meeting', text: 'Summarize Meeting Notes', value: 'Summarize Meeting Notes' },
  { actionId: 'category_donor_thankyou', text: 'Draft Donor Thank You', value: 'Draft Donor Thank You' },
  {
    actionId: 'category_volunteer_announcement',
    text: 'Create Volunteer Announcement',
    value: 'Create Volunteer Announcement',
  },
];

/**
 * The quick-action buttons, shown in every state of the Home tab.
 * @returns {import('@slack/types').ActionsBlock}
 */
function categoryActionsBlock() {
  return {
    type: 'actions',
    block_id: 'quick_actions',
    elements: CATEGORIES.map((cat) => ({
      type: 'button',
      text: { type: 'plain_text', text: cat.text, emoji: true },
      action_id: cat.actionId,
      value: cat.value,
    })),
  };
}

/**
 * Org-type selection laid out as two rows of three plain-text buttons.
 * @returns {import('@slack/types').ActionsBlock[]}
 */
function orgTypeRows() {
  const rows = [];
  for (let i = 0; i < ORG_TYPES.length; i += 3) {
    rows.push(
      /** @type {import('@slack/types').ActionsBlock} */ ({
        type: 'actions',
        block_id: `org_type_select_${i / 3 + 1}`,
        elements: ORG_TYPES.slice(i, i + 3).map((t) => ({
          type: 'button',
          text: { type: 'plain_text', text: t.label, emoji: true },
          action_id: `orgtype_${t.id}`,
          value: t.id,
        })),
      }),
    );
  }
  return rows;
}

/**
 * Build the App Home view. Shows onboarding (org-type question) until the user
 * picks a type, then a personalized view with their org type and tailored actions.
 * @param {string | null} [botUserId] - The bot's user ID for the footer mention.
 * @param {string | null} [orgType] - The user's stored org type id, if any.
 * @returns {import('@slack/types').HomeView}
 */
export function buildAppHomeView(botUserId = null, orgType = null) {
  const org = getOrgTypeById(orgType);

  /** @type {import('@slack/types').KnownBlock[]} */
  const blocks = [
    // Section 1 — clean header + subtitle.
    { type: 'header', text: { type: 'plain_text', text: "Hi, I'm Benvu" } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'Your AI teammate for nonprofit work.' }] },
    { type: 'divider' },
  ];

  if (org) {
    // Section 3 — selected org type shown as a subtle label, then tailored prompts,
    // then a clearly separated "change type" control.
    blocks.push(
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Organization: ${org.label}` }] },
      buildPromptActionsBlock(org),
      { type: 'divider' },
      {
        type: 'actions',
        block_id: 'change_org',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Change organization type' },
            action_id: 'change_org_type',
            value: 'change',
          },
        ],
      },
    );
  } else {
    // Section 2 — org-type question with two rows of three plain buttons.
    blocks.push(
      { type: 'section', text: { type: 'mrkdwn', text: '*What kind of organization are you?*' } },
      ...orgTypeRows(),
    );
  }

  // Section 4 — quick actions, always visible.
  blocks.push(
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: '*Things I can help with:*' } },
    categoryActionsBlock(),
  );

  // Section 5 — plain footer.
  const mention = botUserId ? `<@${botUserId}>` : '@benvu';
  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Message me directly or mention ${mention} in any channel. I work in any language.` },
      ],
    },
  );

  return { type: 'home', blocks };
}
