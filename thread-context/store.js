/**
 * @typedef {Object} StoreEntry
 * @property {string} sessionId
 * @property {number} timestamp
 */

/**
 * In-memory session ID store with TTL-based cleanup.
 */
export class SessionStore {
  /**
   * @param {number} [ttlSeconds=86400]
   * @param {number} [maxEntries=1000]
   */
  constructor(ttlSeconds = 86400, maxEntries = 1000) {
    /** @type {Map<string, StoreEntry>} */
    this._store = new Map();
    /**
     * Most recent draft (thank-you, report, announcement) per conversation, so a
     * follow-up like "make it shorter" edits that draft instead of starting over.
     * Keyed `${channelId}:${threadTs}`, same TTL as sessions.
     * @private @type {Map<string, { type: string, content: string, timestamp: number }>}
     */
    this._lastDrafts = new Map();
    /** @private @type {number} */
    this._ttlSeconds = ttlSeconds;
    /** @private @type {number} */
    this._maxEntries = maxEntries;
  }

  /**
   * @param {string} channelId
   * @param {string} threadTs
   * @returns {string | null}
   */
  getSession(channelId, threadTs) {
    const key = `${channelId}:${threadTs}`;
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this._ttlSeconds * 1000) {
      this._store.delete(key);
      return null;
    }
    return entry.sessionId;
  }

  /**
   * @param {string} channelId
   * @param {string} threadTs
   * @param {string} sessionId
   * @returns {void}
   */
  setSession(channelId, threadTs, sessionId) {
    const key = `${channelId}:${threadTs}`;
    this._store.set(key, {
      sessionId,
      timestamp: Date.now(),
    });
    this._cleanup();
  }

  /**
   * Remember the most recent draft in a conversation, so a follow-up edit
   * ("make it shorter", "translate it") revises this draft rather than starting over.
   * @param {string} channelId
   * @param {string} threadTs
   * @param {{ type: string, content: string }} draft
   * @returns {void}
   */
  setLastDraft(channelId, threadTs, draft) {
    this._lastDrafts.set(`${channelId}:${threadTs}`, { ...draft, timestamp: Date.now() });
    if (this._lastDrafts.size > this._maxEntries) {
      const sorted = [...this._lastDrafts.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (const [k] of sorted.slice(0, this._lastDrafts.size - this._maxEntries)) this._lastDrafts.delete(k);
    }
  }

  /**
   * The most recent draft for a conversation, or null (expired or none). Same TTL
   * as sessions, so a stale draft doesn't linger past the conversation.
   * @param {string} channelId
   * @param {string} threadTs
   * @returns {{ type: string, content: string } | null}
   */
  getLastDraft(channelId, threadTs) {
    const key = `${channelId}:${threadTs}`;
    const entry = this._lastDrafts.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this._ttlSeconds * 1000) {
      this._lastDrafts.delete(key);
      return null;
    }
    return { type: entry.type, content: entry.content };
  }

  /**
   * @private
   * @returns {void}
   */
  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this._store) {
      if (now - entry.timestamp > this._ttlSeconds * 1000) {
        this._store.delete(key);
      }
    }
    if (this._store.size > this._maxEntries) {
      const sorted = [...this._store.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = sorted.slice(0, this._store.size - this._maxEntries);
      for (const [key] of toRemove) {
        this._store.delete(key);
      }
    }
  }
}
