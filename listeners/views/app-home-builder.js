import { getOrgTypeById, ORG_TYPES } from '../org-types.js';
import { actions, button, context, divider, header, section } from './kit.js';
import { buildPromptButtons } from './onboarding-builder.js';

/**
 * @typedef {Object} Category
 * @property {string} actionId
 * @property {string} text
 * @property {string} value
 * @property {string} description - One-line plain description shown under the card title.
 * @property {string} cta - Short button label for the card accessory (<= 75 chars).
 */

/** One line describing what Benvu does (the Home purpose line). */
export const TAGLINE = 'I help your team find funding, write reports, and hit every deadline, in any language.';

/** Value carried by the "Change organization type" control. */
export const CHANGE_ORG_VALUE = '__change_org_type__';

/** Action ID for the "Change organization type" button. */
export const CHANGE_ORG_ACTION = 'change_org_type';

/** The full set of actions Benvu can take from the Home tab. */
/** @type {Category[]} */
export const CATEGORIES = [
  {
    actionId: 'category_find_grants',
    text: 'Find Grants',
    value: 'Find Grants',
    description: 'Search real, open federal grants that fit your mission and budget.',
    cta: 'Find grants',
  },
  {
    actionId: 'category_draft_report',
    text: 'Draft a Report',
    value: 'Draft a Report',
    description: 'Turn a line about your impact into a ready-to-send report.',
    cta: 'Draft report',
  },
  {
    actionId: 'category_track_deadline',
    text: 'Track a Deadline',
    value: 'Track a Deadline',
    description: "I'll remember a due date and nudge your team before it's here.",
    cta: 'Track deadline',
  },
  {
    actionId: 'category_summarize_meeting',
    text: 'Summarize Meeting Notes',
    value: 'Summarize Meeting Notes',
    description: 'Paste notes and get a clean summary with decisions and action items.',
    cta: 'Summarize',
  },
  {
    actionId: 'category_donor_thankyou',
    text: 'Draft Donor Thank You',
    value: 'Draft Donor Thank You',
    description: 'Write a warm, genuine thank-you for your donors in seconds.',
    cta: 'Draft note',
  },
  {
    actionId: 'category_volunteer_announcement',
    text: 'Create Volunteer Announcement',
    value: 'Create Volunteer Announcement',
    description: 'Post a clear call for volunteers for an upcoming shift or event.',
    cta: 'Create post',
  },
];

/**
 * A time-of-day greeting, optionally personalized with the user's first name.
 * @param {Date} now - Server time (injected so the greeting is testable).
 * @param {string} [firstName] - The user's first name, if it could be fetched.
 * @returns {string}
 */
