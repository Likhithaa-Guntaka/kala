import { loadOrgTypes, saveOrgTypes } from './org-persistence.js';
import { SessionStore } from './store.js';

// Persist org types to disk so they survive restarts. The store calls the change
// callback after every org-type write; we snapshot and save on each change.
export const sessionStore = new SessionStore(86400, 1000, () => saveOrgTypes(sessionStore.exportOrgTypes()));

// Hydrate any previously-saved org types on startup.
sessionStore.importOrgTypes(loadOrgTypes());
