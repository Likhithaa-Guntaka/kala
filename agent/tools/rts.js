/**
 * Slack Real-Time Search (RTS) API adapter.
 *
 * Wraps `assistant.search.context` — Slack's real-time search over the messages
 * and files a user can see across their workspace. Called with the user's token
 * (xoxp-), no `action_token` is needed. Kala already collects `deps.userToken`
 * for the Slack MCP Server, and manifest.json requests the `search:read.*` user
 * scopes this endpoint needs.
 *
 * @see https://docs.slack.dev/reference/methods/assistant.search.context
 */

const RTS_ENDPOINT = 'https://slack.com/api/assistant.search.context';

/**
 * @typedef {Object} WorkspaceMessage
 * @property {string} author
 * @property {string} channelName
 * @property {string} channelId
 * @property {string} ts
 * @property {string} text
 * @property {string} [permalink]
 */

/**
 * @typedef {Object} WorkspaceFile
 * @property {string} title
 * @property {string} [author]
 * @property {string} [permalink]
 */

/**
 * @typedef {Object} WorkspaceSearchResult
 * @property {boolean} ok
 * @property {WorkspaceMessage[]} messages
 * @property {WorkspaceFile[]} files
 * @property {string} [error]
 */

/**
 * Search the workspace via the RTS API.
 * @param {Object} opts
 * @param {string} [opts.userToken]         Slack user token (xoxp-). Missing → no_user_token.
 * @param {string} opts.query               Natural-language prompt or keywords.
 * @param {string[]} [opts.contentTypes]    Any of "messages", "files". Default ["messages"].
 * @param {string[]} [opts.channelTypes]    Any of "public_channel","private_channel","mpim","im".
 * @param {number} [opts.limit]             Max results (1-20). Default 10.
 * @param {typeof fetch} [opts.fetchImpl]   Injectable fetch, for tests.
 * @returns {Promise<WorkspaceSearchResult>}
 */
export async function searchWorkspaceContext({
  userToken,
  query,
  contentTypes = ['messages'],
  channelTypes = ['public_channel', 'private_channel', 'mpim', 'im'],
  limit = 10,
  fetchImpl = fetch,
}) {
  if (!userToken) return { ok: false, messages: [], files: [], error: 'no_user_token' };

  let payload;
  try {
    const res = await fetchImpl(RTS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        query,
        content_types: contentTypes,
        channel_types: channelTypes,
        limit: Math.min(Math.max(limit, 1), 20),
      }),
    });
    payload = await res.json();
  } catch (e) {
    const err = /** @type {any} */ (e);
    return { ok: false, messages: [], files: [], error: err.message };
  }

  if (!payload?.ok) {
    return { ok: false, messages: [], files: [], error: payload?.error || 'unknown_error' };
  }

  const rawMessages = payload.results?.messages ?? [];
  const rawFiles = payload.results?.files ?? [];

  /** @type {WorkspaceMessage[]} */
  const messages = rawMessages.map((/** @type {any} */ m) => ({
    author: m.author_name || 'Someone',
    channelName: m.channel_name || m.channel_id || 'a channel',
    channelId: m.channel_id || '',
    ts: m.message_ts || '',
    text: (m.content || '').trim(),
    permalink: m.permalink,
  }));

  /** @type {WorkspaceFile[]} */
  const files = rawFiles.map((/** @type {any} */ f) => ({
    title: f.title || 'Untitled file',
    author: f.author_name,
    permalink: f.permalink,
  }));

  return { ok: true, messages, files };
}

/**
 * Shorten a message to a single readable snippet.
 * @param {string} text
 * @param {number} [max]
 * @returns {string}
 */
function snippet(text, max = 240) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/**
 * Format search results as Markdown for the agent to present. The agent then
 * summarizes in the user's language.
 * @param {string} query
 * @param {WorkspaceSearchResult} result
 * @returns {string}
 */
export function formatWorkspaceResults(query, result) {
  if (!result.ok) {
    if (result.error === 'no_user_token') {
      return "I can't search your workspace yet — Kala needs to be connected to Slack search first. For now, tell me what you know and I'll work from that.";
    }
    if (result.error === 'missing_scope' || result.error === 'not_allowed_token_type') {
      return "I couldn't search the workspace — the Slack connection is missing the search permission. An admin may need to reconnect Kala with search access.";
    }
    return `I couldn't search the workspace just now (${result.error}). Please try again in a moment.`;
  }

  if (result.messages.length === 0 && result.files.length === 0) {
    return `I searched the workspace but found nothing about "${query}". Try different words, or tell me what you remember.`;
  }

  const parts = [`Here's what I found in your workspace about "${query}":`];

  if (result.messages.length > 0) {
    const lines = result.messages.map((m) => {
      const where = m.permalink ? `<${m.permalink}|#${m.channelName}>` : `#${m.channelName}`;
      return `• *${m.author}* in ${where}: ${snippet(m.text)}`;
    });
    parts.push(lines.join('\n'));
  }

  if (result.files.length > 0) {
    const lines = result.files.map((f) => {
      const link = f.permalink ? `<${f.permalink}|${f.title}>` : f.title;
      return `• 📎 ${link}${f.author ? ` — ${f.author}` : ''}`;
    });
    parts.push(`Files:\n${lines.join('\n')}`);
  }

  return parts.join('\n\n');
}
