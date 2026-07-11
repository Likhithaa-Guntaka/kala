import { detectLanguage, grantLabels } from '../i18n.js';
import { button, context, divider, section, sectionFields, truncate } from './kit.js';

/** Action ID for the per-grant "Track deadline" button. */
export const GRANT_TRACK_ACTION = 'grant_track_deadline';

/** Action ID for the per-grant "View opportunity" fallback (URL) button. */
export const GRANT_VIEW_ACTION = 'grant_view_opportunity';

/** How many cards to show before collapsing the rest into a "+N more" line. */
const DEFAULT_LIMIT = 5;

/** Format a USD amount, or the localized "not listed". @param {number|null} amount @param {import('../i18n.js').GrantLabels} L */
function amountText(amount, L) {
  return typeof amount === 'number' ? `$${Math.round(amount).toLocaleString('en-US')}` : L.notListed;
}

/**
 * The value carried by a Track-deadline button: the grant title and its ISO due
 * date, so the handler can register the deadline without another lookup.
 * @param {import('../../agent/tools/grant-finder.js').GrantResult} g
 * @returns {string}
 */
export function trackValue(g) {
  return JSON.stringify({ t: truncate(g.title, 180), d: g.deadlineIso });
}

/**
 * Choose a grant card's title accessory: the Track-deadline button when we have
 * a real due date, else a plain "View opportunity" link when we have a url, else
 * none.
 * @param {import('../../agent/tools/grant-finder.js').GrantResult} g
 * @param {import('../i18n.js').GrantLabels} L
 * @returns {import('@slack/types').Button | undefined}
 */
function cardAccessory(g, L) {
  if (g.deadlineIso) {
    return button({ text: L.trackDeadline, actionId: GRANT_TRACK_ACTION, value: trackValue(g) });
  }
  if (g.url) {
    return button({ text: L.viewOpportunity, actionId: GRANT_VIEW_ACTION, url: g.url });
  }
  return undefined;
}

/**
 * Render structured grant results as native cards: one section per grant with a
 * bold linked title and an accessory button, then a 2x2 fields grid
 * (Amount | Deadline / Agency | Category). Category is omitted gracefully when
 * absent, so Agency renders alone rather than as a blank cell. Dividers between
 * grants, a source line at the end, and a "+N more" note when truncated.
 *
 * All static labels follow `language` so the cards match the agent's localized
 * prose. Grant titles, agency names, and amounts come from the API as-is.
 *
 * @param {import('../../agent/tools/grant-finder.js').GrantResult[]} grants
 * @param {{ language?: string, limit?: number }} [opts]
 * @returns {import('@slack/types').KnownBlock[]}
 */
export function buildGrantResults(grants, { language, limit = DEFAULT_LIMIT } = {}) {
  const L = grantLabels(language);
  const shown = grants.slice(0, limit);

  /** @type {import('@slack/types').KnownBlock[]} */
  const blocks = [];

  shown.forEach((g, i) => {
    if (i > 0) blocks.push(divider());

    blocks.push(section(`*<${g.url}|${g.title}>*`, cardAccessory(g, L)));

    // 2x2 grid: Amount | Deadline / Agency | Category. Category is only added
    // when present, so a card without one shows Agency alone (no blank cell).
    /** @type {Array<[string, string]>} */
    const fields = [
      [L.amount, amountText(g.amount, L)],
      [L.deadline, g.deadline || L.notListed],
      [L.agency, g.agency],
    ];
    if (g.category) fields.push([L.category, g.category]);
    blocks.push(sectionFields(fields));
  });

  const remaining = grants.length - shown.length;
  const footer = remaining > 0 ? `${L.via} · ${L.more(remaining)}` : L.via;
  blocks.push(divider());
  blocks.push(context(footer));

  return blocks;
}

/**
 * Convenience for reply surfaces: grant cards localized to the language of the
 * user's message, or an empty array when there are no grants.
 * @param {import('../../agent/tools/grant-finder.js').GrantResult[]} grants
 * @param {string} userText - The user's message, used to detect the language.
 * @returns {import('@slack/types').KnownBlock[]}
 */
export function grantCardsFor(grants, userText) {
  if (!grants || grants.length === 0) return [];
  return buildGrantResults(grants, { language: detectLanguage(userText) });
}
