import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// Grants.gov public Search API — free, no API key required.
// search2 returns matching opportunities (title, agency, close date) but NOT
// award amounts; fetchOpportunity returns the funding detail for one opportunity.
const SEARCH_URL = 'https://api.grants.gov/v1/api/search2';
const DETAIL_URL = 'https://api.grants.gov/v1/api/fetchOpportunity';
const LISTING_URL = 'https://www.grants.gov/search-results-detail/';

// Map a plain-language category to a Grants.gov funding-category code. Applied as
// a server-side filter, which sharpens results a lot. Unmatched categories are ignored.
/** @type {Record<string, string>} */
const CATEGORY_CODES = {
  education: 'ED',
  health: 'HL',
  environment: 'ENV',
  arts: 'AR',
  humanities: 'HU',
  housing: 'HO',
  food: 'FN',
  nutrition: 'FN',
  employment: 'ELT',
  labor: 'ELT',
  training: 'ELT',
  community: 'CD',
  'community development': 'CD',
  agriculture: 'AG',
  energy: 'EN',
  science: 'ST',
  technology: 'ST',
  'income security': 'ISS',
  social: 'ISS',
  disaster: 'DPR',
  law: 'LJL',
  justice: 'LJL',
  'natural resources': 'NR',
  business: 'BC',
  transportation: 'T',
};

/**
 * The set of funding-category codes we know Grants.gov accepts (every code this
 * app can produce). Used to drop a bad or stale org-default code before it
 * reaches the API, so a typo falls back to an unfiltered search instead of a
 * wrong filter.
 * @type {Set<string>}
 */
const KNOWN_CATEGORY_CODES = new Set(Object.values(CATEGORY_CODES));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Description and schema, shared so the tool behaves identically wherever it's built. */
export const FIND_GRANTS_DESCRIPTION =
  'Search real, currently-open U.S. federal grant opportunities from the free Grants.gov API. ' +
  'Use this whenever a user asks about grants or funding. Extract the search terms from what ' +
  'the user said and pass them as structured arguments. Note: Grants.gov only lists federal ' +
  '(nationwide) grants, so it cannot filter by city or state.';

export const FIND_GRANTS_SCHEMA = {
  query: z
    .string()
    .describe(
      'The main topic keywords to search, e.g. "youth education". Put only the subject here — not a location or a dollar amount.',
    ),
  category: z
    .string()
    .optional()
    .describe(
      'A funding category if the user named one, e.g. "education", "health", "environment", "arts", "housing".',
    ),
  location: z
    .string()
    .optional()
    .describe(
      'A place the user mentioned, if any. Informational only — Grants.gov lists federal grants nationwide and cannot filter by location.',
    ),
  maxAmount: z
    .number()
    .optional()
    .describe('Maximum award amount in US dollars if the user gave one (e.g. 50000 for "under $50k").'),
};

/**
 * A single structured grant result, used to render native grant cards.
 * @typedef {Object} GrantResult
 * @property {string} title
 * @property {string} url
 * @property {string} agency
 * @property {string} [category]
 * @property {number | null} amount     Award amount in USD, or null if not listed.
 * @property {string} deadline          Display date, e.g. "Aug 9, 2026".
 * @property {string} [deadlineIso]     ISO date (YYYY-MM-DD) for tracking, if known.
 */

/**
 * POST JSON to a URL with a timeout. Throws on network error, timeout, or non-2xx.
 * @param {string} url
 * @param {Record<string, unknown>} body
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
async function postJson(url, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse a Grants.gov numeric string (e.g. "220000") into a number, or null.
 * @param {unknown} value
 * @returns {number | null}
 */
function toAmount(value) {
  if (value == null) return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** @param {number} n */
function formatUsd(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Clean stray markup/whitespace that Grants.gov titles sometimes carry. @param {string} title */
function cleanTitle(title) {
  return title
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reformat a Grants.gov "MM/DD/YYYY" date as "Aug 9, 2026". @param {string} date */
function formatDeadline(date) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date || '');
  if (!m) return date || 'Not listed';
  const month = MONTHS[Number(m[1]) - 1] ?? m[1];
  return `${month} ${Number(m[2])}, ${m[3]}`;
}

/** Convert a Grants.gov "MM/DD/YYYY" date to ISO "YYYY-MM-DD", or undefined. @param {string} date */
function isoDeadline(date) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date || '');
  return m ? `${m[3]}-${m[1]}-${m[2]}` : undefined;
}

/**
 * Search Grants.gov and return BOTH the structured results (for native cards)
 * and the formatted text (unchanged — this is exactly what the model sees, so
 * the agent's prose is unaffected).
 * @param {{ query: string, category?: string, location?: string, maxAmount?: number, defaultCategoryCodes?: string[] }} args
 *   `category` is the user's plain-language category (mapped to one code and it
 *   wins when present). `defaultCategoryCodes` are Kala's default arts and culture
 *   Grants.gov codes (primary first), used only when the user named no category.
 * @returns {Promise<{ grants: GrantResult[], text: string }>}
 */
