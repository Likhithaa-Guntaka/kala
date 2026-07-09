import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { recordTiming } from '../listeners/feedback-store.js';
import { addDeadline, daysUntil } from './tools/deadline-store.js';
import {
  createVolunteerAnnouncementTool,
  draftDonorThankYouTool,
  draftImpactReportTool,
  findGrantsTool,
  summarizeMeetingTool,
} from './tools/index.js';
import { formatWorkspaceResults, searchWorkspaceContext } from './tools/rts.js';

// Authentication.
// Benvu runs on the Claude Agent SDK, which resolves credentials in this order:
//   1. A real ANTHROPIC_API_KEY, if one is provided.
//   2. Otherwise, the logged-in Claude Code session (subscription / OAuth) —
//      no external API key required. This is how Benvu runs in the sandbox.
// Strip empty or placeholder keys (e.g. a leftover `.env` value) so they can
// never override the session credentials. A real `sk-ant-…` key is preserved.
const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
if (!apiKey || apiKey === 'YOUR_ANTHROPIC_API_KEY') {
  delete process.env.ANTHROPIC_API_KEY;
}

/** How Benvu is authenticating to Claude: an explicit API key, or the Claude Code session. */
export const AUTH_MODE = process.env.ANTHROPIC_API_KEY ? 'api-key' : 'claude-code-session';

const BENVU_SYSTEM_PROMPT = `\
You are Benvu, a friendly assistant for nonprofit staff. You help people find grants, \
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
  acronym in parentheses after the full name — e.g. "Substance Abuse and Mental Health
  Services Administration (SAMHSA)". After that first mention, the acronym alone is fine
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
1. Understand what the person needs, and ask a short clarifying question if it is unclear
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
   - "track_deadline" — want Benvu to remember a deadline and automatically nudge them (or
     the team) in this Slack channel before it is due. Use this for anything like "remind me",
     "don't let me forget", or a due date to keep track of. Needs the due date as YYYY-MM-DD
     (ask if it's unclear, or convert a plain date they gave).
   - "post_to_channel" — the user has confirmed they want something posted to a specific channel
3. Present the tool's result simply, in the user's language, keeping its formatting, and offer a next step

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

## SLACK MCP SERVER
You may have access to the Slack MCP Server, which gives you tools beyond your built-in ones. \
Use them whenever they would help — for example searching messages and files, reading channel \
history or threads, sending or scheduling messages, and creating or updating Slack canvases. \
Use them proactively (e.g. save a drafted report to a canvas, or schedule a deadline reminder) \
and whenever the user explicitly asks for a Slack action.

## BOUNDARIES
- Stay focused on helping nonprofit staff: grants, reports, donor thank-yous, volunteer
  announcements, meeting summaries, deadlines, and communication
- Do not invent grant details, amounts, or deadlines — always use the provided tools
- If you are unsure what the person needs, ask a short, friendly question first`;

/**
 * Extra system-prompt context describing the user's organization type, when known,
 * so Benvu tailors its examples and suggestions.
 * @param {string} [orgType]
 * @returns {string}
 */
function orgContext(orgType) {
  if (!orgType) return '';
  return (
    `\n\n## THIS USER'S ORGANIZATION\n` +
    `This person works at a "${orgType}" type of nonprofit. Tailor your examples, tone, ` +
    'and suggestions to that context when it is relevant, without forcing it.'
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
  'search_workspace',
  'summarize_meeting',
  'track_deadline',
];

const SLACK_MCP_URL = 'https://mcp.slack.com/mcp';

/**
 * @typedef {Object} BenvuDeps
 * @property {import('@slack/web-api').WebClient} client
 * @property {string} userId
 * @property {string} channelId
 * @property {string} threadTs
 * @property {string} messageTs
 * @property {string} [userToken]
 * @property {string} [orgType] - The user's org type label, for tailoring responses.
 */

/**
 * Run the Benvu agent with the given text and optional session ID.
 * @param {string} text - The user's message text.
 * @param {string} [sessionId] - An existing session ID to resume conversation.
 * @param {BenvuDeps} [deps] - Dependencies for tools that need Slack API access.
 * @returns {Promise<{responseText: string, sessionId: string | null}>}
 */
export async function runBenvuAgent(text, sessionId = undefined, deps = undefined) {
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

  const benvuToolsServer = createSdkMcpServer({
    name: 'benvu-tools',
    version: '1.0.0',
    tools: [
      addEmojiReactionTool,
      createVolunteerAnnouncementTool,
      draftDonorThankYouTool,
      draftImpactReportTool,
      findGrantsTool,
      markResolvedTool,
      postToChannelTool,
      searchWorkspaceTool,
      summarizeMeetingTool,
      trackDeadlineTool,
    ],
  });

  /** @type {Record<string, any>} */
  const mcpServers = { 'benvu-tools': benvuToolsServer };
  const allowedTools = [...ALLOWED_TOOLS];

  if (deps?.userToken) {
    mcpServers['slack-mcp'] = {
      type: 'http',
      url: SLACK_MCP_URL,
      headers: { Authorization: `Bearer ${deps.userToken}` },
    };
    allowedTools.push('mcp__slack-mcp__*');
  }

  /** @type {import('@anthropic-ai/claude-agent-sdk').Options} */
  const options = {
    systemPrompt: BENVU_SYSTEM_PROMPT + orgContext(deps?.orgType),
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
  return { responseText, sessionId: newSessionId };
}
