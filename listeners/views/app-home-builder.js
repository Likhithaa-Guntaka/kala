import { ARTS_CULTURE } from '../arts-culture.js';
import { button, context, divider, header, section } from './kit.js';
import { buildPromptButtons } from './onboarding-builder.js';

/**
 * @typedef {Object} Category
 * @property {string} actionId
 * @property {string} text
 * @property {string} value
 * @property {string} description - One-line plain description shown under the card title.
 * @property {string} cta - Short button label for the card accessory (<= 75 chars).
 */

/** One-line tagline under the Kala name in the branded header. */
export const TAGLINE = 'Find arts funding, write reports, and hit every deadline, in any language.';

/** One-to-two line description of what Kala is and who it's for (branded header). */
export const DESCRIPTION =
  "I'm Kala, an AI teammate for arts and culture nonprofits. Tell me what you need, in any language, and " +
  "I'll find the grant, draft the report, or track the deadline.";

/** The full set of actions Kala can take from the Home tab. */
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
  {
    actionId: 'category_track_engagement',
    text: 'Track an Engagement',
    value: 'Track an Engagement',
    description: 'Track contracts, W-9s, and invoices for each artist or contractor.',
    cta: 'Track engagement',
  },
  {
    actionId: 'category_track_event',
    text: 'Track Event RSVPs',
    value: 'Track Event RSVPs',
    description: 'Collect RSVPs for a free event and get a live head count.',
    cta: 'Track RSVPs',
  },
  {
    actionId: 'category_track_schedule',
    text: 'Track a Schedule Change',
    value: 'Track a Schedule Change',
    description: 'Post a schedule change and track who has confirmed they saw it.',
    cta: 'Track change',
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

/** How people can reach Kala, shown as a footer context line. */
const REACH_LINE =
  'Reach me anytime: send a direct message, mention @Kala in a channel, or use /grant, /report, or /deadline.';

/**
 * Order the six actions with the arts and culture most-used ones first, so the
 * primary button is the action they're most likely to want.
 * @returns {Category[]}
 */
function orderedActions() {
  const primary = ARTS_CULTURE.primaryActions.map((id) => CATEGORIES.find((c) => c.actionId === id)).filter(Boolean);
  const rest = CATEGORIES.filter((c) => !ARTS_CULTURE.primaryActions.includes(c.actionId));
  return /** @type {Category[]} */ ([...primary, ...rest]);
}

/**
 * The arts and culture operational-language prompt rows: the tailored prompts,
 * plus a separate row of RTS-grounded prompts (framed to search the team's own
 * channels). Clicking a prompt runs it via the shared prompt_run_ handler, which
 * opens a DM from the Home tab. Emoji-free by design.
 * @returns {import('@slack/types').KnownBlock[]}
 */
function tailoredPromptBlocks() {
  /** @type {import('@slack/types').KnownBlock[]} */
  const blocks = [section('*A few things I can do for you*')];
  blocks.push(buildPromptButtons(ARTS_CULTURE.tailoredPrompts, 'home_tailored_prompts'));

  if (ARTS_CULTURE.rtsPrompts?.length) {
    // Offset the action_ids past the tailored ones so both rows coexist in the view.
    blocks.push(buildPromptButtons(ARTS_CULTURE.rtsPrompts, 'home_rts_prompts', ARTS_CULTURE.tailoredPrompts.length));
    blocks.push(context("These search your team's own channels, so answers reflect what people actually said."));
  }
  blocks.push(divider());
  return blocks;
}

/**
 * The six actions as "card" section blocks: each a bold title with a one-line
 * description and a button accessory. The #1 arts and culture action leads and is
 * the only card with a primary button; dividers sit between cards to group them.
 * @returns {import('@slack/types').KnownBlock[]}
 */
function actionCards() {
  const ordered = orderedActions();

  /** @type {import('@slack/types').KnownBlock[]} */
  const blocks = [];
  ordered.forEach((cat, i) => {
    // A divider before every card except the first — grouping, not a wall of lines.
    if (i > 0) blocks.push(divider());

    const accessory = button({
      text: cat.cta,
      actionId: cat.actionId,
      value: cat.value,
      // Exactly one primary button in the view: the most-used action.
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
 * The stable branded header: app name, tagline, and a short description, closed
 * with a divider. Identical for every user — the personalized content sits below
 * it. Emoji-free; the app avatar renders natively in Slack's Messages/DM header,
 * so the body needs no logo image.
 * @returns {import('@slack/types').KnownBlock[]}
 */
function brandHeaderBlocks() {
  return [header('Kala'), section(TAGLINE), section(DESCRIPTION), divider()];
}

/**
 * Build the App Home view — an Arts & Culture assistant from the first screen, no
 * selection step: a personalized greeting, the arts and culture prompt rows, the
 * six actions as cards (the #1 action leading, styled primary), and a light footer.
 *
 * @param {string | null} [_botUserId] - Unused; kept so existing call sites stay unchanged.
 * @param {{ firstName?: string, now?: Date, notice?: string, closingSoon?: { count: number, label: string } | null }} [opts] -
 *   Personalization: the user's first name (for the greeting), the current time
 *   (injected for testability), a transient `notice` banner shown once at the top,
 *   and an optional live `closingSoon` count ({ count, label }) that renders one
 *   informational context line — omitted entirely when null/absent.
 * @returns {import('@slack/types').HomeView}
 */
export function buildAppHomeView(_botUserId = null, opts = {}) {
  const notice = (opts.notice || '').trim();
  const now = opts.now instanceof Date ? opts.now : new Date();

  /** @type {import('@slack/types').KnownBlock[]} */
  // Stable branded header first (same for everyone), then the personalized body.
  const blocks = [...brandHeaderBlocks()];

  // Personalized greeting as a bold section — not a second header, so "Kala"
  // stays the largest element.
  blocks.push(section(`*${greeting(now, opts.firstName)}*`));

  // A transient confirmation banner, shown once after a Home action.
  if (notice) {
    blocks.push(section(notice));
  }

  // Optional live "closing soon" line — strictly additive, present only when the
  // count came back in time. Rendered as a plain context line, never a button.
  const closingSoon = opts.closingSoon;
  if (closingSoon && closingSoon.count > 0) {
    const grants = closingSoon.count === 1 ? 'grant' : 'grants';
    blocks.push(context(`${closingSoon.count} ${closingSoon.label} ${grants} closing in the next 30 days.`));
  }
  blocks.push(divider());

  blocks.push(...tailoredPromptBlocks());
  blocks.push(...actionCards());

  // Footer: a light reminder of how to reach Kala.
  blocks.push(divider());
  blocks.push(context(`Tailored for ${ARTS_CULTURE.label} nonprofits.`, REACH_LINE));

  return { type: 'home', blocks };
}
