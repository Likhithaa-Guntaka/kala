# AGENTS.md - claude-agent-sdk

JavaScript implementation of Kala — an assistant agent for **arts and culture nonprofits** that helps staff find arts funding, draft impact reports, and track deadlines, and replies in the user's own language — built with the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) (`@anthropic-ai/claude-agent-sdk`). Arts and culture is Kala's only focus — there is no org-type selection; the tailoring (grant categories, report metrics, NEA match tracking) lives in `listeners/arts-culture.js`.

See the [root AGENTS.md](../AGENTS.md) for monorepo-wide architecture and shared patterns.

## Setup

```sh
cp .env.sample .env   # Fill in ANTHROPIC_API_KEY, SLACK_BOT_TOKEN, SLACK_APP_TOKEN
npm install
npm start
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `SLACK_BOT_TOKEN` | Bot token (`xoxb-`) |
| `SLACK_APP_TOKEN` | App-level token (`xapp-`) for Socket Mode |
| `SLACK_CLIENT_ID` | OAuth client ID (for `app-oauth.js`) |
| `SLACK_CLIENT_SECRET` | OAuth client secret (for `app-oauth.js`) |
| `SLACK_SIGNING_SECRET` | Signing secret (for `app-oauth.js`) |
| `SLACK_REDIRECT_URI` | OAuth redirect URI (for `app-oauth.js`) |

## Commands

```sh
npm install          # Install dependencies
npm start            # Start the app
npm run lint         # Biome lint and format check
npm run lint:fix     # Auto-fix lint and format issues
npm run check        # Type check JavaScript with tsc (checkJs)
```

## Testing

Tests use the Node.js built-in test runner (`node:test`) and assertion module (`node:assert`).

```sh
npm test             # Run all tests
```

### Conventions

- Test files live in `tests/` and mirror the source directory structure
- File naming: `<source-file>.test.js` (not `.spec.js`)
- Use `describe()` / `it()` / `beforeEach()` blocks from `node:test`
- Use `mock.fn()` from `node:test` for mocking — no external mock libraries
- Assertions use `node:assert` (`strictEqual`, `ok`, `deepStrictEqual`)
- Mock Slack client methods as `mock.fn()` objects with the needed nested structure
- Test files use ES module `import` statements (`"type": "module"`)

### What to Test

- **View builders** — pure functions, test structure and data correctness
- **Listener handlers** — mock `ack`, `client`, `context`, `logger`; verify API calls and error handling
- **SessionStore** — instantiate directly, test CRUD, TTL expiry, and eviction

## Architecture

### Agent Layer

The agent is defined in `agent/kala.js` using the Claude Agent SDK:

- `query({ prompt, options })` returns an async generator of messages
- Tools are defined with `tool()` from the SDK using Zod v4 schemas
- Tools are wrapped in an in-process MCP server via `createSdkMcpServer()`
- Tools return MCP `CallToolResult` format: `{ content: [{ type: 'text', text }] }`
- `permissionMode: 'bypassPermissions'` since all tools are safe
- Model: `claude-sonnet-4-20250514`
- The system prompt instructs Kala to detect the user's language and respond in it

**Authentication.** No external API key is required. The Claude Agent SDK authenticates via the logged-in Claude Code session (subscription / OAuth) when `ANTHROPIC_API_KEY` is unset — this is how Kala runs in the sandbox. `agent/kala.js` strips empty or placeholder keys (so a leftover `.env` value can't override the session) and exports `AUTH_MODE` (`'claude-code-session'` or `'api-key'`), which the app logs at startup. Set a real `sk-ant-…` key only to use the external API instead.

### Conversation Management

`thread-context/store.js` exports a `SessionStore` that stores **session IDs only** (not full message history). The Claude Agent SDK manages conversation history server-side. The store passes `{ resume: sessionId }` on subsequent turns to continue a conversation.

The store uses a `Map` keyed by `${channelId}:${threadTs}` with TTL-based cleanup (1 hour) and a max entry limit (1000).

### Dependency Injection

`runKalaAgent(text, sessionId, deps)` accepts an optional `deps` object with `{ client, userId, channelId, threadTs, messageTs, userToken }`. Tools that need Slack context (emoji reactions, mark resolved, post to channel, track deadline) are created as closures inside `runKalaAgent()` that capture the `deps` parameter. Stateless tools (grant finder, report drafter, etc.) remain as module-level exports in `agent/tools/`.

### Tool Definitions

`agent/tools/` contains Kala's assistant tools and their stores (grant/report tools return simulated data; the trackers hold real in-process state):

- `grant-finder.js` — `find_grants(query)` returns up to 10 grants with name, deadline, amount, and eligibility.
- `report-drafter.js` — `draft_impact_report(impact)` expands a one-line impact description into a full report draft.
- `rts.js` — `search_workspace` (closure in `agent/kala.js`) searches the team's Slack workspace in real time via the **Real-Time Search API** (`assistant.search.context`), using `deps.userToken`. Returns message/file snippets with permalinks for the agent to summarize.
- `track_deadline` (closure in `agent/kala.js`, backed by `agent/tools/deadline-store.js`) — records a deadline bound to the Slack channel/user. The background `agent/deadline-scheduler.js` loop (started from `app.js` / `app-oauth.js`) reads `getDueDeadlines()` and posts a Slack reminder once per deadline before it's due.

**Operational trackers.** Three channel-scoped, persistent-state features. Each pairs a process-local store in `agent/tools/` (same Map pattern as `deadline-store` / `match-store`, with a `_reset*()` test helper) with closure tools in `agent/kala.js`; the two interactive ones also have a view builder and a button/reaction handler:

- **Artist & contractor engagements** — `engagement-store.js`; tools `track_engagement` / `update_engagement` / `engagement_status`. Tracks each engagement's contract, W-9, and invoice status, with overdue rules (contract sent > 7d unsigned, invoice submitted > 14d unpaid).
- **Free event RSVPs & attendance** — `event-store.js`; tools `track_event` / `update_event` / `event_status`. `track_event` posts an "I'll be there" RSVP card (`listeners/views/event-rsvp-builder.js`); the button is handled by `listeners/actions/event-buttons.js`. `event_status` feeds real attendance numbers into `draft_impact_report`.
- **Schedule-change acknowledgments** — `schedule-store.js`; tools `track_schedule_change` / `acknowledge_change` / `schedule_status`. `track_schedule_change` posts an "Acknowledge" card (`listeners/views/schedule-ack-builder.js`); acks arrive via the button (`listeners/actions/schedule-buttons.js`) **or** any reaction on the card (`listeners/events/reaction-added.js`). `schedule_status` returns the who-hasn't-confirmed list.

Tools in `agent/tools/` are defined using `tool()` from the Claude Agent SDK:

```js
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export const myTool = tool(
  'tool_name',
  'Description of what this tool does',
  { query: z.string() },
  async (args) => ({
    content: [{ type: 'text', text: 'result' }],
  })
);
```
