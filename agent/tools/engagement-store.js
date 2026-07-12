/**
 * In-memory store of artist / contractor engagements.
 *
 * This is the persistence half of Kala's engagement tracker: the `track_engagement`,
 * `update_engagement`, and `engagement_status` tools (in `agent/kala.js`) read and
 * write here. It follows the same process-local Map pattern as the deadline and
 * match stores — records are scoped to a Slack channel so a team shares one list.
 *
 * Process-local — resets on restart. Back it with a database (or the SessionStore
 * pattern in `thread-context/`) for production.
 *
 * @typedef {'not_sent' | 'sent' | 'signed'} ContractStatus
 * @typedef {'missing' | 'received'} W9Status
 * @typedef {'not_submitted' | 'submitted' | 'paid'} InvoiceStatus
 *
 * @typedef {Object} Engagement
 * @property {string} id                 Stable id, e.g. "ENG-1".
 * @property {string} channelId          Slack channel the engagement is tracked in.
 * @property {string} createdBy          Slack user id who added it.
 * @property {string} artist             Artist / contractor name.
 * @property {string} project            Project or event the engagement is for.
 * @property {ContractStatus} contractStatus
 * @property {W9Status} w9Status
 * @property {InvoiceStatus} invoiceStatus
 * @property {string} [contractSentAt]   ISO date the contract went to "sent" (for the >7d overdue rule).
 * @property {string} [invoiceSubmittedAt] ISO date the invoice went to "submitted" (for the >14d overdue rule).
 * @property {string} createdAt          ISO date added.
 * @property {string} updatedAt          ISO date last changed.
 */

/** Valid values per status field, so a bad input is rejected instead of stored. */
export const CONTRACT_STATUSES = /** @type {const} */ (['not_sent', 'sent', 'signed']);
export const W9_STATUSES = /** @type {const} */ (['missing', 'received']);
export const INVOICE_STATUSES = /** @type {const} */ (['not_submitted', 'submitted', 'paid']);

/** Human-readable labels for each status value, for digests and confirmations. */
export const STATUS_LABELS = {
  contract: { not_sent: 'not sent', sent: 'sent', signed: 'signed' },
  w9: { missing: 'missing', received: 'received' },
  invoice: { not_submitted: 'not submitted', submitted: 'submitted', paid: 'paid' },
};

/** Default overdue thresholds (days). */
export const CONTRACT_OVERDUE_DAYS = 7;
export const INVOICE_OVERDUE_DAYS = 14;

/** @type {Map<string, Engagement>} */
const engagements = new Map();
let nextId = 1;

