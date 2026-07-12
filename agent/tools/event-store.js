/**
 * In-memory store of free events and their RSVPs / attendance.
 *
 * This is the persistence half of Kala's event RSVP tracker: the `track_event`,
 * `update_event`, and `event_status` tools (in `agent/kala.js`) and the RSVP
 * button handler (`listeners/actions/event-buttons.js`) read and write here. Same
 * process-local Map pattern as the deadline / match / engagement stores; events
 * are scoped to a Slack channel so a team shares one list.
 *
 * Process-local — resets on restart. Back it with a database (or the SessionStore
 * pattern in `thread-context/`) for production.
 *
 * @typedef {Object} Rsvp
 * @property {string} who        Display name for the attendee (a Slack mention or a plain name).
 * @property {string} [userId]   Slack user id, when the RSVP came from a button click.
 * @property {string} at         ISO date the RSVP was recorded.
 *
 * @typedef {Object} TrackedEvent
 * @property {string} id                 Stable id, e.g. "EVT-1".
 * @property {string} channelId          Slack channel the event is tracked in.
 * @property {string} createdBy          Slack user id who created it.
 * @property {string} title              Event name, e.g. "Gallery Opening".
 * @property {string} [date]             When it happens (ISO YYYY-MM-DD or a plain phrase), if given.
 * @property {Rsvp[]} rsvps              Confirmed attendees (deduped).
 * @property {number} [actualAttendance] Head count recorded after the event, if set.
 * @property {string} createdAt          ISO date created.
 */

/** @type {Map<string, TrackedEvent>} */
const events = new Map();
let nextId = 1;

/** ISO YYYY-MM-DD for an epoch-ms clock. @param {number} nowMs @returns {string} */
function isoDate(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Create a trackable event.
 * @param {Object} input
 * @param {string} input.title
 * @param {string} [input.date]
 * @param {string} [input.channelId]
 * @param {string} [input.createdBy]
 * @param {number} [input.now] Injected clock (epoch ms); defaults to Date.now().
 * @returns {TrackedEvent}
 */
export function addEvent({ title, date, channelId, createdBy, now = Date.now() }) {
  const id = `EVT-${nextId++}`;
  /** @type {TrackedEvent} */
  const record = {
    id,
    channelId: channelId || 'unknown',
    createdBy: createdBy || 'unknown',
    title: title.trim(),
    date: date?.trim() || undefined,
    rsvps: [],
    createdAt: isoDate(now),
  };
  events.set(id, record);
  return record;
}

/** Look up a single event by id. @param {string} id @returns {TrackedEvent | undefined} */
export function getEvent(id) {
  return events.get(id);
}

/**
 * All events for a channel (most recently created first).
 * @param {string} channelId
 * @returns {TrackedEvent[]}
 */
export function listEvents(channelId) {
  return Array.from(events.values())
    .filter((e) => e.channelId === channelId)
    .sort((a, b) => (a.id < b.id ? 1 : -1));
}

/**
 * Find events in a channel by id or title substring (case-insensitive). Empty
 * query returns all in-channel events.
 * @param {string} channelId
 * @param {string} [query]
 * @returns {TrackedEvent[]}
 */
export function findEvents(channelId, query) {
  const q = (query || '').trim().toLowerCase();
  const all = listEvents(channelId);
  if (!q) return all;
  return all.filter((e) => e.id.toLowerCase() === q || e.title.toLowerCase().includes(q));
}

/**
 * Add a confirmed attendee to an event, de-duplicated by Slack user id when
 * present, otherwise by (case-insensitive) name. A repeat RSVP is a no-op.
 * @param {string} id
 * @param {Object} who
 * @param {string} [who.userId]
 * @param {string} [who.who]  Display name; defaults to the mention of userId.
 * @param {number} [now] Injected clock (epoch ms); defaults to Date.now().
 * @returns {{ event: TrackedEvent, added: boolean } | null} null if the event is unknown.
 */
export function addRsvp(id, { userId, who }, now = Date.now()) {
  const event = events.get(id);
  if (!event) return null;
  const displayName = (who || (userId ? `<@${userId}>` : '')).trim();
  if (!displayName) return { event, added: false };

  const already = event.rsvps.some((r) =>
    userId ? r.userId === userId : r.who.toLowerCase() === displayName.toLowerCase(),
  );
  if (already) return { event, added: false };

  event.rsvps.push({ who: displayName, userId, at: isoDate(now) });
  return { event, added: true };
}

/**
 * Record the actual head count after the event (may differ from RSVPs).
 * @param {string} id
 * @param {number} count
 * @returns {TrackedEvent | undefined}
 */
export function setActualAttendance(id, count) {
  const event = events.get(id);
  if (!event) return undefined;
  event.actualAttendance = Math.max(0, Math.round(count));
  return event;
}

/** Number of confirmed RSVPs. @param {TrackedEvent} event @returns {number} */
export function rsvpCount(event) {
  return event.rsvps.length;
}

/**
 * A funder-report-ready attendance summary for one event: the confirmed RSVP
 * count, the recorded actual head count (if any), and the attendee display names.
 * @param {TrackedEvent} event
 * @returns {{ id: string, title: string, date?: string, confirmed: number, actual: number | null, names: string[] }}
 */
export function attendanceSummary(event) {
  return {
    id: event.id,
    title: event.title,
    date: event.date,
    confirmed: event.rsvps.length,
    actual: typeof event.actualAttendance === 'number' ? event.actualAttendance : null,
    names: event.rsvps.map((r) => r.who),
  };
}

/** Clear all events. Test helper. @returns {void} */
export function _resetEvents() {
  events.clear();
  nextId = 1;
}
