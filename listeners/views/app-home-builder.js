import { getOrgTypeById, ORG_TYPES } from '../org-types.js';
import { actions, button, context, divider, header, section } from './kit.js';

/**
 * @typedef {Object} Category
 * @property {string} actionId
 * @property {string} text
 * @property {string} value
 */

/** One line describing what Benvu does (the Home purpose line). */
export const TAGLINE = 'Finds grants, drafts reports, and tracks deadlines, in any language.';

/** Value carried by the "Change organization type" control. */
export const CHANGE_ORG_VALUE = '__change_org_type__';

/** Action ID for the "Change organization type" button. */
export const CHANGE_ORG_ACTION = 'change_org_type';

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

/** How people can reach Benvu, shown as a footer context line. */
const REACH_LINE =
  'Reach me anytime: send a direct message, mention @Benvu in a channel, or use /grant, /report, or /deadline.';

/**
 * Order the six actions with this org type's most-used ones first, so the
 * primary button is the action they're most likely to want.
 * @param {import('../org-types.js').OrgType} org
 * @returns {Category[]}
 */
function orderedActions(org) {
  const primary = org.primaryActions.map((id) => CATEGORIES.find((c) => c.actionId === id)).filter(Boolean);
  const rest = CATEGORIES.filter((c) => !org.primaryActions.includes(c.actionId));
  return /** @type {Category[]} */ ([...primary, ...rest]);
}

/**
 * The six action buttons, laid out as tidy rows of three. The single most-used
 * action is styled primary; the rest are default. Button text carries meaning —
 * no icons.
 * @param {import('../org-types.js').OrgType} org
 * @returns {import('@slack/types').ActionsBlock[]}
 */
function quickActionRows(org) {
  const ordered = orderedActions(org);
  const buttons = ordered.map((cat, i) =>
    button({
      text: cat.text,
      actionId: cat.actionId,
      value: cat.value,
      // Exactly one primary button: the clearest next action.
      ...(i === 0 ? { style: 'primary' } : {}),
    }),
  );

  /** @type {import('@slack/types').ActionsBlock[]} */
  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) {
    rows.push(actions(`quick_actions_${i / 3 + 1}`, buttons.slice(i, i + 3)));
  }
  return rows;
}

/**
 * The org-type picker shown on first open: rows of three plain buttons. None is
 * styled primary — the six choices are equally weighted.
 * @returns {import('@slack/types').ActionsBlock[]}
 */
function orgTypeRows() {
  /** @type {import('@slack/types').ActionsBlock[]} */
  const rows = [];
  for (let i = 0; i < ORG_TYPES.length; i += 3) {
    const buttons = ORG_TYPES.slice(i, i + 3).map((t) =>
      button({ text: t.label, actionId: `orgtype_${t.id}`, value: t.id }),
    );
    rows.push(actions(`org_type_select_${i / 3 + 1}`, buttons));
  }
  return rows;
}

/**
 * Build the App Home view.
 *
 * First open (no org type): name, purpose, a friendly setup prompt, and the
 * org-type picker. After onboarding: name, purpose, an org-tailored context
 * line, the six actions, a way to change org type, and a "how to reach me" line.
 *
 * @param {string | null} [_botUserId] - Unused; kept so existing call sites stay unchanged.
 * @param {string | null} [orgType] - The user's stored org type id, if any.
 * @returns {import('@slack/types').HomeView}
 */
export function buildAppHomeView(_botUserId = null, orgType = null) {
  const org = getOrgTypeById(orgType);

  /** @type {import('@slack/types').KnownBlock[]} */
  const blocks = [header('Benvu'), section(TAGLINE)];

  if (!org) {
    // First open — one clear setup question, then the picker.
    blocks.push(divider());
    blocks.push(section('First, what kind of organization are you? Pick one so I can tailor my suggestions.'));
    blocks.push(...orgTypeRows());
    blocks.push(context('You can also just message me anytime, in any language.'));
    return { type: 'home', blocks };
  }

  // Onboarded — tailored context, the six actions, change-org, and reach line.
  blocks.push(context(`Tailored for ${org.label}.`));
  blocks.push(divider());
  blocks.push(...quickActionRows(org));
  blocks.push(
    actions('org_settings', [
      button({ text: 'Change organization type', actionId: CHANGE_ORG_ACTION, value: CHANGE_ORG_VALUE }),
    ]),
  );
  blocks.push(divider());
  blocks.push(context(REACH_LINE));

  return { type: 'home', blocks };
}