/** ISO YYYY-MM-DD for an epoch-ms clock. @param {number} nowMs @returns {string} */
function isoDate(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Whole days elapsed from an ISO date until now. Negative if the date is future.
 * @param {string | undefined} iso
 * @param {number} nowMs
 * @returns {number}
 */
export function daysSince(iso, nowMs) {
  if (!iso) return 0;
  const then = new Date(`${iso}T00:00:00`).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.floor((nowMs - then) / 86_400_000);
}

/**
 * Add a new engagement with default (earliest) statuses.
 * @param {Object} input
 * @param {string} input.artist
 * @param {string} input.project
 * @param {string} [input.channelId]
 * @param {string} [input.createdBy]
 * @param {number} [input.now] Injected clock (epoch ms); defaults to Date.now().
 * @returns {Engagement}
 */
export function addEngagement({ artist, project, channelId, createdBy, now = Date.now() }) {
  const id = `ENG-${nextId++}`;
  const today = isoDate(now);
  /** @type {Engagement} */
  const record = {
    id,
    channelId: channelId || 'unknown',
    createdBy: createdBy || 'unknown',
    artist: artist.trim(),
    project: project.trim(),
    contractStatus: 'not_sent',
    w9Status: 'missing',
    invoiceStatus: 'not_submitted',
    createdAt: today,
    updatedAt: today,
  };
  engagements.set(id, record);
  return record;
}

/**
 * All engagements for a channel (most recently updated first).
 * @param {string} channelId
 * @returns {Engagement[]}
 */
export function listEngagements(channelId) {
  return Array.from(engagements.values())
    .filter((e) => e.channelId === channelId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/**
 * Find engagements in a channel whose artist or project matches `query`
 * (case-insensitive substring). Empty query returns all in-channel engagements.
 * @param {string} channelId
 * @param {string} [query]
 * @returns {Engagement[]}
 */
export function findEngagements(channelId, query) {
  const q = (query || '').trim().toLowerCase();
  const all = listEngagements(channelId);
  if (!q) return all;
  return all.filter((e) => e.artist.toLowerCase().includes(q) || e.project.toLowerCase().includes(q));
}

/** Look up a single engagement by id. @param {string} id @returns {Engagement | undefined} */
export function getEngagement(id) {
  return engagements.get(id);
}

/**
 * Update an engagement's statuses. Stamps `contractSentAt` when the contract first
 * moves to "sent" and `invoiceSubmittedAt` when the invoice first moves to
 * "submitted", so the overdue rules have a start date. Only provided fields change.
 * @param {string} id
 * @param {Object} patch
 * @param {ContractStatus} [patch.contractStatus]
 * @param {W9Status} [patch.w9Status]
 * @param {InvoiceStatus} [patch.invoiceStatus]
 * @param {number} [now] Injected clock (epoch ms); defaults to Date.now().
 * @returns {Engagement | undefined} the updated record, or undefined if not found.
 */
export function updateEngagement(id, { contractStatus, w9Status, invoiceStatus } = {}, now = Date.now()) {
  const record = engagements.get(id);
  if (!record) return undefined;
  const today = isoDate(now);

  if (contractStatus && CONTRACT_STATUSES.includes(contractStatus)) {
    // Stamp when it enters "sent" so the >7d unsigned rule can age from here.
    if (contractStatus === 'sent' && record.contractStatus !== 'sent') record.contractSentAt = today;
    record.contractStatus = contractStatus;
  }
  if (w9Status && W9_STATUSES.includes(w9Status)) {
    record.w9Status = w9Status;
  }
  if (invoiceStatus && INVOICE_STATUSES.includes(invoiceStatus)) {
    if (invoiceStatus === 'submitted' && record.invoiceStatus !== 'submitted') record.invoiceSubmittedAt = today;
    record.invoiceStatus = invoiceStatus;
  }
  record.updatedAt = today;
  return record;
}

/** Remove an engagement. @param {string} id @returns {boolean} whether one was removed. */
export function removeEngagement(id) {
  return engagements.delete(id);
}

/**
 * Whether anything is still outstanding on this engagement (contract not signed,
 * W-9 missing, or invoice not paid).
 * @param {Engagement} e
 * @returns {boolean}
 */
export function isOutstanding(e) {
  return e.contractStatus !== 'signed' || e.w9Status !== 'received' || e.invoiceStatus !== 'paid';
}

/** Whether the invoice is not yet paid. @param {Engagement} e @returns {boolean} */
export function isUnpaid(e) {
  return e.invoiceStatus !== 'paid';
}

/**
 * Reasons this engagement is overdue: a contract sent but unsigned beyond
 * `contractDays`, and/or an invoice submitted but unpaid beyond `invoiceDays`.
 * Returns an empty array when nothing is overdue.
 * @param {Engagement} e
 * @param {number} nowMs
 * @param {Object} [opts]
 * @param {number} [opts.contractDays]
 * @param {number} [opts.invoiceDays]
 * @returns {string[]}
 */
export function overdueReasons(
  e,
  nowMs,
  { contractDays = CONTRACT_OVERDUE_DAYS, invoiceDays = INVOICE_OVERDUE_DAYS } = {},
) {
  const reasons = [];
  if (e.contractStatus === 'sent') {
    const age = daysSince(e.contractSentAt, nowMs);
    if (age > contractDays) reasons.push(`contract sent ${age} days ago, still unsigned`);
  }
  if (e.invoiceStatus === 'submitted') {
    const age = daysSince(e.invoiceSubmittedAt, nowMs);
    if (age > invoiceDays) reasons.push(`invoice submitted ${age} days ago, still unpaid`);
  }
  return reasons;
}

/**
 * Overdue engagements in a channel, each with the reason(s) it is flagged.
 * @param {string} channelId
 * @param {number} [now] Injected clock (epoch ms); defaults to Date.now().
 * @param {Object} [opts]
 * @param {number} [opts.contractDays]
 * @param {number} [opts.invoiceDays]
 * @returns {{ engagement: Engagement, reasons: string[] }[]}
 */
export function getOverdueEngagements(channelId, now = Date.now(), opts = {}) {
  return listEngagements(channelId)
    .map((engagement) => ({ engagement, reasons: overdueReasons(engagement, now, opts) }))
    .filter((r) => r.reasons.length > 0);
}

/**
 * A one-line human summary of an engagement's statuses, for digests.
 * @param {Engagement} e
 * @returns {string}
 */
export function describeEngagement(e) {
  const parts = [
    `contract ${STATUS_LABELS.contract[e.contractStatus]}`,
    `W-9 ${STATUS_LABELS.w9[e.w9Status]}`,
    `invoice ${STATUS_LABELS.invoice[e.invoiceStatus]}`,
  ];
  return `${e.id} — *${e.artist}* (${e.project}): ${parts.join(', ')}`;
}

/** Clear all engagements. Test helper. @returns {void} */
export function _resetEngagements() {
  engagements.clear();
  nextId = 1;
}
