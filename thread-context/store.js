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
    /**
     * User IDs that have completed onboarding at least once. Kept SEPARATE from
     * `_orgTypes` on purpose: `clearOrgType` (the "Change organization type" flow)
     * wipes the org type to re-show the picker, but must NOT reset this — otherwise
     * every org-type change looks like first-time onboarding and re-sends the DM.
     * @private @type {Set<string>}
     */
    this._onboarded = new Set();
    /**
     * Per-user reference to the tailored-prompts onboarding DM, so a later org
     * change edits it in place instead of posting a duplicate. In-memory only.
     * @private @type {Map<string, { channel: string, ts: string }>}
     */
    this._onboardingMsgRef = new Map();
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
      // A persisted org type means this user already onboarded — remember that
      // so a restart doesn't re-send the DM on their next org-type change.
      this._onboarded.add(userId);
    }
  }

  /**
   * Whether this user has completed onboarding at least once. Survives
   * `clearOrgType`, so re-selecting after "Change organization type" is not
   * treated as first-time onboarding.
   * @param {string} userId
   * @returns {boolean}
   */
  hasOnboarded(userId) {
    return this._onboarded.has(userId);
  }

  /**
   * Mark a user as having completed onboarding (idempotent).
   * @param {string} userId
   * @returns {void}
   */
  markOnboarded(userId) {
    this._onboarded.add(userId);
  }

  /**
   * Remember the tailored-prompts onboarding DM for a user, so a later org-type
   * change can edit it in place (chat.update) instead of posting a duplicate.
   * @param {string} userId
   * @param {{ channel: string, ts: string }} ref
   * @returns {void}
   */
  setOnboardingMessageRef(userId, ref) {
    this._onboardingMsgRef.set(userId, ref);
  }

  /**
   * The stored tailored-prompts DM ref for a user, or null. In-memory only: after
   * a restart this is empty, so the next change posts a fresh message rather than
   * editing one we no longer remember.
   * @param {string} userId
   * @returns {{ channel: string, ts: string } | null}
   */
  getOnboardingMessageRef(userId) {
    return this._onboardingMsgRef.get(userId) ?? null;
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
