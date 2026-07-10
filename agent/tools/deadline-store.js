/**
 * In-memory store of tracked grant/compliance deadlines.
 *
 * This is the persistence half of Benvu's deadline feature: `track_deadline`
 * (in `agent/benvu.js`) writes here, and the background scheduler (in
 * `agent/deadline-scheduler.js`) reads `getDueDeadlines()` to post Slack nudges.
 *
 * NOTE: process-local — resets on restart. Back it with a database (or the
 * SessionStore pattern in `thread-context/`) for production.
 */

/**
 * @typedef {Object} TrackedDeadline
 * @property {string} id
 * @property {string} title           What is due (grant/report/filing name).
 * @property {string} dueDate         ISO date (YYYY-MM-DD) the item is due.
 * @property {number} remindDaysBefore Days before dueDate to send the nudge.
 * @property {string} channelId       Slack channel to post the reminder to.
 * @property {string} createdBy       Slack user id who registered it.
 * @property {string} [owner]         Who is responsible (Slack handle or id), if given.
 * @property {string} [notes]         Extra context to include in the reminder.
 * @property {boolean} notified       Whether a reminder has already been sent.
 * @property {string} [remindAfter]   ISO date; when snoozed, don't nudge again before this.
 */

/** @type {Map<string, TrackedDeadline>} */
const deadlines = new Map();
let nextId = 1;

/**
 * Register a deadline to be reminded about.
 * @param {Object} input
 * @param {string} input.title
 * @param {string} input.dueDate           ISO YYYY-MM-DD.
 * @param {number} [input.remindDaysBefore] Default 7.
 * @param {string} [input.channelId]        Default 'unknown' (won't be nudged).
 * @param {string} [input.createdBy]        Default 'unknown'.
 * @param {string} [input.owner]
 * @param {string} [input.notes]
 * @returns {TrackedDeadline}
 */
export function addDeadline({ title, dueDate, remindDaysBefore = 7, channelId, createdBy, owner, notes }) {
  const id = `DL-${nextId++}`;
  /** @type {TrackedDeadline} */
  const record = {
    id,
    title,
    dueDate,
    remindDaysBefore,
    channelId: channelId || 'unknown',
    createdBy: createdBy || 'unknown',
    owner,
    notes,
    notified: false,
  };
  deadlines.set(id, record);
  return record;
}

/**
 * All tracked deadlines.
 * @returns {TrackedDeadline[]}
 */
export function listDeadlines() {
  return Array.from(deadlines.values());
}

/**
 * Deadlines whose title, owner, or notes mention `subject` (case-insensitive).
 * Used by prep_briefing to surface what's coming up for a person or org.
 * @param {string} subject
 * @returns {TrackedDeadline[]}
 */
export function findDeadlines(subject) {
  const q = (subject || '').trim().toLowerCase();
  if (!q) return [];
  return listDeadlines().filter((d) =>
    [d.title, d.owner, d.notes].some((f) => typeof f === 'string' && f.toLowerCase().includes(q)),
  );
}

/**
 * Whole days from today until an ISO due date. Negative means overdue.
 * @param {string} dueDate ISO YYYY-MM-DD.
 * @returns {number}
 */
export function daysUntil(dueDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Deadlines that should be nudged now: not yet notified, posted to a real
 * channel, and within (or past) their reminder window.
 * @returns {TrackedDeadline[]}
 */
export function getDueDeadlines() {
  return listDeadlines().filter(
    (d) =>
      !d.notified &&
      d.channelId !== 'unknown' &&
      daysUntil(d.dueDate) <= d.remindDaysBefore &&
      (!d.remindAfter || daysUntil(d.remindAfter) <= 0),
  );
}

/**
 * Mark a deadline as reminded so it is not nudged again.
 * @param {string} id
 */
export function markNotified(id) {
  const record = deadlines.get(id);
  if (record) record.notified = true;
}

/**
 * Look up a single deadline.
 * @param {string} id
 * @returns {TrackedDeadline | undefined}
 */
export function getDeadline(id) {
  return deadlines.get(id);
}

/**
 * Mark a deadline done — remove it so it is never nudged again.
 * @param {string} id
 * @returns {boolean} whether a deadline was removed
 */
export function resolveDeadline(id) {
  return deadlines.delete(id);
}

/**
 * Snooze a deadline: re-arm it and suppress reminders until `days` from today.
 * @param {string} id
 * @param {number} [days] Default 1.
 * @returns {TrackedDeadline | undefined} the updated record, if found
 */
export function snoozeDeadline(id, days = 1) {
  const record = deadlines.get(id);
  if (!record) return undefined;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + days);
  record.remindAfter = t.toISOString().slice(0, 10);
  record.notified = false;
  return record;
}

/** Clear all deadlines. Test helper. */
export function _resetDeadlines() {
  deadlines.clear();
  nextId = 1;
}
