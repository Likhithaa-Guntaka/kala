/**
 * Pick a native assistant-thread status string based on what the user asked for.
 * Rules are evaluated in order; the first keyword match wins.
 * @param {string} text - The user's message.
 * @returns {string}
 */
export function statusForMessage(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('grant') || t.includes('find')) return 'Searching for grants...';
  if (t.includes('draft') || t.includes('report') || t.includes('impact')) return 'Drafting...';
  if (t.includes('remind') || t.includes('deadline')) return 'Setting reminder...';
  if (t.includes('summarize') || t.includes('meeting') || t.includes('notes')) return 'Summarizing notes...';
  if (t.includes('thank') || t.includes('donor')) return 'Drafting thank you...';
  if (t.includes('volunteer') || t.includes('announcement')) return 'Creating announcement...';
  return 'Thinking...';
}

/**
 * Set (or clear, with an empty string) the native Slack assistant thread status.
 * No-ops if the thread isn't an assistant thread (e.g. a plain channel mention),
 * so callers never have to guard against unsupported surfaces.
 * @param {import('@slack/web-api').WebClient} client
 * @param {string} channelId
 * @param {string} threadTs
 * @param {string} status - Status text, or "" to clear the indicator.
 * @returns {Promise<void>}
 */
export async function setAssistantStatus(client, channelId, threadTs, status) {
  try {
    await client.assistant.threads.setStatus({ channel_id: channelId, thread_ts: threadTs, status });
  } catch {
    // Not an assistant thread — the status indicator isn't available here.
  }
}
