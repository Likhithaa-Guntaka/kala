import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Durable, on-disk persistence for user org types so the choice survives restarts.
// (Slack profile custom fields can't be written by a bot for arbitrary users, so a
// small local file is the reliable store — see onboarding-buttons.js for the
// best-effort Slack-profile mirror.)
const ORG_TYPE_FILE = 'data/org-types.json';

// Skip disk I/O under tests so the suite never touches the real data file.
const DISABLED = process.env.NODE_ENV === 'test';

/**
 * Load the persisted { userId: orgTypeId } map from disk. Returns {} if missing/unreadable.
 * @returns {Record<string, string>}
 */
export function loadOrgTypes() {
  if (DISABLED) return {};
  try {
    return JSON.parse(readFileSync(ORG_TYPE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Persist the { userId: orgTypeId } map to disk. Best-effort — never throws.
 * @param {Record<string, string>} map
 * @returns {void}
 */
export function saveOrgTypes(map) {
  if (DISABLED) return;
  try {
    mkdirSync(dirname(ORG_TYPE_FILE), { recursive: true });
    writeFileSync(ORG_TYPE_FILE, JSON.stringify(map, null, 2));
  } catch {
    // Best effort — if disk isn't writable, org types simply won't survive a restart.
  }
}
