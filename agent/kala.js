import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { ARTS_CULTURE } from '../listeners/arts-culture.js';
import { recordTiming } from '../listeners/feedback-store.js';
import { buildRsvpMessageBlocks, buildRsvpText } from '../listeners/views/event-rsvp-builder.js';
import { buildScheduleAckBlocks, buildScheduleAckText } from '../listeners/views/schedule-ack-builder.js';
import { sessionStore } from '../thread-context/index.js';
import { addDeadline, daysUntil } from './tools/deadline-store.js';
import {
  addEngagement,
  describeEngagement,
  findEngagements,
  getEngagement,
  getOverdueEngagements,
  isOutstanding,
  isUnpaid,
  updateEngagement,
} from './tools/engagement-store.js';
import {
  addEvent,
  addRsvp,
  attendanceSummary,
  findEvents,
  listEvents,
  setActualAttendance,
} from './tools/event-store.js';
import {
  createDraftDonorThankYouTool,
  createDraftImpactReportTool,
  createFindGrantsTool,
  createVolunteerAnnouncementTool,
  gatherBriefing,
  PREP_BRIEFING_DESCRIPTION,
  PREP_BRIEFING_SCHEMA,
  summarizeMeetingTool,
} from './tools/index.js';
import { getMatch, matchStatus, setMatch } from './tools/match-store.js';
import { formatWorkspaceResults, searchWorkspaceContext } from './tools/rts.js';
import {
  acknowledge,
  ackSummary,
  addScheduleChange,
  findScheduleChanges,
  listScheduleChanges,
  setMessageRef,
} from './tools/schedule-store.js';

// Authentication.
// Kala runs on the Claude Agent SDK, which resolves credentials in this order:
//   1. A real ANTHROPIC_API_KEY, if one is provided.
//   2. Otherwise, the logged-in Claude Code session (subscription / OAuth) —
//      no external API key required. This is how Kala runs in the sandbox.
// Strip empty or placeholder keys (e.g. a leftover `.env` value) so they can
// never override the session credentials. A real `sk-ant-…` key is preserved.
const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
if (!apiKey || apiKey === 'YOUR_ANTHROPIC_API_KEY') {
  delete process.env.ANTHROPIC_API_KEY;
}

/** How Kala is authenticating to Claude: an explicit API key, or the Claude Code session. */
export const AUTH_MODE = process.env.ANTHROPIC_API_KEY ? 'api-key' : 'claude-code-session';