export async function searchGrants({ query, category, location, maxAmount, defaultCategoryCodes }) {
  try {
    // 1. Resolve the funding-category filter. An explicit user category wins;
    // otherwise fall back to the arts and culture defaults. Drop unknown codes
    // (logged) so a bad code becomes an unfiltered search, never a wrong filter.
    const userCode = category ? CATEGORY_CODES[category.trim().toLowerCase()] : undefined;
    const requested = userCode ? [userCode] : (defaultCategoryCodes ?? []);
    const codes = requested.filter((c) => {
      if (KNOWN_CATEGORY_CODES.has(c)) return true;
      console.warn(`[find_grants] dropping unknown funding-category code: ${c}`);
      return false;
    });

    /** @type {Record<string, unknown>} */
    const body = { keyword: query, oppStatuses: 'posted', rows: 25 };
    // Grants.gov Search2 accepts a pipe-delimited list (OR across categories).
    if (codes.length) body.fundingCategories = codes.join('|');

    let search = await postJson(SEARCH_URL, body, 12000);
    if (search?.errorcode !== 0) throw new Error(search?.msg || 'search failed');

    /** @type {any[]} */
    let hits = search?.data?.oppHits ?? [];
    // If the category filter zeroed out the results, retry without it.
    if (hits.length === 0 && codes.length) {
      delete body.fundingCategories;
      search = await postJson(SEARCH_URL, body, 12000);
      hits = search?.data?.oppHits ?? [];
    }

    if (hits.length === 0) {
      return {
        grants: [],
        text: `I couldn't find any open grants matching "${query}" on Grants.gov right now. Try different or broader keywords.`,
      };
    }

    // 2. Enrich the top candidates with award amounts (one detail call each).
    const candidates = hits.slice(0, 10);
    const details = await Promise.all(
      candidates.map((/** @type {any} */ h) =>
        postJson(DETAIL_URL, { opportunityId: String(h.id) }, 10000).catch(() => null),
      ),
    );

    /** @type {GrantResult[]} */
    const enriched = candidates.map((h, i) => {
      const syn = details[i]?.data?.synopsis ?? {};
      const amount = toAmount(syn.awardCeiling) ?? toAmount(syn.estimatedFunding) ?? toAmount(syn.awardFloor);
      return {
        title: cleanTitle(h.title || 'Untitled opportunity'),
        agency: h.agency || 'Unknown agency',
        category,
        deadline: formatDeadline(h.closeDate),
        deadlineIso: isoDeadline(h.closeDate),
        amount,
        url: `${LISTING_URL}${h.id}`,
      };
    });

    // 3. Apply the max-amount filter client-side (the API has no amount filter).
    // Prefer grants known to be within budget; fall back to unknown-amount ones.
    let picked = enriched;
    if (typeof maxAmount === 'number') {
      const withinBudget = enriched.filter((g) => g.amount != null && g.amount <= maxAmount);
      const unknown = enriched.filter((g) => g.amount == null);
      picked = [...withinBudget, ...unknown];
      if (picked.length === 0) {
        return {
          grants: [],
          text: `I found open grants for "${query}", but none with a listed award at or under ${formatUsd(maxAmount)}. Want me to show them without the budget limit?`,
        };
      }
    }

    const results = picked.slice(0, 5);

    // 4. Format cleanly. Kala will present this in the user's language.
    const lines = results.map((g, i) => {
      const amount = g.amount != null ? `up to ${formatUsd(g.amount)}` : 'not listed';
      return `${i + 1}. *${g.title}*\n   Agency: ${g.agency}\n   Award: ${amount} · Closes: ${g.deadline}\n   ${g.url}`;
    });

    const notes = [];
    if (typeof maxAmount === 'number')
      notes.push(`Filtered to awards at or under ${formatUsd(maxAmount)} where an amount was listed.`);
    if (location) notes.push(`Grants.gov lists federal grants nationwide, so results aren't limited to ${location}.`);

    const header = `Here ${results.length === 1 ? 'is 1 open grant' : `are ${results.length} open grants`} for "${query}" from Grants.gov:`;
    return { grants: picked, text: [header, lines.join('\n\n'), notes.join(' ')].filter(Boolean).join('\n\n') };
  } catch {
    return {
      grants: [],
      text: "I couldn't reach the Grants.gov database just now — it may be temporarily down. Please try again in a few minutes.",
    };
  }
}

/**
 * Build the find_grants tool. `onResults` receives the structured grants each
 * time the tool runs, so the caller can render native cards. The text returned
 * to the model is unchanged, so the agent's reasoning and prose are unaffected.
 * `defaultCategoryCodes` are the arts and culture Grants.gov defaults, applied
 * only when the user's query names no category of its own.
 * @param {(grants: GrantResult[]) => void} [onResults]
 * @param {string[]} [defaultCategoryCodes]
 */
export function createFindGrantsTool(onResults, defaultCategoryCodes) {
  return tool('find_grants', FIND_GRANTS_DESCRIPTION, FIND_GRANTS_SCHEMA, async (args) => {
    const { grants, text } = await searchGrants({ ...args, defaultCategoryCodes });
    if (onResults) onResults(grants);
    return { content: [{ type: 'text', text }] };
  });
}

/** Default find_grants tool with no result capture (structure is discarded). */
export const findGrantsTool = createFindGrantsTool();
