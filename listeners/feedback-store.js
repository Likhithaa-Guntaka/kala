// In-memory feedback log. Simple array for now; can be swapped for a durable
// store later without changing the callers.

/**
 * @typedef {Object} FeedbackEntry
 * @property {number} [id] - Assigned on record, so a later comment can be attached.
 * @property {string} user_id
 * @property {string} message_summary - Short summary of the user's message.
 * @property {string} response_summary - Short summary of Benvu's response.
 * @property {'up' | 'down'} rating
 * @property {string} [comment] - Optional "What went wrong?" note, only on 👎.
 * @property {string} timestamp - ISO 8601.
 */

/** @type {FeedbackEntry[]} */
const feedbackLog = [];

let nextFeedbackId = 1;

/**
 * Record a feedback entry immediately and return it (with an id), so a comment can
 * be attached later without losing the rating if the user never submits one.
 * @param {FeedbackEntry} entry
 * @returns {FeedbackEntry}
 */
export function recordFeedback(entry) {
  const stored = { id: nextFeedbackId++, ...entry };
  feedbackLog.push(stored);
  return stored;
}

/**
 * Attach an optional comment to an already-recorded entry. No-op for a blank
 * comment or an unknown id.
 * @param {number | undefined} id
 * @param {string} comment
 * @returns {FeedbackEntry | undefined}
 */
export function attachComment(id, comment) {
  if (!id || !comment) return undefined;
  const entry = feedbackLog.find((f) => f.id === id);
  if (entry) entry.comment = comment;
  return entry;
}

/**
 * All feedback entries (most recent last).
 * @returns {FeedbackEntry[]}
 */
export function getAllFeedback() {
  return feedbackLog;
}

/**
 * @typedef {Object} TimingEntry
 * @property {'grants' | 'report' | 'summary'} tool
 * @property {number} seconds - Measured response time in seconds.
 * @property {string} timestamp - ISO 8601.
 */

/** @type {TimingEntry[]} */
const timingLog = [];

/**
 * Record how long a timed response (grant search, report, or summary) took.
 * @param {TimingEntry} entry
 * @returns {void}
 */
export function recordTiming(entry) {
  timingLog.push(entry);
}

/** All recorded timings. @returns {TimingEntry[]} */
export function getTimings() {
  return timingLog;
}

/**
 * Aggregate counts and a few recent entries.
 * @returns {{ total: number, up: number, down: number, positivePct: number, recent: FeedbackEntry[] }}
 */
export function summarizeFeedback() {
  const total = feedbackLog.length;
  const up = feedbackLog.filter((f) => f.rating === 'up').length;
  const down = total - up;
  const positivePct = total === 0 ? 0 : Math.round((up / total) * 100);
  return { total, up, down, positivePct, recent: feedbackLog.slice(-5).reverse() };
}

/**
 * Render the feedback summary as Slack mrkdwn text.
 * @returns {string}
 */
export function formatFeedbackSummary() {
  const { total, up, down, positivePct, recent } = summarizeFeedback();
  if (total === 0) return '*Benvu feedback*\nNo feedback yet.';

  const lines = [
    '*Benvu feedback summary*',
    `Helpful: ${up}   Not helpful: ${down}   ${total} total (${positivePct}% positive)`,
  ];
  if (timingLog.length > 0) {
    const avg = Math.round(timingLog.reduce((sum, t) => sum + t.seconds, 0) / timingLog.length);
    lines.push(`${timingLog.length} timed responses, ~${avg}s average`);
  }
  if (recent.length > 0) {
    lines.push('', '*Recent:*');
    for (const f of recent) {
      const label = f.rating === 'up' ? 'Helpful' : 'Not helpful';
      const when = f.timestamp.slice(0, 10);
      const what = f.response_summary || f.message_summary || '(no summary)';
      lines.push(`- ${label} · ${when} — ${what}`);
    }
  }
  return lines.join('\n');
}
