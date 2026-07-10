/**
 * In-memory store of NEA-style 1:1 nonfederal match progress.
 *
 * Keyed by channel + user (NOT thread) on purpose: a match campaign runs across
 * many conversations, so progress must survive from one thread to the next.
 * Process-local — resets on restart, same as the deadline store.
 *
 * Values are stored as absolute totals (the running "raised so far"), never as
 * increments, so a repeated or out-of-order update can't double-count.
 *
 * @typedef {Object} MatchRecord
 * @property {number} required  Nonfederal match required. For a 1:1 match this equals the grant amount.
 * @property {number} raised    Match raised so far, as an absolute total.
 * @property {string} [campaign] What the match is for, if named.
 * @property {number} timestamp
 */

/** @type {Map<string, MatchRecord>} */
const matches = new Map();

/** @param {string} channelId @param {string} userId */
const keyFor = (channelId, userId) => `${channelId}:${userId}`;

/**
 * Create or update the match record for a channel+user, merging in only the
 * fields provided (so "set required" and "set raised" can arrive separately).
 * @param {Object} input
 * @param {string} input.channelId
 * @param {string} input.userId
 * @param {number} [input.required]
 * @param {number} [input.raised]
 * @param {string} [input.campaign]
 * @returns {MatchRecord}
 */
export function setMatch({ channelId, userId, required, raised, campaign }) {
  const k = keyFor(channelId, userId);
  const prev = matches.get(k);
  /** @type {MatchRecord} */
  const record = {
    required: required ?? prev?.required ?? 0,
    raised: raised ?? prev?.raised ?? 0,
    campaign: campaign ?? prev?.campaign,
    timestamp: Date.now(),
  };
  matches.set(k, record);
  return record;
}

/**
 * The stored match record for a channel+user, or null if none.
 * @param {Object} input
 * @param {string} input.channelId
 * @param {string} input.userId
 * @returns {MatchRecord | null}
 */
export function getMatch({ channelId, userId }) {
  return matches.get(keyFor(channelId, userId)) ?? null;
}

/**
 * Derive display figures from a record: how much is left and what fraction is
 * covered. `percent` is null when nothing is required yet (avoids divide-by-zero).
 * @param {MatchRecord | null} record
 * @returns {{ required: number, raised: number, remaining: number, percent: number | null, campaign?: string } | null}
 */
export function matchStatus(record) {
  if (!record) return null;
  const required = record.required ?? 0;
  const raised = record.raised ?? 0;
  return {
    required,
    raised,
    remaining: Math.max(0, required - raised),
    percent: required > 0 ? Math.round((raised / required) * 100) : null,
    campaign: record.campaign,
  };
}

/** Clear all match records. Test helper. */
export function _resetMatches() {
  matches.clear();
}
