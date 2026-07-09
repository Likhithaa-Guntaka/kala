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
   * @param {(() => void) | null} [onOrgTypeChange] - Called after any org-type write,
   *   so a caller can persist the org types (e.g. to disk).
   */
  constructor(ttlSeconds = 86400, maxEntries = 1000, onOrgTypeChange = null) {
    /** @type {Map<string, StoreEntry>} */
    this._store = new Map();
    /**
     * User-level org-type preferences, keyed by user ID. Unlike sessions, these
     * are durable (no TTL) since they represent a persistent choice — only bounded
     * by _maxEntries with oldest-first eviction.
     * @private @type {Map<string, { orgType: string, timestamp: number }>}
     */
    this._orgTypes = new Map();
    /** @private @type {number} */
    this._ttlSeconds = ttlSeconds;
    /** @private @type {number} */
    this._maxEntries = maxEntries;
    /** @private @type {(() => void) | null} */
    this._onOrgTypeChange = onOrgTypeChange;
  }

  /**
   * Export org types as a plain { userId: orgType } object (for persistence).
   * @returns {Record<string, string>}
   */
  exportOrgTypes() {
    /** @type {Record<string, string>} */
    const out = {};
    for (const [userId, entry] of this._orgTypes) out[userId] = entry.orgType;
    return out;
  }

  /**
   * Seed org types from a persisted { userId: orgType } object without triggering
   * the change callback (used to hydrate on startup).
   * @param {Record<string, string>} map
   * @returns {void}
   */
  importOrgTypes(map) {
    const now = Date.now();
    for (const [userId, orgType] of Object.entries(map || {})) {
      this._orgTypes.set(userId, { orgType, timestamp: now });
    }
  }

  /**
   * Get a user's stored org type, or null if they haven't chosen one.
   * @param {string} userId
   * @returns {string | null}
   */
  getOrgType(userId) {
    return this._orgTypes.get(userId)?.orgType ?? null;
  }

  /**
   * Store a user's org type preference.
   * @param {string} userId
   * @param {string} orgType
   * @returns {void}
   */
  setOrgType(userId, orgType) {
    this._orgTypes.set(userId, { orgType, timestamp: Date.now() });
    if (this._orgTypes.size > this._maxEntries) {
      const sorted = [...this._orgTypes.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (const [key] of sorted.slice(0, this._orgTypes.size - this._maxEntries)) {
        this._orgTypes.delete(key);
      }
    }
    this._onOrgTypeChange?.();
  }

  /**
   * Clear a user's org type preference (e.g. to re-run onboarding).
   * @param {string} userId
   * @returns {void}
   */
  clearOrgType(userId) {
    this._orgTypes.delete(userId);
    this._onOrgTypeChange?.();
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