export function greeting(now, firstName) {
  const hour = now.getHours();
  const partOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const name = (firstName || '').trim();
  return name ? `Good ${partOfDay}, ${name}!` : `Good ${partOfDay}!`;
}

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
 * This org type's operational-language prompt rows: the tailored prompts, plus a
 * separate row of RTS-grounded prompts (framed to search the team's own channels)
 * when the type defines them. Clicking a prompt runs it via the shared
 * prompt_run_ handler, which opens a DM from the Home tab. Emoji-free by design.
 * @param {import('../org-types.js').OrgType} org
 * @returns {import('@slack/types').KnownBlock[]}
 */
function tailoredPromptBlocks(org) {
  /** @type {import('@slack/types').KnownBlock[]} */
  const blocks = [section('*A few things I can do for you*')];
  blocks.push(buildPromptButtons(org.tailoredPrompts, 'home_tailored_prompts'));

  if (org.rtsPrompts?.length) {
    // Offset the action_ids past the tailored ones so both rows coexist in the view.
    blocks.push(buildPromptButtons(org.rtsPrompts, 'home_rts_prompts', org.tailoredPrompts.length));
    blocks.push(context("These search your team's own channels, so answers reflect what people actually said."));
  }
  blocks.push(divider());
  return blocks;
}

/**
 * The six actions as "card" section blocks: each a bold title with a one-line
 * description and a button accessory. The org's #1 action leads and is the only
 * card with a primary button; dividers sit between cards to group them.
 * @param {import('../org-types.js').OrgType} org
 * @returns {import('@slack/types').KnownBlock[]}
 */
function actionCards(org) {
  const ordered = orderedActions(org);

  /** @type {import('@slack/types').KnownBlock[]} */
  const blocks = [];
  ordered.forEach((cat, i) => {
    // A divider before every card except the first — grouping, not a wall of lines.
    if (i > 0) blocks.push(divider());

    const accessory = button({
      text: cat.cta,
      actionId: cat.actionId,
      value: cat.value,
      // Exactly one primary button in the view: the org's most-used action.
      ...(i === 0 ? { style: 'primary' } : {}),
    });
    const card = section(`*${cat.text}*\n${cat.description}`, accessory);
    // Stable block_id on the leading card so tests/handlers can find the grid.
    if (i === 0) card.block_id = 'quick_actions_1';
    blocks.push(card);
  });
  return blocks;
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
 * org-type picker. After onboarding: a personalized greeting, the six actions as
 * cards (the org's #1 action leading, styled primary), and a light footer with
 * the change-organization control and how to reach Benvu.
 *
 * @param {string | null} [_botUserId] - Unused; kept so existing call sites stay unchanged.
 * @param {string | null} [orgType] - The user's stored org type id, if any.
 * @param {{ firstName?: string, now?: Date, notice?: string, closingSoon?: { count: number, label: string } | null }} [opts] -
 *   Personalization: the user's first name (for the greeting), the current time
 *   (injected for testability), a transient `notice` banner shown once at the top,
 *   and an optional live `closingSoon` count ({ count, label }) that renders one
 *   informational context line — omitted entirely when null/absent.
 * @returns {import('@slack/types').HomeView}
 */
export function buildAppHomeView(_botUserId = null, orgType = null, opts = {}) {
  const org = getOrgTypeById(orgType);
  const notice = (opts.notice || '').trim();

  if (!org) {
    // First open — one clear setup question, then the picker.
    /** @type {import('@slack/types').KnownBlock[]} */
    const blocks = [header('Benvu'), section(TAGLINE)];
    blocks.push(divider());
    blocks.push(section('First, what kind of organization are you? Pick one so I can tailor my suggestions.'));
    blocks.push(...orgTypeRows());
    blocks.push(context('You can also just message me anytime, in any language.'));
    return { type: 'home', blocks };
  }

  // Onboarded — a warm greeting, the action cards, then a receding footer.
  const now = opts.now instanceof Date ? opts.now : new Date();

  /** @type {import('@slack/types').KnownBlock[]} */
  const blocks = [header(greeting(now, opts.firstName))];
  // A transient confirmation banner, shown once at the top after a Home action.
  if (notice) {
    blocks.push(section(notice), divider());
  }
  blocks.push(section(TAGLINE));
  // Optional live "closing soon" line — strictly additive, present only when the
  // count came back in time. Rendered as a plain context line, never a button.
  const closingSoon = opts.closingSoon;
  if (closingSoon && closingSoon.count > 0) {
    const grants = closingSoon.count === 1 ? 'grant' : 'grants';
    blocks.push(context(`${closingSoon.count} ${closingSoon.label} ${grants} closing in the next 30 days.`));
  }
  blocks.push(divider());

  blocks.push(...tailoredPromptBlocks(org));
  blocks.push(...actionCards(org));

  // Footer: the change-org control (a button can't live in a context block, so it
  // stays a plain, un-styled actions block), then the lighter context lines.
  blocks.push(divider());
  blocks.push(
    actions('org_settings', [
      button({ text: 'Change organization type', actionId: CHANGE_ORG_ACTION, value: CHANGE_ORG_VALUE }),
    ]),
  );
  blocks.push(context(`Tailored for ${org.label}.`, REACH_LINE));

  return { type: 'home', blocks };
}