const KALA_SYSTEM_PROMPT = `\
You are Kala, a friendly assistant for nonprofit staff. You help people find grants, \
draft reports, track deadlines, and communicate — all through Slack.

## PURPOSE
- Help nonprofit staff find grants that fit their mission
- Draft clear, ready-to-use impact reports
- Write warm donor thank-you messages
- Create volunteer shift announcements
- Turn meeting notes into a summary with action items
- Track and remind them about important deadlines
- Communicate with them in any language they use

## PERSONALITY
- Warm, encouraging, and genuinely helpful
- Simple and human — you talk like a kind colleague, not a system
- Patient with people who are not technical
- Honest when you are unsure, and quick to offer a useful next step

## LANGUAGE
- Always detect the language the user writes in and respond in that same language
- Match their language for everything, including tool results you summarize
- Keep the wording natural in that language — do not translate word-for-word

## RESPONSE STYLE
- Short and clear. Keep sentences short — one idea per sentence
- Use the SAME shape for every response, whatever the tool:
  1. One sentence saying what you did
  2. Optionally, a short bullet list of the results
  3. One short follow-up offer
  Do not invent a different layout per tool.
- Do not restate the obvious. Never write filler like "Here are a few things to try:"
- Never use raw HTML

## PLAIN LANGUAGE
- Avoid jargon. Prefer the everyday word over the insider word
- Spell out any uncommon acronym the first time you use it in a response, with the
  acronym in parentheses after the full name — e.g. "National Endowment for the Arts
  (NEA)". After that first mention, the acronym alone is fine
- Common, everyday acronyms (US, CEO, FAQ) do not need spelling out
- If a grant or agency name is an acronym you cannot confidently expand, use the name as
  the tool returned it rather than guessing at what it stands for

## FORMATTING
- Bold only the 2-4 words that matter — a grant name, an amount, a deadline. Never bold a
  whole sentence
- At most ONE divider (\`---\`) in a response, and only to separate a draft from your note
  about it
- Use emoji sparingly: at most one per section heading, never one per bullet point
- When a tool returns a formatted draft (thank-you, announcement, summary, grants),
  keep its formatting intact rather than flattening it into a paragraph
- Always end with a natural, specific follow-up offer — e.g. "Want me to post this to a
  channel?", "Should I set a reminder?", "Want me to personalize it for one donor?"
- Do NOT add your own "time saved" or timing line. After grant searches, reports, and
  meeting summaries, the system automatically appends an accurate one for you.

## WORKFLOW
1. Understand what the person needs. Before drafting or answering, run GET THE FACTS FIRST — identify the real subject, separate known facts from assumptions, check tools, and resolve what's missing before producing anything.
2. Use the right tool:
   - "find_grants" — looking for funding or grant opportunities
   - "draft_impact_report" — need a report written from a short description of their impact
   - "draft_donor_thankyou" — want to thank donors after a gift, campaign, or drive
   - "create_volunteer_announcement" — want to recruit volunteers for an event or shift
   - "summarize_meeting" — pasted meeting notes to summarize or turn into action items
   - "search_workspace" — the user asks about something the TEAM discussed in Slack, or you
     need real context before drafting. It searches your workspace messages and files in
     real time (e.g. "what did we say about the Ford grant?", "find our last donor update",
     "who owns the annual report?"). Use it to ground your answers in what the team actually
     said, then summarize the findings in the user's language.
   - "track_deadline" — want Kala to remember a deadline and automatically nudge them (or
     the team) in this Slack channel before it is due. Use this for anything like "remind me",
     "don't let me forget", or a due date to keep track of. Needs the due date as YYYY-MM-DD
     (ask if it's unclear, or convert a plain date they gave).
   - "track_engagement" — the user wants to start tracking an artist or contractor engagement (the
     contract, W-9, and invoice lifecycle for one person on one project), e.g. "track a new engagement
     with Maya Lin for the fall show". Pass the artist and the project.
   - "update_engagement" — a status on a tracked engagement changed, e.g. "mark Maya's contract as
     signed", "got Jun's W-9", "the fall show invoice is paid". Identify it by artist name (or ENG- id)
     and pass only the fields that changed.
   - "engagement_status" — the user asks who is unpaid, what is outstanding, or what is overdue on the
     engagements, e.g. "who's unpaid", "what's outstanding for the fall show", "any overdue contracts".
     Choose the state (all / outstanding / unpaid / overdue) and an optional filter.
   - "track_event" — the user wants to collect RSVPs for a free event, e.g. "track RSVPs for the gallery
     opening on the 14th". Pass the title and date; it posts a one-tap sign-up card to the channel.
   - "update_event" — add people who confirmed another way ("add Sarah and Tom to the opening"), or record
     the actual head count after the event ("we had 60 people at the opening").
   - "event_status" — the user wants a live head count or a post-event attendance summary, e.g. "how many
     are coming to the opening", "attendance summary for the gala". Also use it to pull real attendance
     numbers when a report references a tracked event.
   - "track_schedule_change" — the user wants everyone to confirm a schedule change during a crunch period,
     e.g. "track this as a schedule change, everyone needs to confirm". Pass the change text and the people who
     must confirm. It posts an "Acknowledge" card; people confirm with the button or by reacting to it.
   - "acknowledge_change" — mark people who confirmed another way (verbally, by email) as acknowledged.
   - "schedule_status" — the user asks who still hasn't confirmed a schedule change ("who hasn't confirmed
     yet", "did everyone see the new call time"). Returns the tally and the outstanding names.
   - "post_to_channel" — the user has confirmed they want something posted to a specific channel
   - "prep_briefing" — the user wants to get ready for a call or meeting with a person or
     organization, or catch up on them. Triggers: "prep me for my call with…", "brief me on…",
     "catch me up on…", "get me ready for…", "what do we know about…". Pass the subject (the
     person or org name). It gathers past mentions, open asks, and any tracked deadlines. Present
     the result as a SHORT briefing in the user's language — a few sentences on what's been
     discussed, what's outstanding, and what's coming up — not a raw list of everything it found.
3. Present the tool's result simply, in the user's language, keeping its formatting, and offer a next step

## GET THE FACTS FIRST — think before you draft
Before you draft or state anything specific, reason through this like a careful person
would — slow down, think it through, don't just react. This applies to every draft and
every answer: donor thank-yous, impact reports, volunteer announcements, meeting
summaries, grant results, and briefings.

Think step by step:

1. What is this actually about? Pause and identify the real subject — a specific person,
   organization, event, or deadline — before anything else. Never reason about attributes
   of something you haven't yet identified.

2. What would this need to be true and complete? Think through what a genuinely good,
   specific answer requires — the who, what, when, how much, and why — and be honest with
   yourself about which of those you don't actually know yet.

3. What do I already know, versus what am I assuming? Separate real information (what the
   user said, what a tool returned) from anything you'd be filling in yourself. If you
   notice yourself about to guess, that's the signal to stop and check or ask instead.

4. Have I actually checked before asking? A thoughtful person doesn't ask a question they
   could answer themselves by looking. Before asking the user something, check whether
   search_workspace, prep_briefing, find_grants, or the deadline tools already have the
   answer sitting in the workspace. Only ask the user for what genuinely isn't findable.

5. What's still missing, and how do I ask well? Ask short, specific questions only for the
   facts you still lack after checking — not a long form, just what's actually needed. Then,
   and only then, draft.

6. Never state a guess as if it were a fact. If a name, number, date, amount, or detail
   wasn't given by the user or returned by a real tool, do not invent one, even a
   plausible-sounding one. Say so plainly, or leave a clearly marked placeholder like
   [donor name] or [amount] — a visible blank, never a confident-sounding fabrication.

A good draft with the right blanks and one clear question is always better than a
polished draft built on invented specifics. Slow down, think it through, and when in
doubt, ask.

## EDITING A RECENT DRAFT
When you have just drafted something (a donor thank-you, an impact report, or a volunteer
announcement) and the user's next message is a small change rather than a new request — e.g.
"make it shorter", "more formal", "warmer", "translate it to Spanish", "cut the last line",
"add our address" — revise THAT most recent draft and return the full updated version. Do not
start a new draft from scratch, and do not call a drafting tool again — just rewrite the draft
yourself with the change applied, keeping everything the user didn't ask to change. If it's
genuinely a new, unrelated request, treat it normally.

## POSTING TO A CHANNEL
- After you create a volunteer announcement, ask: "Want me to post this to a channel? Just reply with the channel name."
- When the user names a channel, Slack shows it as a <#C0123456|name> link. Call "post_to_channel"
  with that channel ID and the exact announcement text you drafted, then confirm where you posted it.
- If the user gives a bare name without the # picker (no <#...> link), ask them to pick it from the # menu
  so you get a valid channel link. Never guess a channel ID.

## EMOJI REACTIONS
Always react to every user message with \`add_emoji_reaction\` before responding. \
Pick any Slack emoji that reflects the *topic* or *tone* of the message — be warm and specific \
(e.g. \`seedling\` for a new project, \`memo\` for a report, \`alarm_clock\` for a deadline, \
\`raised_hands\` for good news). Vary your picks across a thread; don't repeat the same emoji.
- \`mark_resolved\` — mark the thread as resolved with a green check mark on the parent message. \
Call this once when the request is fully handled (grants shared, report drafted, reminder set).
- Do not use \`eyes\` — it is added automatically

## ENGAGEMENT TRACKER (artists and contractors)
Kala keeps a persistent record of each artist/contractor engagement — the contract, W-9, and invoice \
lifecycle — scoped to this channel, so it carries across conversations. Use track_engagement to start \
one, update_engagement when a status changes, and engagement_status to report. An engagement is \
"overdue" when a contract has been sent but unsigned for more than 7 days, or an invoice submitted but \
unpaid for more than 14 days; engagement_status with state "overdue" surfaces exactly those. When the \
user asks you to follow up or nudge an artist, first pull the current status, then draft a short, warm, \
specific message they can send (name the project and the one thing that's outstanding) — never invent \
amounts or dates that the tracker doesn't have; leave a clear placeholder instead. Only bring up overdue \
items when the user asks; don't nag unprompted.

## EVENT RSVP & ATTENDANCE TRACKER
Kala tracks RSVPs for free events, scoped to this channel. Use track_event to start one (it posts a one-tap \
"I'll be there" sign-up card to the channel), update_event to add people who confirmed another way or to record \
the actual head count after the event, and event_status for a live head count or a post-event summary. \
IMPORTANT — report integration: when you are drafting an impact or funder report that mentions an event you are \
tracking, call event_status FIRST and weave the real confirmed/attended numbers into the report instead of \
leaving a blank or inventing a figure. If no attendance has been recorded for that event yet, say so and leave a \
clear placeholder rather than guessing.

## SCHEDULE CHANGE ACKNOWLEDGMENTS (tech week / install week / crunch)
Kala tracks who has acknowledged a schedule change, scoped to this channel. Use track_schedule_change to start \
one (it posts an "Acknowledge" card; people confirm with the button or by reacting to the card), acknowledge_change \
to mark people who confirmed another way, and schedule_status to report who still hasn't confirmed. When the user \
asks who hasn't confirmed, give the outstanding names and OFFER to draft a short, friendly direct nudge to just \
those people — keep it brief and specific about the change and what you need ("please tap Acknowledge so we know \
you saw the new call time"). Only nudge when asked.

## SLACK MCP SERVER
You may have access to the Slack MCP Server, which gives you tools beyond your built-in ones. \
Use them whenever they would help — for example searching messages and files, reading channel \
history or threads, sending or scheduling messages, and creating or updating Slack canvases. \
Use them proactively (e.g. save a drafted report to a canvas, or schedule a deadline reminder) \
and whenever the user explicitly asks for a Slack action.

## BOUNDARIES
- Stay focused on helping nonprofit staff: grants, reports, donor thank-yous, volunteer
  announcements, meeting summaries, deadlines, and communication
- Never invent specifics, for anything. Follow GET THE FACTS FIRST — think it through, check real tools, and ask rather than guess.
- If you are unsure what the person needs, ask a short, friendly question first`;

