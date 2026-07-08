import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { draftImpactReportTool, findGrantsTool, remindDeadlineTool } from './tools/index.js';

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
- Short and clear. Plain text. A few sentences at most
- No jargon, no acronyms, no technical terms unless the user uses them first
- No forms, no menus, no button lists — just talk to the person
- End with one clear, friendly next step when it helps
- Use emoji very sparingly — at most one, only to set a warm tone

## WORKFLOW
1. Understand what the person needs, and ask a short clarifying question if it is unclear
2. Use the right tool:
   - "find_grants" when they are looking for funding or grant opportunities
   - "draft_impact_report" when they need a report written from a short description of their impact
   - "remind_deadline" when they want a reminder for a grant deadline
3. Summarize the tool's result simply, in the user's language, and offer a next step

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
- Stay focused on helping nonprofit staff with grants, reports, deadlines, and communication
- Do not invent grant details, amounts, or deadlines — always use the provided tools
- If you are unsure what the person needs, ask a short, friendly question first`;

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
const ALLOWED_TOOLS = ['add_emoji_reaction', 'draft_impact_report', 'find_grants', 'mark_resolved', 'remind_deadline'];

const SLACK_MCP_URL = 'https://mcp.slack.com/mcp';

/**
 * @typedef {Object} BenvuDeps
 * @property {import('@slack/web-api').WebClient} client
 * @property {string} userId
 * @property {string} channelId
 * @property {string} threadTs
 * @property {string} messageTs
 * @property {string} [userToken]
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
      if (!deps) {
        return { content: [{ type: 'text', text: 'No deps available to add reaction.' }] };
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
      if (!deps) {
        return { content: [{ type: 'text', text: 'No deps available to mark resolved.' }] };
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

  const benvuToolsServer = createSdkMcpServer({
    name: 'benvu-tools',
    version: '1.0.0',
    tools: [addEmojiReactionTool, draftImpactReportTool, findGrantsTool, markResolvedTool, remindDeadlineTool],
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
    systemPrompt: BENVU_SYSTEM_PROMPT,
    mcpServers,
    allowedTools,
    permissionMode: 'bypassPermissions',
    ...(sessionId && { resume: sessionId }),
  };

  const responseParts = [];
  let newSessionId = null;

  for await (const message of query({ prompt: text, options })) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') {
          responseParts.push(block.text);
        }
      }
    }
    if (message.type === 'result') {
      newSessionId = message.session_id;
    }
  }

  const responseText = responseParts.join('\n');
  return { responseText, sessionId: newSessionId };
}
