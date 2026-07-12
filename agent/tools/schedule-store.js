/**
 * In-memory store of schedule changes and who has acknowledged them.
 *
 * This is the persistence half of Kala's schedule-change tracker (for tech week,
 * install week, and other crunch periods): the `track_schedule_change`,
 * `acknowledge_change`, and `schedule_status` tools (in `agent/kala.js`), the
 * "Acknowledge" button handler (`listeners/actions/schedule-buttons.js`), and the
 * reaction handler (`listeners/events/reaction-added.js`) read and write here.
 * Same process-local Map pattern as the other stores; changes are scoped to a
 * Slack channel.
 *
 * Process-local — resets on restart. Back it with a database for production.
 *
 * @typedef {Object} RosterEntry
 * @property {string} key        Dedupe key: the Slack user id when known, else the lowercased name.
 * @property {string} display    How to show them (a Slack mention or a plain name).
 * @property {string} [id]       Slack user id, when this person is a mention.
 * @property {boolean} acked     Whether they have acknowledged.
 * @property {string} [ackedAt]  ISO date they acknowledged.
 *
 * @typedef {Object} ScheduleChange
 * @property {string} id                 Stable id, e.g. "CHG-1".
 * @property {string} channelId          Slack channel the change is tracked in.
 * @property {string} createdBy          Slack user id who posted it.
 * @property {string} change             The schedule-change text everyone must acknowledge.
 * @property {RosterEntry[]} roster      Who must confirm, and whether they have.
 * @property {{ channel: string, ts: string }} [messageRef] The posted ack card, for reaction matching and in-place updates.
 * @property {string} createdAt          ISO date created.
 */

/** @type {Map<string, ScheduleChange>} */
const changes = new Map();
let nextId = 1;

/** ISO YYYY-MM-DD for an epoch-ms clock. @param {number} nowMs @returns {string} */
function isoDate(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Normalize a person reference (a Slack mention, a bare user id, or a plain name)
 * into a roster entry shape (not yet acknowledged).
 * @param {string} raw
 * @returns {{ key: string, display: string, id?: string }}
 */
export function personFromString(raw) {
  const s = (raw || '').trim();
  const m = /<@([A-Z0-9]+)(?:\|[^>]*)?>/.exec(s) || /^([UW][A-Z0-9]{2,})$/.exec(s);
  if (m) return { key: m[1], display: `<@${m[1]}>`, id: m[1] };
  return { key: s.toLowerCase(), display: s };
}

/**
 * Track a new schedule change with the roster of people who must acknowledge.
 * @param {Object} input
 * @param {string} input.change
 * @param {string[]} [input.people]  Slack mentions / ids / names who must confirm.
 * @param {string} [input.channelId]
 * @param {string} [input.createdBy]
 * @param {number} [input.now]
 * @returns {ScheduleChange}
 */
export function addScheduleChange({ change, people = [], channelId, createdBy, now = Date.now() }) {
  const id = `CHG-${nextId++}`;
  /** @type {RosterEntry[]} */
  const roster = [];
  for (const raw of people) {
    const p = personFromString(raw);
    if (!p.key) continue;
    if (roster.some((r) => r.key === p.key)) continue; // dedupe
    roster.push({ ...p, acked: false });
  }
  /** @type {ScheduleChange} */
  const record = {
    id,
    channelId: channelId || 'unknown',
    createdBy: createdBy || 'unknown',
    change: change.trim(),
    roster,
    createdAt: isoDate(now),
  };
  changes.set(id, record);
  return record;
}

/** Look up a schedule change by id. @param {string} id @returns {ScheduleChange | undefined} */
export function getScheduleChange(id) {
  return changes.get(id);
}

/** Remember the posted ack-card message, so reactions on it can be matched. @param {string} id @param {{channel: string, ts: string}} ref */
export function setMessageRef(id, ref) {
  const record = changes.get(id);
  if (record) record.messageRef = ref;
}

/**
 * All schedule changes for a channel (most recent first).
 * @param {string} channelId
 * @returns {ScheduleChange[]}
 */
export function listScheduleChanges(channelId) {
  return Array.from(changes.values())
    .filter((c) => c.channelId === channelId)
    .sort((a, b) => (a.id < b.id ? 1 : -1));
}

/**
 * Find schedule changes in a channel by id or change-text substring. Empty query
 * returns all.
 * @param {string} channelId
 * @param {string} [query]
 * @returns {ScheduleChange[]}
 */
export function findScheduleChanges(channelId, query) {
  const q = (query || '').trim().toLowerCase();
  const all = listScheduleChanges(channelId);
  if (!q) return all;
  return all.filter((c) => c.id.toLowerCase() === q || c.change.toLowerCase().includes(q));
}

/** The schedule change whose posted card is this message, or undefined. @param {string} channel @param {string} ts */
export function findByMessage(channel, ts) {
  return Array.from(changes.values()).find((c) => c.messageRef?.channel === channel && c.messageRef?.ts === ts);
}

/**
 * Record an acknowledgment. Matches an existing roster entry by Slack id or name;
 * if the acknowledger isn't on the roster, they're added as a confirmed extra (so
 * they count as confirmed but never inflate the "still waiting" list). A repeat
 * acknowledgment is a no-op.
 * @param {string} id
 * @param {{ userId?: string, name?: string }} who
 * @param {number} [now]
 * @returns {{ record: ScheduleChange, entry: RosterEntry, newlyAcked: boolean, wasListed: boolean } | null}
 */
export function acknowledge(id, { userId, name }, now = Date.now()) {
  const record = changes.get(id);
  if (!record) return null;
  const target = userId ? { key: userId, display: `<@${userId}>`, id: userId } : personFromString(name || '');
  if (!target.key) return null;

  let entry = record.roster.find((r) => r.key === target.key || (target.id && r.id === target.id));
  const wasListed = !!entry;
  if (!entry) {
    entry = { ...target, acked: false };
    record.roster.push(entry);
  }
  const newlyAcked = !entry.acked;
  if (newlyAcked) {
    entry.acked = true;
    entry.ackedAt = isoDate(now);
  }
  return { record, entry, newlyAcked, wasListed };
}

/** Roster entries who still have not acknowledged. @param {ScheduleChange} record @returns {RosterEntry[]} */
export function pending(record) {
  return record.roster.filter((r) => !r.acked);
}

/** Roster entries who have acknowledged. @param {ScheduleChange} record @returns {RosterEntry[]} */
export function confirmed(record) {
  return record.roster.filter((r) => r.acked);
}

/**
 * Acknowledgment tallies and name lists for a change.
 * @param {ScheduleChange} record
 * @returns {{ id: string, change: string, total: number, acked: number, pending: string[], confirmed: string[] }}
 */
export function ackSummary(record) {
  const done = confirmed(record);
  const waiting = pending(record);
  return {
    id: record.id,
    change: record.change,
    total: record.roster.length,
    acked: done.length,
    pending: waiting.map((r) => r.display),
    confirmed: done.map((r) => r.display),
  };
}

/** Clear all schedule changes. Test helper. @returns {void} */
export function _resetScheduleChanges() {
  changes.clear();
  nextId = 1;
}