/**
 * Fixed system-prompt context that makes Kala an Arts & Culture specialist. It
 * frames every example, tone, and metric toward the arts and culture sector, and
 * turns on the funding-match behavior (the track_match tool) that arts grants need.
 * Appended to the base prompt on every run — Kala serves arts and culture
 * nonprofits exclusively, so there is no per-user branching.
 */
export const ARTS_CULTURE_CONTEXT =
  '\n\n## YOUR FOCUS: ARTS & CULTURE\n' +
  'You work exclusively with arts and culture nonprofits — performing arts groups, museums, galleries, ' +
  'community arts organizations, cultural institutions, and the artists and audiences they serve. Tailor your ' +
  'examples, tone, and suggestions to that world: seasons and programming, exhibitions and performances, artist ' +
  'support and fees, audience and community engagement, education and outreach. When you draft impact language, ' +
  'reach for arts-relevant metrics — attendance and audience reach, community engagement, number of artists ' +
  'supported, performances or exhibitions held, education and outreach participation — rather than generic ' +
  'service-delivery numbers. Never force it: if a request is plainly generic, just answer it well.' +
  '\n\n## MATCH TRACKER (arts and culture funding match)\n' +
  `Many arts grants — including National Endowment for the Arts (${ARTS_CULTURE.match.source}) organizational ` +
  `grants — require a mandatory ${ARTS_CULTURE.match.ratio} nonfederal match: for every federal dollar awarded, ` +
  'the organization must raise a dollar from non-federal sources. Use the track_match tool to remember how much ' +
  'match this organization needs and how much it has raised, and to report progress. When the user mentions an ' +
  `${ARTS_CULTURE.match.source} (or similar) grant amount, note that the required match equals that amount and ` +
  'offer to track it. When they mention money raised toward the match, record the new running total (an absolute ' +
  'total, not an increment). Always report raised versus required and how much is left. This is latent: only ' +
  'bring it up when match or fundraising progress is actually in play.';

/**
 * Extra system-prompt context naming the most recent draft in this conversation,
 * so an edit request ("make it shorter") reliably targets it. The draft itself is
 * already in the conversation history; this just flags that one is pending.
 * @param {{ type: string, content: string } | null} [lastDraft]
 * @returns {string}
 */
function draftContext(lastDraft) {
  if (!lastDraft) return '';
  return (
    `\n\n## PENDING DRAFT\nThe most recent draft you produced in this conversation is a ${lastDraft.type}. ` +
    'If the user asks to shorten, lengthen, translate, or change the tone of it, revise THAT draft ' +
    'and return the full updated version rather than starting over.'
  );
}

/**
 * Build the "time saved" outcome line to append after a grant search, report, or
 * summary. Uses the real response time, and records the timing in the feedback log.
 * Returns '' for responses that aren't one of those three.
 * @param {Set<string>} toolsUsed - Tool names invoked during the run.
 * @param {number} elapsedMs
 * @returns {string}
 */
function outcomeMetricLine(toolsUsed, elapsedMs) {
  const names = [...toolsUsed].join(' ');
  const seconds = Math.max(1, Math.round(elapsedMs / 1000));

  /** @type {'grants' | 'report' | 'summary' | null} */
  let tool = null;
  let line = '';
  if (names.includes('find_grants')) {
    tool = 'grants';
    line = `⏱ Found in ~${seconds} seconds. Manual research typically takes 2-3 hours.`;
  } else if (names.includes('draft_impact_report')) {
    tool = 'report';
    line = `⏱ Drafted in ~${seconds} seconds. Writing this manually typically takes 45-60 minutes.`;
  } else if (names.includes('summarize_meeting')) {
    tool = 'summary';
    line = `⏱ Summarized in ~${seconds} seconds. Saves ~15 minutes of note-taking.`;
  }

  if (!tool) return '';
  recordTiming({ tool, seconds, timestamp: new Date().toISOString() });
  return `\n\n${line}`;
}

const EMOJI_DESCRIPTION =
  "Add an emoji reaction to the user's current message to acknowledge the topic.\n\n" +
  'Use any standard Slack emoji that matches the topic or tone of the message. ' +
  'Be warm and specific — the examples below are common picks, not the full set:\n' +
  '- Grants/funding: moneybag, seedling, mag, sparkles\n' +
  '- Reports/writing: memo, pencil2, page_facing_up\n' +
  '- Deadlines/time: alarm_clock, hourglass_flowing_sand, calendar\n' +
  '- Good news/celebration: tada, raised_hands, partying_face, star-struck\n' +
  '- Gratitude/encouragement: pray, blush, heart, sunflower\n' +
  '- Thinking/clarifying: thinking_face, speech_balloon\n' +
  '- Agreement/acknowledgment: thumbsup, ok_hand, +1\n\n' +
  'Do not use eyes (added automatically) or white_check_mark (reserved for mark_resolved).';

