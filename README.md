# Benvu: Nonprofit Assistant Agent (Bolt for JavaScript and Claude Agent SDK)

Meet Benvu — an AI-powered assistant for nonprofit teams that lives in Slack. Benvu helps staff find grants, draft impact reports, and track deadlines, and it replies in whatever language you write in, all without leaving the conversation.

Built with [Bolt for JavaScript](https://tools.slack.dev/bolt-js/) and the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) using models from [Anthropic](https://www.anthropic.com).

## App Overview

Benvu gives your team instant help through four entry points:

* **App Home** — Users open Benvu's Home tab and choose from three quick actions (Find Grants, Draft a Report, Track a Deadline), or just describe what they need. Benvu starts a DM thread and responds.
* **Direct Messages** — Users message Benvu directly to describe what they need. Benvu responds in-thread, maintaining context across follow-ups.
* **Channel @mentions** — Users mention `@Benvu` in any channel to get help without leaving the conversation.
* **Assistant Panel** — Users click _Add Agent_ in Slack, select Benvu, and pick from suggested prompts or describe a need.

Benvu detects the language each user writes in and replies in that same language.

Benvu uses three simulated tools to assist users:

* **Find Grants** — Searches for grant opportunities and returns matches with name, deadline, amount, and eligibility.
* **Draft a Report** — Turns a one-line description of impact into a full, ready-to-use impact report draft.
* **Track a Deadline** — Creates a friendly, formatted reminder for a grant deadline.

> **Note:** All tools return simulated data for demonstration purposes. In a production app, these would connect to real grant databases and reminder systems.

### Slack MCP Server

Benvu also works with the [Slack MCP Server](https://docs.slack.dev/ai/slack-mcp-server), giving it the ability to search messages and files, read channel history and threads, send messages, schedule messages, and create or update Slack canvases. When deployed with OAuth (HTTP mode), Benvu automatically connects to the Slack MCP Server using the user's token, unlocking these capabilities on top of the built-in tools.

## Setup

Before getting started, make sure you have a development workspace where you have permissions to install apps.

### Developer Program

Join the [Slack Developer Program](https://api.slack.com/developer-program) for exclusive access to sandbox environments for building and testing your apps, tooling, and resources created to help you build and grow.

### Create the Slack app

<details><summary><strong>Using Slack CLI</strong></summary>

Install the latest version of the Slack CLI for your operating system:

* [Slack CLI for macOS & Linux](https://docs.slack.dev/tools/slack-cli/guides/installing-the-slack-cli-for-mac-and-linux/)
* [Slack CLI for Windows](https://docs.slack.dev/tools/slack-cli/guides/installing-the-slack-cli-for-windows/)

You'll also need to log in if this is your first time using the Slack CLI.

```sh
slack login
```

#### Initializing the project

```sh
slack create my-benvu-agent --template slack-samples/bolt-js-support-agent --subdir claude-agent-sdk
cd my-benvu-agent
```

</details>

<details><summary><strong>Using App Settings</strong></summary>

#### Create Your Slack App

1. Open [https://api.slack.com/apps/new](https://api.slack.com/apps/new) and choose "From an app manifest"
2. Choose the workspace you want to install the application to
3. Copy the contents of [manifest.json](./manifest.json) into the text box that says `*Paste your manifest code here*` (within the JSON tab) and click _Next_
4. Review the configuration and click _Create_
5. Click _Install to Workspace_ and _Allow_ on the screen that follows. You'll then be redirected to the App Configuration dashboard.

#### Environment Variables

Before you can run the app, you'll need to store some environment variables.

1. Rename `.env.sample` to `.env`.
2. Open your apps setting page from [this list](https://api.slack.com/apps), click _OAuth & Permissions_ in the left hand menu, then copy the _Bot User OAuth Token_ into your `.env` file under `SLACK_BOT_TOKEN`.

```sh
SLACK_BOT_TOKEN=YOUR_SLACK_BOT_TOKEN
```

3. Click _Basic Information_ from the left hand menu and follow the steps in the _App-Level Tokens_ section to create an app-level token with the `connections:write` scope. Copy that token into your `.env` as `SLACK_APP_TOKEN`.

```sh
SLACK_APP_TOKEN=YOUR_SLACK_APP_TOKEN
```

#### Initializing the project

```sh
git clone https://github.com/slack-samples/bolt-js-support-agent.git my-benvu-agent
cd my-benvu-agent/claude-agent-sdk
```

</details>

#### Install dependencies

```sh
npm install
```

## Providers

### Anthropic Setup

Benvu runs on Claude through the Claude Agent SDK. The SDK resolves credentials automatically, so you have two options:

**Option A — Claude Code session (no API key).** If you're signed in to [Claude Code](https://claude.com/claude-code) (a subscription or OAuth session), Benvu authenticates through that session and needs **no `ANTHROPIC_API_KEY`**. This is the default in the sandbox — leave the key unset in `.env` and you're done. On startup the app logs `Claude auth: claude-code-session` to confirm.

**Option B — External API key.** To use the external Claude API instead:

1. Create an API key from your [Anthropic dashboard](https://console.anthropic.com/settings/keys).
2. Set it in `.env`:

```sh
ANTHROPIC_API_KEY=sk-ant-...
```

The app logs `Claude auth: api-key` when a key is used. A placeholder or empty value is ignored so it can't override a working session.

## Development

### Starting the app

<details><summary><strong>Using the Slack CLI</strong></summary>

#### Slack CLI

```sh
slack run
```

</details>

<details><summary><strong>Using the Terminal</strong></summary>

#### Terminal

```sh
npm start
```

</details>

<details><summary><strong>Using OAuth HTTP Server (with ngrok)</strong></summary>

#### OAuth HTTP Server

This mode uses an HTTP server instead of Socket Mode, which is required for OAuth-based distribution.

1. Install [ngrok](https://ngrok.com/download) and start a tunnel:

```sh
ngrok http 3000
```

2. Copy the `https://*.ngrok-free.app` URL from the ngrok output.

<details><summary><strong>Using Slack CLI</strong></summary>

#### Slack CLI

3. Update `manifest.json` for HTTP mode:
   - Set `socket_mode_enabled` to `false`
   - Replace `ngrok-free.app` with your ngrok domain (e.g. `YOUR_NGROK_SUBDOMAIN.ngrok-free.app`)

4. Create a new local dev app:

```sh
slack install -E local
```

5. _(Slack CLI < v4.1.0 only)_ Enable MCP for your app:
   - Run `slack app settings` to open your app's settings
   - Navigate to **Agents & AI Apps** in the left-side navigation
   - Toggle **Model Context Protocol** on

6. Update your `.env` OAuth environment variables:
   - Run `slack app settings` to open App Settings
   - Copy **Client ID**, **Client Secret**, and **Signing Secret**
   - Update `SLACK_REDIRECT_URI` in `.env` with your ngrok domain

```sh
SLACK_CLIENT_ID=YOUR_CLIENT_ID
SLACK_CLIENT_SECRET=YOUR_CLIENT_SECRET
SLACK_SIGNING_SECRET=YOUR_SIGNING_SECRET
SLACK_REDIRECT_URI=https://YOUR_NGROK_SUBDOMAIN.ngrok-free.app/slack/oauth_redirect
```

7. Start the app:

```sh
slack run app-oauth.js
```

8. Click the install URL printed in the terminal to install the app to your workspace via OAuth.

</details>

<details><summary><strong>Using the Terminal</strong></summary>

#### Terminal

3. Create your Slack app at [api.slack.com/apps/new](https://api.slack.com/apps/new) using [`manifest.json`](./manifest.json). Before pasting the manifest, set `socket_mode_enabled` to `false` and replace `ngrok-free.app` with your ngrok domain.

4. Install the app to your workspace and copy the following values into your `.env`:
   - **Signing Secret** — from _Basic Information_
   - **Bot User OAuth Token** — from _OAuth & Permissions_
   - **Client ID** and **Client Secret** — from _Basic Information_

```sh
SLACK_BOT_TOKEN=xoxb-YOUR_BOT_TOKEN
SLACK_CLIENT_ID=YOUR_CLIENT_ID
SLACK_CLIENT_SECRET=YOUR_CLIENT_SECRET
SLACK_SIGNING_SECRET=YOUR_SIGNING_SECRET
SLACK_REDIRECT_URI=https://YOUR_NGROK_SUBDOMAIN.ngrok-free.app/slack/oauth_redirect
```

Replace `your-subdomain` in `SLACK_REDIRECT_URI` with your ngrok subdomain.

5. Start the app:

```sh
node app-oauth.js
```

6. Click the install URL printed in the terminal to install the app to your workspace via OAuth.

</details>

> **Note:** Each time ngrok restarts, it generates a new URL. You'll need to update the ngrok domain in `manifest.json`, `SLACK_REDIRECT_URI` in your `.env`, and re-install the app.

</details>

### Using the App

Once Benvu is running, there are several ways to interact:

**App Home** — Open Benvu in Slack and click the _Home_ tab. You'll see three quick-action buttons (_Find Grants_, _Draft a Report_, _Track a Deadline_). Click one to get started, or just describe what you need. Benvu will start a DM thread with you.

**Direct Messages** — Open a DM with Benvu. You'll see suggested prompts like _Find Grants_, _Draft a Report_, and _Track a Deadline_ — pick one or describe your own need in any language. Benvu will react with :eyes: while processing, then reply in a thread. Send follow-up messages in the same thread and Benvu will maintain the full conversation context.

**Channel @mentions** — Invite Benvu to a channel by typing `/invite @Benvu` in the message box, then type `@Benvu` followed by what you need. Benvu responds in a thread so the channel stays clean.

**Assistant Panel** — Click _Add Agent_ in the top-right corner of Slack, select Benvu from the list, then pick a suggested prompt or type a message.

Benvu will add a :white_check_mark: reaction when it believes a request has been handled, and occasionally adds a contextual emoji reaction to keep things friendly.

### Linting

```sh
# Run Biome for linting and formatting
npm run lint

# Auto-fix lint and format issues
npm run lint:fix
```

### Testing

```sh
# Run unit tests
npm test
```

## Project Structure

### `manifest.json`

`manifest.json` is a configuration for Slack apps. With a manifest, you can create an app with a pre-defined configuration, or adjust the configuration of an existing app.

### `app.js`

`app.js` is the entry point for the application and is the file you'll run to start the server. This project aims to keep this file as thin as possible, primarily using it as a way to route inbound requests.

### `app-oauth.js`

`app-oauth.js` is an alternative entry point that runs the app in HTTP mode instead of Socket Mode. This is intended for deployments that use OAuth for app distribution. See the OAuth HTTP Server section under Development for setup instructions.

### `/listeners`

Every incoming request is routed to a "listener". This directory groups each listener based on the Slack Platform feature used.

**`/listeners/events`** — Handles incoming events:

* `app-home-opened.js` — Publishes the App Home view with category buttons, or pins suggested prompts to the agent DM Messages tab (branches on `event.tab`).
* `app-mentioned.js` — Responds to `@Benvu` mentions in channels.
* `message.js` — Responds to direct messages from users.

**`/listeners/actions`** — Handles interactive components:

* `issue-buttons.js` — Opens the issue submission modal when a category button is clicked.
* `feedback-buttons.js` — Handles thumbs up/down feedback on Benvu's responses.

**`/listeners/views`** — Handles view submissions and builds Block Kit views:

* `issue-modal.js` — Processes modal submissions, starts a DM thread, and runs the agent.
* `app-home-builder.js` — Constructs the App Home Block Kit view.
* `issue-modal-builder.js` — Constructs the issue submission modal.
* `feedback-builder.js` — Creates the feedback button block attached to responses.

### `/agent`

The `benvu.js` file configures the Claude Agent SDK agent with a system prompt, tools registered via an in-process MCP server, and a `runBenvuAgent()` function that handles sending queries and collecting responses.

Tools that need Slack API access (emoji reactions, mark resolved) are created as closures inside `runBenvuAgent()` that capture the dependencies. Static tools (grant finder, report drafter, deadline reminder) remain as module-level exports in `agent/tools/`.

The `tools` directory contains three nonprofit assistant tools defined using `tool()` from the Claude Agent SDK with Zod v4 schemas.

### `/thread-context`

The `store.js` file implements an in-memory session ID store, keyed by channel and thread. The Claude Agent SDK manages conversation history server-side via sessions, so only session IDs need to be tracked locally for resuming conversations. The store has TTL-based cleanup (1 hour) and a max entry limit (1000).

## Troubleshooting

### MCP Server connection error: `App is not enabled for Slack MCP server access`

If you see an error like:

```
Error: Streamable HTTP error: Error POSTing to endpoint: {"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"App is not enabled for Slack MCP server access. Please enable it here: https://api.slack.com/apps/YOUR_APP_ID/app-assistant"}}
```

This means the Slack MCP feature has not been enabled for your app. There is no manifest property for this yet, so it must be toggled on manually:

1. Run `slack app settings` to open your app's settings page (or visit [api.slack.com/apps](https://api.slack.com/apps) and select your app)
2. Navigate to **Agents & AI Apps** in the left-side navigation
3. Toggle **Slack Model Context Protocol** on
