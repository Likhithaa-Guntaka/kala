import { getOrgTypeById, ORG_TYPES } from '../org-types.js';

/**
 * @typedef {Object} Category
 * @property {string} actionId
 * @property {string} text
 * @property {string} value
 */

/** One line describing what Benvu does. */
export const TAGLINE = 'Finds grants, drafts reports, and tracks deadlines, in any language.';

/** Value used by the "More" menu to reopen the org-type picker. */
export const CHANGE_ORG_VALUE = '__change_org_type__';

/** The full set of actions Benvu can take from the Home tab. */
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

/** @param {string} actionId */
function categoryByActionId(actionId) {
  return CATEGORIES.find((c) => c.actionId === actionId);
}

/**
 * Org-type picker: two rows of three plain buttons. No primary style — the six
 * choices are equally weighted, so emphasizing one would be arbitrary.
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
          text: { type: 'plain_text', text: `${t.emoji} ${t.label}`, emoji: true },
          action_id: `orgtype_${t.id}`,
          value: t.id,
        })),
      }),
    );
  }
  return rows;
}

/**
 * The primary action row for an org type: its most-used actions as buttons (the
 * first styled "primary" as the single clear next step), plus a select menu
 * holding everything else and the option to change org type.
 * @param {import('../org-types.js').OrgType} org
 * @returns {import('@slack/types').ActionsBlock}
 */
function primaryActionsBlock(org) {
  const primary = org.primaryActions.map(categoryByActionId).filter(Boolean);
  const remaining = CATEGORIES.filter((c) => !org.primaryActions.includes(c.actionId));

  /** @type {any[]} */
  const elements = primary.map((cat, i) => ({
    type: 'button',
    text: { type: 'plain_text', text: /** @type {Category} */ (cat).text, emoji: true },
    action_id: /** @type {Category} */ (cat).actionId,
    value: /** @type {Category} */ (cat).value,
    // Exactly one primary button per view — the most important next action.
    ...(i === 0 ? { style: 'primary' } : {}),
  }));

  elements.push({
    type: 'static_select',
    action_id: 'more_actions_select',
    placeholder: { type: 'plain_text', text: 'More things I can help with', emoji: true },
    option_groups: [
      {
        label: { type: 'plain_text', text: 'Actions' },
        options: remaining.map((c) => ({ text: { type: 'plain_text', text: c.text }, value: c.value })),
      },
      {
        label: { type: 'plain_text', text: 'Settings' },
        options: [{ text: { type: 'plain_text', text: 'Change organization type' }, value: CHANGE_ORG_VALUE }],
      },
    ],
  });

  return { type: 'actions', block_id: 'primary_actions', elements };
}

/**
 * Build the App Home view.
 *
 * First open (no org type): greeting + the org-type picker, and nothing else.
 * After onboarding: greeting + 2-3 primary actions, a "More" menu for the rest,
 * and a low-emphasis line showing which org type is set.
 *
 * @param {string | null} [_botUserId] - Unused since the footer was removed; kept so
 *   existing call sites (app-home-opened, refreshAppHome) stay unchanged.
 * @param {string | null} [orgType] - The user's stored org type id, if any.
 * @returns {import('@slack/types').HomeView}
 */
export function buildAppHomeView(_botUserId = null, orgType = null) {
  const org = getOrgTypeById(orgType);

  /** @type {import('@slack/types').KnownBlock[]} */
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: "Hi, I'm Benvu" } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: TAGLINE }] },
    { type: 'divider' },
  ];

  if (!org) {
    // First open — ask once, show nothing else.
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'What kind of organization are you?' } });
    blocks.push(...orgTypeRows());
    return { type: 'home', blocks };
  }

  // Onboarded — one clear next step, the rest tucked into a menu.
  blocks.push(primaryActionsBlock(org));
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Set up for: ${org.emoji} ${org.label}` }],
  });

  return { type: 'home', blocks };
}