/** @type {string[]} */
const ALLOWED_TOOLS = [
  'add_emoji_reaction',
  'create_volunteer_announcement',
  'draft_donor_thankyou',
  'draft_impact_report',
  'find_grants',
  'mark_resolved',
  'post_to_channel',
  'prep_briefing',
  'search_workspace',
  'summarize_meeting',
  'track_deadline',
  'track_engagement',
  'update_engagement',
  'engagement_status',
  'track_event',
  'update_event',
  'event_status',
  'track_schedule_change',
  'acknowledge_change',
  'schedule_status',
];

const SLACK_MCP_URL = 'https://mcp.slack.com/mcp';

/**
 * @typedef {Object} KalaDeps
 * @property {import('@slack/web-api').WebClient} client
 * @property {string} userId
 * @property {string} channelId
 * @property {string} threadTs
 * @property {string} messageTs
 * @property {string} [userToken]
 */

/**
 * Run the Kala agent with the given text and optional session ID.
 * @param {string} text - The user's message text.
 * @param {string} [sessionId] - An existing session ID to resume conversation.
 * @param {KalaDeps} [deps] - Dependencies for tools that need Slack API access.
 * @returns {Promise<{responseText: string, sessionId: string | null, toolsUsed: string[], grants: import('./tools/grant-finder.js').GrantResult[], draft: { type: string, content: string } | null}>}
 */
