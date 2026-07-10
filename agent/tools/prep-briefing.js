import { z } from 'zod';

import { daysUntil, findDeadlines } from './deadline-store.js';
import { analyzeNotes } from './meeting-summarizer.js';
import { searchWorkspaceContext } from './rts.js';

/** Tool description and schema, shared so behavior is identical wherever built. */
export const PREP_BRIEFING_DESCRIPTION =
  'Prepare a short briefing about a person or organization before a call or meeting. ' +
  'Use this when the user says things like "prep me for my call with…", "brief me on…", ' +
  '"catch me up on…", or "what do we know about…". It searches the team\'s Slack workspace ' +
  'for past mentions, pulls out open asks or commitments, and adds any tracked deadlines for ' +
  "that subject. Present the result as a short briefing in the user's language — a few " +
  'sentences on what has been discussed, what is outstanding, and what is coming up — not a raw list.';

export const PREP_BRIEFING_SCHEMA = {
  subject: z
    .string()
    .describe('The person or organization to brief on, e.g. "the Ford Foundation" or "Maria at City Council".'),
};

/** Shorten a message to a single readable snippet. @param {string} text @param {number} [max] */
function snippet(text, max = 200) {
  const oneLine = (text || '').replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** A plain-language phrase for how much time is left until an ISO date. @param {string} dueDate */
function timeLeftPhrase(dueDate) {
  const left = daysUntil(dueDate);
  if (left < 0) return `${Math.abs(left)} day(s) overdue`;
  if (left === 0) return 'due today';
  return `in ${left} day(s)`;
}

/**
 * Assemble the briefing material from workspace search results and tracked
 * deadlines. Returns text the model turns into a short briefing — organized into
 * "discussed / outstanding / coming up", never a raw dump. Pure and testable.
 *
 * @param {string} subject
 * @param {import('./rts.js').WorkspaceSearchResult} searchResult
 * @param {import('./deadline-store.js').TrackedDeadline[]} deadlines
 * @returns {string}
 */
export function buildBriefing(subject, searchResult, deadlines) {
  const messages = searchResult?.ok ? searchResult.messages : [];
  const dls = deadlines || [];
  const searchFailed = searchResult && !searchResult.ok;

  // Nothing to work with at all.
  if (messages.length === 0 && dls.length === 0) {
    if (searchFailed && searchResult.error === 'no_user_token') {
      return `I can't search your workspace yet, and I don't have any tracked deadlines for "${subject}". Tell me what you know about them and I'll help you get ready.`;
    }
    return `I looked, but I couldn't find anything about "${subject}" in your team's recent messages or your tracked deadlines. Want to tell me what the call is about, and I'll help you prep from there?`;
  }

  const parts = [
    `Briefing material about "${subject}". Turn this into a short briefing for the user in their language — ` +
      'a few sentences covering what has been discussed, what is outstanding, and what is coming up. ' +
      'Do not dump it verbatim or keep these section labels.',
  ];

  // Discussed — recent mentions.
  if (messages.length > 0) {
    const lines = messages.slice(0, 6).map((m) => `• ${m.author} in #${m.channelName}: ${snippet(m.text)}`);
    parts.push(
      `DISCUSSED (${messages.length} recent mention${messages.length === 1 ? '' : 's'}):\n${lines.join('\n')}`,
    );
  } else {
    parts.push('DISCUSSED: nothing found in recent messages.');
  }

  // Outstanding — open asks/commitments, reusing the meeting-summarizer cue detection.
  const corpus = messages.map((m) => m.text).join('\n');
  const { actionItems } = analyzeNotes(corpus);
  if (actionItems.length > 0) {
    const lines = actionItems.slice(0, 6).map((a) => {
      const owner = a.owner && a.owner !== 'TBD' ? ` (owner: ${a.owner})` : '';
      const due = a.deadline ? ` — due ${a.deadline}` : '';
      return `• ${a.task}${owner}${due}`;
    });
    parts.push(`OUTSTANDING (open asks or commitments):\n${lines.join('\n')}`);
  } else {
    parts.push('OUTSTANDING: no clear open asks or commitments spotted.');
  }

  // Coming up — tracked deadlines for this subject.
  if (dls.length > 0) {
    const lines = dls.map((d) => {
      const owner = d.owner ? `, owner ${d.owner}` : '';
      return `• ${d.title} — due ${d.dueDate} (${timeLeftPhrase(d.dueDate)})${owner}`;
    });
    parts.push(`COMING UP (tracked deadlines):\n${lines.join('\n')}`);
  } else {
    parts.push('COMING UP: no tracked deadlines for this subject.');
  }

  if (searchFailed && searchResult.error !== 'no_user_token') {
    parts.push(`(Note: workspace search hit an error — ${searchResult.error} — so mentions may be incomplete.)`);
  }

  return parts.join('\n\n');
}

/**
 * Gather a briefing end-to-end: search the workspace for the subject, look up
 * tracked deadlines for it, and build the briefing text. `fetchImpl` is injectable
 * for tests.
 * @param {Object} opts
 * @param {string} opts.subject
 * @param {string} [opts.userToken]
 * @param {number} [opts.limit]
 * @param {typeof fetch} [opts.fetchImpl]
 * @returns {Promise<string>}
 */
export async function gatherBriefing({ subject, userToken, limit = 15, fetchImpl }) {
  const searchResult = await searchWorkspaceContext({
    userToken,
    query: subject,
    contentTypes: ['messages'],
    limit,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const deadlines = findDeadlines(subject);
  return buildBriefing(subject, searchResult, deadlines);
}
