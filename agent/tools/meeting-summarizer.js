import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const ACTION_CUE =
  /\b(will|needs? to|should|must|action item|to-?do|follow[- ]?up|assigned to|responsible for|take[s]? on|owns|by (?:mon|tue|wed|thu|fri|sat|sun|next|end of|eod|\d))\b/i;
const DECISION_CUE = /\b(decided|agreed|approved|resolved|consensus|will proceed|signed off|green[- ]?lit|go ahead)\b/i;
const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';

/** @param {string} text */
function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) =>
      s
        .trim()
        .replace(/^[-*•\d.)\s]+/, '')
        .trim(),
    )
    .filter(Boolean);
}

/** Best-effort owner detection, defaulting to "TBD". @param {string} s */
function findOwner(s) {
  const at = s.match(/@([A-Za-z][\w.]+)/);
  if (at) return at[1];
  const assigned = s.match(/assigned to ([A-Z][a-z]+)/i);
  if (assigned) return assigned[1];
  const lead = s.match(/^([A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?\s+(?:will|to|should|is going to|owns|takes|is)/);
  if (lead) return lead[1];
  return 'TBD';
}

/** Best-effort deadline detection. @param {string} s @returns {string | null} */
function findDeadline(s) {
  const by = s.match(/\bby ([A-Za-z0-9][A-Za-z0-9 ,/]*?)(?=[.;,]|$)/i);
  if (by) return by[1].trim();
  const date = s.match(new RegExp(`\\b(\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?|(?:${MONTHS})[a-z]* \\d{1,2})\\b`));
  if (date) return date[1];
  return null;
}

/**
 * @typedef {Object} ActionItem
 * @property {string} task
 * @property {string} owner - Detected owner, or "TBD".
 * @property {string | null} deadline
 */

/**
 * Pull decisions and open action items (asks/commitments) out of free text. Shared
 * by summarize_meeting (over pasted notes) and prep_briefing (over workspace search
 * results), so both use the same cue detection rather than duplicating it.
 * @param {string} text
 * @returns {{ sentences: string[], decisions: string[], actionItems: ActionItem[], lead: string }}
 */
export function analyzeNotes(text) {
  const sentences = splitSentences(text || '');

  const decisions = sentences.filter((s) => DECISION_CUE.test(s)).slice(0, 8);
  const decisionSet = new Set(decisions);
  const actionItems = sentences
    .filter((s) => ACTION_CUE.test(s) && !decisionSet.has(s))
    .slice(0, 8)
    .map((s) => ({ task: s, owner: findOwner(s), deadline: findDeadline(s) }));

  const lead = sentences
    .filter((s) => !ACTION_CUE.test(s) && !DECISION_CUE.test(s))
    .slice(0, 2)
    .join(' ');

  return { sentences, decisions, actionItems, lead };
}

export const summarizeMeetingTool = tool(
  'summarize_meeting',
  'Turn raw meeting notes into a clean Slack summary with action items and decisions. ' +
    'Use this when a user pastes meeting notes and wants them summarized or turned into next steps. ' +
    'Pass the raw notes text, plus a meeting name and date if given.',
  {
    notes: z.string().describe('The raw meeting notes or transcript text.'),
    meeting_name: z.string().optional().describe('The meeting name, if given.'),
    date: z.string().optional().describe('The meeting date, if given.'),
  },
  async ({ notes, meeting_name, date }) => {
    const { sentences, decisions, actionItems, lead } = analyzeNotes(notes);
    const summary = lead || `${sentences.length} point(s) discussed.`;

    const titleParts = ['*Meeting summary'];
    if (meeting_name) titleParts.push(`: ${meeting_name}`);
    titleParts.push('*');
    if (date) titleParts.push(` — ${date}`);

    const actionLines = actionItems.length
      ? actionItems
          .map((a) => `• ${a.task}\n   ↳ *Owner:* ${a.owner}${a.deadline ? ` · *Due:* ${a.deadline}` : ''}`)
          .join('\n')
      : '• None identified.';

    const decisionLines = decisions.length ? decisions.map((d) => `• ${d}`).join('\n') : '• None recorded.';

    const text =
      `${titleParts.join('')}\n\n` +
      `*Summary*\n${summary}\n\n` +
      `*✅ Action items*\n${actionLines}\n\n` +
      `*📌 Decisions*\n${decisionLines}\n\n` +
      '---\n' +
      'I pulled these out automatically — want me to tighten the summary, fill in any *TBD* owners, or post this to a channel?';

    return { content: [{ type: 'text', text }] };
  },
);