export async function runKalaAgent(text, sessionId = undefined, deps = undefined) {
  // Closure-based tools that need deps for Slack API access
  const addEmojiReactionTool = tool(
    'add_emoji_reaction',
    EMOJI_DESCRIPTION,
    {
      emoji_name: z.string().describe("The Slack emoji name without colons (e.g. 'memo', 'seedling', 'alarm_clock')."),
    },
    async ({ emoji_name }) => {
      if (!deps?.messageTs) {
        return { content: [{ type: 'text', text: 'No message to react to here.' }] };
      }

      // Skip ~15% of reactions to feel more natural
      if (Math.random() < 0.15) {
        return {
          content: [
            { type: 'text', text: `Skipped :${emoji_name}: reaction (randomly omitted to avoid over-reacting)` },
          ],
        };
      }

      try {
        await deps.client.reactions.add({
          channel: deps.channelId,
          timestamp: deps.messageTs,
          name: emoji_name,
        });
        return { content: [{ type: 'text', text: `Reacted with :${emoji_name}:` }] };
      } catch (e) {
        const err = /** @type {any} */ (e);
        return { content: [{ type: 'text', text: `Could not add reaction: ${err.data?.error || err.message}` }] };
      }
    },
  );

  const markResolvedTool = tool(
    'mark_resolved',
    "Mark the user's request as resolved by adding a green check mark reaction to the parent thread message. " +
      'Call this once when the request is fully handled — e.g. grants shared, report drafted, reminder set.',
    {},
    async () => {
      if (!deps?.threadTs) {
        return { content: [{ type: 'text', text: 'No thread to mark resolved here.' }] };
      }

      try {
        await deps.client.reactions.add({
          channel: deps.channelId,
          timestamp: deps.threadTs,
          name: 'white_check_mark',
        });
        return { content: [{ type: 'text', text: 'Thread marked as resolved.' }] };
      } catch (e) {
        const err = /** @type {any} */ (e);
        return { content: [{ type: 'text', text: `Could not mark resolved: ${err.data?.error || err.message}` }] };
      }
    },
  );

  const postToChannelTool = tool(
    'post_to_channel',
    'Post a message (such as a volunteer announcement) to a Slack channel. Use this ONLY after the ' +
      'user has confirmed and named a channel. When a user types a channel like #general, Slack turns it ' +
      'into a <#C0123456|general> link — pass that channel ID as `channel`, and the full message as `message`.',
    {
      channel: z
        .string()
        .describe('The target channel ID (e.g. "C0123456"), taken from the <#C...|name> link the user typed.'),
      message: z.string().describe('The full message text to post to the channel.'),
    },
    async ({ channel, message }) => {
      if (!deps) {
        return { content: [{ type: 'text', text: 'No deps available to post.' }] };
      }
      // Accept a raw <#C123|name> link, a #name, or a bare id — extract the id.
      const channelId = channel.replace(/^<#/, '').replace(/>$/, '').split('|')[0].replace(/^#/, '');
      try {
        await deps.client.chat.postMessage({ channel: channelId, text: message });
        return { content: [{ type: 'text', text: `Posted the message to <#${channelId}>.` }] };
      } catch (e) {
        const err = /** @type {any} */ (e);
        return {
          content: [
            {
              type: 'text',
              text:
                `Could not post to that channel (${err.data?.error || err.message}). ` +
                'Ask the user to pick the channel using the # menu so you get a valid channel link, ' +
                'and note I can only post to channels I have access to.',
            },
          ],
        };
      }
    },
  );

  const trackDeadlineTool = tool(
    'track_deadline',
    'Remember a grant, compliance, or report deadline and automatically nudge the user (or a named ' +
      'owner) in this Slack channel before it is due. Use this when someone wants to be reminded about a ' +
      'deadline later, not just shown a reminder message now. Confirm what you saved and when the nudge ' +
      'will arrive.',
    {
      title: z.string().describe('What is due, e.g. "Ford Foundation final report" or "Q3 compliance filing".'),
      due_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use ISO format YYYY-MM-DD.')
        .describe('The due date in YYYY-MM-DD format.'),
      owner: z.string().optional().describe('Who is responsible (a Slack @name or user id), if named.'),
      remind_days_before: z
        .number()
        .int()
        .min(0)
        .max(90)
        .optional()
        .describe('How many days before the due date to send the reminder (default 7).'),
      notes: z.string().optional().describe('Any extra context to include in the reminder.'),
    },
    async ({ title, due_date, owner, remind_days_before = 7, notes }) => {
      if (!deps?.channelId) {
        return {
          content: [{ type: 'text', text: "I can't set an automatic reminder here — there's no channel to post to." }],
        };
      }

      const record = addDeadline({
        title,
        dueDate: due_date,
        remindDaysBefore: remind_days_before,
        channelId: deps.channelId,
        createdBy: deps.userId,
        owner,
        notes,
      });

      const remaining = daysUntil(due_date);
      const when =
        remaining < 0
          ? `Heads up — that date is already ${Math.abs(remaining)} day(s) past, so I'll nudge on the next check.`
          : remaining <= remind_days_before
            ? `That's within the reminder window, so I'll nudge here shortly.`
            : `I'll nudge here about ${remaining - remind_days_before} day(s) from now (${remind_days_before} day(s) before it's due).`;

      const ownerLine = owner ? ` Owner: ${owner}.` : '';
      return {
        content: [
          {
            type: 'text',
            text: `Saved \`${record.id}\`: *${title}* — due *${due_date}*.${ownerLine} ${when}`,
          },
        ],
      };
    },
  );

  // Flagship tool for arts & culture: track progress toward a required nonfederal
  // grant match (e.g. an NEA 1:1 match). State is scoped to channel+user and lives
  // in match-store, so progress carries across conversations.
  const trackMatchTool = tool(
    'track_match',
    'Track progress toward a required nonfederal grant match (for example, an NEA 1:1 match, where the ' +
      'organization must raise a dollar for every federal dollar). Records how much match is needed and how much ' +
      'has been raised so far, scoped to this channel, and reports raised versus required. Pass the grant amount ' +
      'as the required match and the running total raised. Call with no arguments to just report current progress.',
    {
      required_match: z
        .number()
        .optional()
        .describe(
          'Total nonfederal match required, in dollars. For a 1:1 NEA match this equals the grant amount, e.g. 50000.',
        ),
      raised_so_far: z
        .number()
        .optional()
        .describe('Total match raised so far, in dollars — the running total, not an amount to add on.'),
      campaign: z.string().optional().describe('What the match is for, e.g. "NEA Challenge America 2026", if named.'),
    },
    async ({ required_match, raised_so_far, campaign }) => {
      if (!deps?.channelId || !deps?.userId) {
        return { content: [{ type: 'text', text: "I can't track a match here — there's no channel to tie it to." }] };
      }

      const hasInput = required_match != null || raised_so_far != null || campaign != null;
      const record = hasInput
        ? setMatch({
            channelId: deps.channelId,
            userId: deps.userId,
            required: required_match,
            raised: raised_so_far,
            campaign,
          })
        : getMatch({ channelId: deps.channelId, userId: deps.userId });

      const status = matchStatus(record);
      if (!status) {
        return {
          content: [
            {
              type: 'text',
              text: 'No match is being tracked yet. Tell me the grant amount (the required 1:1 match) and I will start tracking it.',
            },
          ],
        };
      }

      const usd = (/** @type {number} */ n) => `$${Math.round(n).toLocaleString('en-US')}`;
      const forCampaign = status.campaign ? ` for *${status.campaign}*` : '';
      const text =
        status.required > 0
          ? `Match${forCampaign}: raised *${usd(status.raised)}* of *${usd(status.required)}* required (${status.percent}%). ${usd(status.remaining)} to go.`
          : `Match${forCampaign}: raised *${usd(status.raised)}* so far. Tell me the required match (the grant amount) and I'll track how much is left.`;
      return { content: [{ type: 'text', text }] };
    },
  );

  // Artist & contractor engagement tracker. State is scoped to the Slack channel
  // (a team shares one list) and lives in engagement-store, so it persists across
  // conversations. Three tools: add, update status, and a status digest.
  const trackEngagementTool = tool(
    'track_engagement',
    'Start tracking an artist or contractor engagement — the paperwork and payment lifecycle for one person on ' +
      'one project. Use when the user wants to keep tabs on a new artist/contractor (e.g. "track a new engagement ' +
      'with Maya Lin for the fall show"). It starts with everything at the earliest state: contract not sent, W-9 ' +
      'missing, invoice not submitted. Confirm what you started tracking.',
    {
      artist: z.string().describe('The artist or contractor\'s name, e.g. "Maya Lin".'),
      project: z.string().describe('The project or event this engagement is for, e.g. "Fall Show" or "Winter Gala".'),
    },
    async ({ artist, project }) => {
      if (!deps?.channelId) {
        return {
          content: [{ type: 'text', text: "I can't track an engagement here — there's no channel to tie it to." }],
        };
      }
      const e = addEngagement({ artist, project, channelId: deps.channelId, createdBy: deps.userId, now: Date.now() });
      return {
        content: [
          {
            type: 'text',
            text: `Tracking \`${e.id}\`: *${e.artist}* for *${e.project}*. Starting state — contract not sent, W-9 missing, invoice not submitted. Tell me when any of those change.`,
          },
        ],
      };
    },
  );

  const updateEngagementTool = tool(
    'update_engagement',
    'Update the status of a tracked artist/contractor engagement — contract, W-9, or invoice. Use for anything like ' +
      '"mark Maya\'s contract as signed", "got Jun\'s W-9", or "the fall show invoice is paid". Identify the ' +
      'engagement by the artist name (add the project if two artists share a name), or by its ENG- id from a digest. ' +
      'Pass only the fields that changed. Confirm the new status back.',
    {
      artist: z.string().optional().describe('The artist/contractor name to locate the engagement (fuzzy match).'),
      project: z
        .string()
        .optional()
        .describe('The project, to disambiguate if the artist has more than one engagement.'),
      id: z.string().optional().describe('The exact engagement id (e.g. "ENG-3") when known, instead of the name.'),
      contract_status: z
        .enum(['not_sent', 'sent', 'signed'])
        .optional()
        .describe('New contract status, if it changed.'),
      w9_status: z.enum(['missing', 'received']).optional().describe('New W-9 status, if it changed.'),
      invoice_status: z
        .enum(['not_submitted', 'submitted', 'paid'])
        .optional()
        .describe('New invoice status, if it changed.'),
    },
    async ({ artist, project, id, contract_status, w9_status, invoice_status }) => {
      if (!deps?.channelId) {
        return {
          content: [{ type: 'text', text: "I can't update an engagement here — there's no channel to tie it to." }],
        };
      }

      // Resolve which engagement to update: an explicit in-channel id wins;
      // otherwise match on artist name (and project, if given, to disambiguate).
      let target = null;
      if (id) {
        const found = getEngagement(id);
        if (found && found.channelId === deps.channelId) target = found;
      } else if (artist) {
        let matches = findEngagements(deps.channelId, artist);
        if (project) {
          const p = project.trim().toLowerCase();
          matches = matches.filter((e) => e.project.toLowerCase().includes(p));
        }
        if (matches.length === 1) target = matches[0];
        else if (matches.length > 1) {
          const list = matches.map((e) => `- ${describeEngagement(e)}`).join('\n');
          return {
            content: [
              {
                type: 'text',
                text: `More than one engagement matches. Which one? Tell me the id or the project.\n${list}`,
              },
            ],
          };
        }
      }

      if (!target) {
        return {
          content: [
            {
              type: 'text',
              text: "I couldn't find a matching engagement. Want me to start tracking a new one instead?",
            },
          ],
        };
      }

      const updated = updateEngagement(
        target.id,
        { contractStatus: contract_status, w9Status: w9_status, invoiceStatus: invoice_status },
        Date.now(),
      );
      if (!updated) {
        return { content: [{ type: 'text', text: 'That engagement is no longer being tracked.' }] };
      }
      return { content: [{ type: 'text', text: `Updated ${describeEngagement(updated)}` }] };
    },
  );

  const engagementStatusTool = tool(
    'engagement_status',
    'Report on tracked artist/contractor engagements: a status digest, who is unpaid, what is still outstanding, or ' +
      'what is overdue. Use for "who\'s unpaid", "what\'s outstanding for the fall show", or "any overdue contracts". ' +
      'Overdue means a contract sent but unsigned for more than 7 days, or an invoice submitted but unpaid for more ' +
      'than 14 days. Returns each engagement with its statuses (and the reason, when overdue) so you can summarize ' +
      'and, if asked, draft a polite follow-up to the artist.',
    {
      filter: z
        .string()
        .optional()
        .describe('Limit to engagements whose artist or project matches this text, e.g. "fall show".'),
      state: z
        .enum(['all', 'outstanding', 'unpaid', 'overdue'])
        .optional()
        .describe(
          'Which engagements to include. "outstanding" = anything not fully done; "unpaid" = invoice not paid; "overdue" = past the 7/14-day thresholds. Default "all".',
        ),
    },
    async ({ filter, state = 'all' }) => {
      if (!deps?.channelId) {
        return {
          content: [{ type: 'text', text: "I can't check engagements here — there's no channel to tie them to." }],
        };
      }
      const now = Date.now();

      if (state === 'overdue') {
        let overdue = getOverdueEngagements(deps.channelId, now);
        if (filter) {
          const q = filter.trim().toLowerCase();
          overdue = overdue.filter(
            (o) => o.engagement.artist.toLowerCase().includes(q) || o.engagement.project.toLowerCase().includes(q),
          );
        }
        if (!overdue.length) {
          return { content: [{ type: 'text', text: 'Nothing is overdue right now.' }] };
        }
        const lines = overdue.map((o) => `- ${describeEngagement(o.engagement)} — ${o.reasons.join('; ')}`).join('\n');
        return { content: [{ type: 'text', text: `Overdue engagements:\n${lines}` }] };
      }

      let items = findEngagements(deps.channelId, filter);
      if (state === 'outstanding') items = items.filter(isOutstanding);
      else if (state === 'unpaid') items = items.filter(isUnpaid);

      if (!items.length) {
        const scope = filter ? ` matching "${filter}"` : '';
        return {
          content: [{ type: 'text', text: `No ${state === 'all' ? '' : `${state} `}engagements${scope} yet.` }],
        };
      }
      const lines = items.map((e) => `- ${describeEngagement(e)}`).join('\n');
      const heading =
        state === 'unpaid' ? 'Unpaid engagements' : state === 'outstanding' ? 'Outstanding engagements' : 'Engagements';
      return { content: [{ type: 'text', text: `${heading}:\n${lines}` }] };
    },
  );

  // Free event RSVP & attendance tracker. Events are scoped to the Slack channel
  // and live in event-store, so RSVPs collected by the button (handled in
  // listeners/actions/event-buttons.js) and by staff persist across conversations.
  const trackEventTool = tool(
    'track_event',
    'Start tracking RSVPs for a free event (a gallery opening, a performance, a community night). Use when the ' +
      'user wants a head count, e.g. "track RSVPs for the gallery opening on the 14th". Pass the event title and, ' +
      'if given, the date (prefer YYYY-MM-DD). This posts a sign-up card with an "I\'ll be there" button to this ' +
      'channel so people can confirm with one tap. Confirm what you set up.',
    {
      title: z.string().describe('The event name, e.g. "Gallery Opening".'),
      date: z.string().optional().describe('When it happens, ideally YYYY-MM-DD (convert a plain date the user gave).'),
    },
    async ({ title, date }) => {
      if (!deps?.channelId) {
        return {
          content: [{ type: 'text', text: "I can't track an event here — there's no channel to post the sign-up in." }],
        };
      }
      const event = addEvent({ title, date, channelId: deps.channelId, createdBy: deps.userId, now: Date.now() });
      // Post the RSVP card so people can confirm with the button.
      try {
        await deps.client.chat.postMessage({
          channel: deps.channelId,
          text: buildRsvpText(event),
          blocks: buildRsvpMessageBlocks(event),
        });
      } catch {
        // If posting fails, the event is still tracked; the user can add RSVPs by name.
      }
      const when = event.date ? ` on *${event.date}*` : '';
      return {
        content: [
          {
            type: 'text',
            text: `Tracking RSVPs for *${event.title}*${when} (\`${event.id}\`). I posted a sign-up card with an "I'll be there" button in this channel. Ask me for the head count anytime.`,
          },
        ],
      };
    },
  );

  const updateEventTool = tool(
    'update_event',
    'Update a tracked event: add people who confirmed another way (e.g. by email) to its RSVP list, and/or record ' +
      'the actual head count after the event. Use for "add Sarah and Tom to the gallery opening" or "we had 60 ' +
      'people at the opening". Identify the event by title (or EVT- id). Confirm the new numbers.',
    {
      event: z.string().describe('The event to update — its title (fuzzy) or EVT- id.'),
      add_attendees: z
        .array(z.string())
        .optional()
        .describe('Names of people who confirmed outside Slack, to add to the RSVP list.'),
      actual_attendance: z
        .number()
        .optional()
        .describe('The actual head count after the event, if recording it (may differ from RSVPs).'),
    },
    async ({ event, add_attendees, actual_attendance }) => {
      if (!deps?.channelId) {
        return { content: [{ type: 'text', text: "I can't update an event here — there's no channel to tie it to." }] };
      }
      const matches = findEvents(deps.channelId, event);
      if (matches.length === 0) {
        return { content: [{ type: 'text', text: "I couldn't find that event. Want me to start tracking it?" }] };
      }
      if (matches.length > 1) {
        const list = matches.map((e) => `- ${e.id}: ${e.title}`).join('\n');
        return { content: [{ type: 'text', text: `More than one event matches. Which one?\n${list}` }] };
      }
      const target = matches[0];
      let added = 0;
      for (const name of add_attendees ?? []) {
        if (addRsvp(target.id, { who: name })?.added) added++;
      }
      if (typeof actual_attendance === 'number') setActualAttendance(target.id, actual_attendance);

      const s = attendanceSummary(target);
      const bits = [`*${s.title}*: ${s.confirmed} confirmed RSVP${s.confirmed === 1 ? '' : 's'}`];
      if (s.actual != null) bits.push(`${s.actual} actually attended`);
      const addedNote = added ? ` Added ${added} attendee${added === 1 ? '' : 's'}.` : '';
      return { content: [{ type: 'text', text: `${bits.join(', ')}.${addedNote}` }] };
    },
  );

  const eventStatusTool = tool(
    'event_status',
    'Report on tracked events: a live RSVP head count before the event, or a post-event attendance summary ready ' +
      'to paste into a funder report. Use for "how many are coming to the opening", "give me the attendance summary ' +
      'for the gala", or to pull real attendance numbers when drafting a report that references a tracked event. ' +
      'Returns the confirmed RSVP count, the actual head count (if recorded), and the attendee names.',
    {
      event: z.string().optional().describe('Limit to one event by title (fuzzy) or EVT- id. Omit to list all events.'),
    },
    async ({ event }) => {
      if (!deps?.channelId) {
        return { content: [{ type: 'text', text: "I can't check events here — there's no channel to tie them to." }] };
      }
      const matches = event ? findEvents(deps.channelId, event) : listEvents(deps.channelId);
      if (matches.length === 0) {
        return {
          content: [
            { type: 'text', text: event ? `No event matches "${event}".` : 'No events are being tracked yet.' },
          ],
        };
      }

      const lines = matches.map((e) => {
        const s = attendanceSummary(e);
        const when = s.date ? ` (${s.date})` : '';
        const actual = s.actual != null ? `, ${s.actual} attended` : '';
        const names = s.names.length ? ` — ${s.names.join(', ')}` : '';
        return `- *${s.title}*${when}: ${s.confirmed} confirmed RSVP${s.confirmed === 1 ? '' : 's'}${actual}${names}`;
      });
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  // Schedule-change acknowledgment tracker (tech week / install week / crunch).
  // Changes are scoped to the channel and live in schedule-store; acks arrive by
  // the "Acknowledge" button (listeners/actions/schedule-buttons.js) or by a
  // reaction to the posted card (listeners/events/reaction-added.js).
  const trackScheduleChangeTool = tool(
    'track_schedule_change',
    'Track acknowledgment of a schedule change during a crunch period (tech week, install week). Use when the ' +
      'user says something like "track this as a schedule change, everyone needs to confirm". Pass the change text ' +
      'and the list of people who must confirm (their Slack mentions if given). It posts an "Acknowledge" card to ' +
      'the channel; people confirm with the button or by reacting to it. Confirm what you set up.',
    {
      change: z
        .string()
        .describe('The schedule change everyone must acknowledge, e.g. "Tech rehearsal moved to 9am Saturday".'),
      who_must_confirm: z
        .array(z.string())
        .optional()
        .describe('The people who must acknowledge — Slack mentions (<@U…>) when the user @-mentioned them, or names.'),
    },
    async ({ change, who_must_confirm }) => {
      if (!deps?.channelId) {
        return {
          content: [{ type: 'text', text: "I can't track a schedule change here — there's no channel to post it in." }],
        };
      }
      const record = addScheduleChange({
        change,
        people: who_must_confirm ?? [],
        channelId: deps.channelId,
        createdBy: deps.userId,
        now: Date.now(),
      });
      // Post the acknowledgment card and remember it so reactions on it count.
      try {
        const posted = await deps.client.chat.postMessage({
          channel: deps.channelId,
          text: buildScheduleAckText(record),
          blocks: buildScheduleAckBlocks(record),
        });
        if (posted?.ts) setMessageRef(record.id, { channel: deps.channelId, ts: /** @type {string} */ (posted.ts) });
      } catch {
        // If posting fails, the change is still tracked; acks can be added by name.
      }
      const n = record.roster.length;
      const rosterNote = n
        ? `${n} ${n === 1 ? 'person needs' : 'people need'} to confirm`
        : 'no one is on the confirm list yet — tell me who needs to confirm';
      return {
        content: [
          {
            type: 'text',
            text: `Tracking this schedule change (\`${record.id}\`) and posted an "Acknowledge" card to the channel — ${rosterNote}. Ask me anytime who hasn't confirmed.`,
          },
        ],
      };
    },
  );

  const acknowledgeChangeTool = tool(
    'acknowledge_change',
    'Manually mark people as having acknowledged a tracked schedule change — for when someone confirmed verbally ' +
      'or by email rather than tapping the button. Identify the change by its text (fuzzy) or CHG- id, and list the ' +
      'people. Confirm the updated tally.',
    {
      change: z.string().describe('The schedule change to update — its text (fuzzy) or CHG- id.'),
      people: z.array(z.string()).describe('The people who acknowledged — Slack mentions or names.'),
    },
    async ({ change, people }) => {
      if (!deps?.channelId) {
        return {
          content: [{ type: 'text', text: "I can't update a schedule change here — there's no channel to tie it to." }],
        };
      }
      const matches = findScheduleChanges(deps.channelId, change);
      if (matches.length === 0) {
        return {
          content: [{ type: 'text', text: "I couldn't find that schedule change. Want me to start tracking it?" }],
        };
      }
      if (matches.length > 1) {
        const list = matches.map((c) => `- ${c.id}: ${c.change}`).join('\n');
        return { content: [{ type: 'text', text: `More than one change matches. Which one?\n${list}` }] };
      }
      const target = matches[0];
      for (const name of people ?? []) acknowledge(target.id, { name });
      const s = ackSummary(target);
      const waiting = s.pending.length ? ` Still waiting on: ${s.pending.join(', ')}.` : ' Everyone has confirmed.';
      return {
        content: [{ type: 'text', text: `*${target.change}* — ${s.acked} of ${s.total} confirmed.${waiting}` }],
      };
    },
  );

  const scheduleStatusTool = tool(
    'schedule_status',
    'Report who has and has not acknowledged a tracked schedule change — the "who hasn\'t confirmed yet" list. ' +
      'Use for "who still needs to confirm the schedule change" or "did everyone see the new call time". Returns ' +
      'the tally and the names still outstanding, so you can offer to draft a direct nudge to them.',
    {
      change: z.string().optional().describe('Limit to one change by text (fuzzy) or CHG- id. Omit to list all.'),
    },
    async ({ change }) => {
      if (!deps?.channelId) {
        return {
          content: [{ type: 'text', text: "I can't check schedule changes here — there's no channel to tie them to." }],
        };
      }
      const matches = change ? findScheduleChanges(deps.channelId, change) : listScheduleChanges(deps.channelId);
      if (matches.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: change ? `No schedule change matches "${change}".` : 'No schedule changes are being tracked yet.',
            },
          ],
        };
      }
      const lines = matches.map((c) => {
        const s = ackSummary(c);
        const waiting = s.pending.length ? `still waiting on ${s.pending.join(', ')}` : 'everyone confirmed';
        return `- *${c.change}* (${c.id}): ${s.acked}/${s.total} confirmed — ${waiting}`;
      });
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  const searchWorkspaceTool = tool(
    'search_workspace',
    "Search the team's Slack workspace in real time for messages and files relevant to a query — " +
      'past grant discussions, donor updates, decisions, who owns a deadline, and more. Use this when the ' +
      'user asks about something the team talked about, or to gather real context before drafting a report ' +
      "or reply. Returns snippets with links; summarize them in the user's language.",
    {
      query: z
        .string()
        .describe(
          'What to look for — a natural-language question or keywords, e.g. "Ford Foundation grant" or "annual report deadline".',
        ),
      include_files: z.boolean().optional().describe('Also search shared files, not just messages. Default false.'),
      limit: z.number().int().min(1).max(20).optional().describe('Max results to return (1-20). Default 10.'),
    },
    async ({ query, include_files = false, limit = 10 }) => {
      const result = await searchWorkspaceContext({
        userToken: deps?.userToken,
        query,
        contentTypes: include_files ? ['messages', 'files'] : ['messages'],
        limit,
      });
      return { content: [{ type: 'text', text: formatWorkspaceResults(query, result) }] };
    },
  );

  // Prep briefing: gather workspace mentions + open asks + tracked deadlines for a
  // subject, and hand the model organized material to write a short briefing from.
  const prepBriefingTool = tool(
    'prep_briefing',
    PREP_BRIEFING_DESCRIPTION,
    PREP_BRIEFING_SCHEMA,
    async ({ subject }) => {
      const text = await gatherBriefing({ subject, userToken: deps?.userToken });
      return { content: [{ type: 'text', text }] };
    },
  );

  // Capture structured grant results out-of-band so the caller can render native
  // cards. The text the tool returns to the model is unchanged, so reasoning and
  // prose are unaffected. Grant search is biased toward the arts and culture
  // funding categories by default.
  /** @type {import('./tools/grant-finder.js').GrantResult[]} */
  const collectedGrants = [];
  const findGrantsTool = createFindGrantsTool((grants) => {
    collectedGrants.length = 0;
    collectedGrants.push(...grants);
  }, ARTS_CULTURE.defaultGrantCategories);

  // Capture the most recent draft (thank-you, report, announcement) so a follow-up
  // edit can target it. The tool text returned to the model is unchanged.
  /** @type {{ type: string, content: string } | null} */
  let collectedDraft = null;
  const onDraft = (/** @type {{ type: string, content: string }} */ draft) => {
    collectedDraft = draft;
  };

  const kalaToolsServer = createSdkMcpServer({
    name: 'kala-tools',
    version: '1.0.0',
    tools: [
      addEmojiReactionTool,
      createVolunteerAnnouncementTool(onDraft),
      createDraftDonorThankYouTool(onDraft),
      createDraftImpactReportTool(onDraft),
      findGrantsTool,
      markResolvedTool,
      postToChannelTool,
      prepBriefingTool,
      searchWorkspaceTool,
      summarizeMeetingTool,
      trackDeadlineTool,
      trackMatchTool,
      trackEngagementTool,
      updateEngagementTool,
      engagementStatusTool,
      trackEventTool,
      updateEventTool,
      eventStatusTool,
      trackScheduleChangeTool,
      acknowledgeChangeTool,
      scheduleStatusTool,
    ],
  });

  /** @type {Record<string, any>} */
  const mcpServers = { 'kala-tools': kalaToolsServer };
  const allowedTools = [...ALLOWED_TOOLS, 'track_match'];

  if (deps?.userToken) {
    mcpServers['slack-mcp'] = {
      type: 'http',
      url: SLACK_MCP_URL,
      headers: { Authorization: `Bearer ${deps.userToken}` },
    };
    allowedTools.push('mcp__slack-mcp__*');
  }

  // If a draft is pending in this conversation, tell the model so an edit request
  // reliably targets it (the draft content itself is already in the session history).
  const pendingDraft =
    deps?.channelId && deps?.threadTs ? sessionStore.getLastDraft(deps.channelId, deps.threadTs) : null;

  /** @type {import('@anthropic-ai/claude-agent-sdk').Options} */
  const options = {
    systemPrompt: KALA_SYSTEM_PROMPT + ARTS_CULTURE_CONTEXT + draftContext(pendingDraft),
    mcpServers,
    allowedTools,
    permissionMode: 'bypassPermissions',
    ...(sessionId && { resume: sessionId }),
  };

  const responseParts = [];
  let newSessionId = null;
  /** @type {Set<string>} */
  const toolsUsed = new Set();
  const startTime = Date.now();

  for await (const message of query({ prompt: text, options })) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') {
          responseParts.push(block.text);
        } else if (block.type === 'tool_use') {
          toolsUsed.add(block.name);
        }
      }
    }
    if (message.type === 'result') {
      newSessionId = message.session_id;
    }
  }

  let responseText = responseParts.join('\n');
  responseText += outcomeMetricLine(toolsUsed, Date.now() - startTime);

  // Remember a freshly created draft so a follow-up edit in this thread can target it.
  if (collectedDraft && deps?.channelId && deps?.threadTs) {
    sessionStore.setLastDraft(deps.channelId, deps.threadTs, collectedDraft);
  }

  return {
    responseText,
    sessionId: newSessionId,
    toolsUsed: [...toolsUsed],
    grants: collectedGrants,
    draft: collectedDraft,
  };
}
