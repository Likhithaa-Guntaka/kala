import { detectLanguage, grantLabels } from '../i18n.js';
import { button, context, divider, section, sectionFields, truncate } from './kit.js';

/** Action ID for the per-grant "Track deadline" button. */
export const GRANT_TRACK_ACTION = 'grant_track_deadline';

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
 * Render structured grant results as native cards: one section per grant with a
 * bold linked title and a Track-deadline accessory, a fields row for amount and
 * deadline, and an agency/category context line. Dividers between grants, a
 * source line at the end, and a "+N more" note when truncated.
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

    // Title line, with a Track-deadline button when we have a real due date.
    const titleText = `*<${g.url}|${g.title}>*`;
    const accessory = g.deadlineIso
      ? button({ text: L.trackDeadline, actionId: GRANT_TRACK_ACTION, value: trackValue(g) })
      : undefined;
    blocks.push(section(titleText, accessory));

    blocks.push(
      sectionFields([
        [L.amount, amountText(g.amount, L)],
        [L.deadline, g.deadline || L.notListed],
      ]),
    );

    const meta = [`${L.agency}: ${g.agency}`];
    if (g.category) meta.push(`${L.category}: ${g.category}`);
    blocks.push(context(meta.join(' · ')));
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
