// In-memory feedback log. Simple array for now; can be swapped for a durable
// store later without changing the callers.

/**
 * @typedef {Object} FeedbackEntry
 * @property {string} user_id
 * @property {string} message_summary - Short summary of the user's message.
 * @property {string} response_summary - Short summary of Benvu's response.
 * @property {'up' | 'down'} rating
 * @property {string} timestamp - ISO 8601.
 */

/** @type {FeedbackEntry[]} */
const feedbackLog = [];

/**
 * Record a feedback entry.
 * @param {FeedbackEntry} entry
 * @returns {void}
 */
export function recordFeedback(entry) {
  feedbackLog.push(entry);
}

/**
 * All feedback entries (most recent last).
 * @returns {FeedbackEntry[]}
 */
export function getAllFeedback() {
  return feedbackLog;
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

  const lines = ['*Benvu feedback summary*', `👍 ${up}   👎 ${down}   •   ${total} total (${positivePct}% positive)`];
  if (recent.length > 0) {
    lines.push('', '*Recent:*');
    for (const f of recent) {
      const icon = f.rating === 'up' ? '👍' : '👎';
      const when = f.timestamp.slice(0, 10);
      const what = f.response_summary || f.message_summary || '(no summary)';
      lines.push(`• ${icon} ${when} — ${what}`);
    }
  }
  return lines.join('\n');
}
