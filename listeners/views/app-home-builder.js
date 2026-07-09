import { getOrgTypeById } from '../org-types.js';
import { buildOrgTypeActionsBlock, buildPromptActionsBlock } from './onboarding-builder.js';

/**
 * @typedef {Object} Category
 * @property {string} actionId
 * @property {string} text
 * @property {string} value
 */

/** @type {Category[]} */
export const CATEGORIES = [
  {
    actionId: 'category_find_grants',
    text: ':moneybag: Find Grants',
    value: 'Find Grants',
  },
  {
    actionId: 'category_draft_report',
    text: ':memo: Draft a Report',
    value: 'Draft a Report',
  },
  {
    actionId: 'category_track_deadline',
    text: ':alarm_clock: Track a Deadline',
    value: 'Track a Deadline',
  },
];

/**
 * The three quick-action category buttons, shown in every state of the Home tab.
 * @returns {import('@slack/types').ActionsBlock}
 */
function categoryActionsBlock() {
  return {
    type: 'actions',
    block_id: 'quick_actions',
    elements: CATEGORIES.map((cat) => ({
      type: 'button',
      text: { type: 'plain_text', text: cat.text, emoji: true },
      action_id: cat.actionId,
      value: cat.value,
    })),
  };
}

/**
 * Slack MCP Server connection status footer.
 * @param {string | null} installUrl
 * @param {boolean} isConnected
 * @returns {import('@slack/types').KnownBlock[]}
 */
function mcpStatusBlocks(installUrl, isConnected) {
  if (isConnected) {
    return [
      { type: 'section', text: { type: 'mrkdwn', text: '🟢 *Slack MCP Server is connected.*' } },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'This agent has access to search messages, read channels, and more.' }],
      },
    ];
  }
  const link = installUrl
    ? `<${installUrl}|Connect the Slack MCP Server.>`
    : '<https://github.com/slack-samples/bolt-js-support-agent/blob/main/claude-agent-sdk/README.md#slack-mcp-server|Learn how to enable the Slack MCP Server.>';
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `🔴 *Slack MCP Server is disconnected.* ${link}` } },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'The Slack MCP Server enables this agent to search messages, read channels, and more.',
        },
      ],
    },
  ];
}

/**
 * Build the App Home view. Shows onboarding (org-type question) until the user
 * picks a type, then a personalized view with tailored suggested actions.
 * @param {string | null} [installUrl] - OAuth install URL shown when MCP is disconnected.
 * @param {boolean} [isConnected] - Whether the Slack MCP Server is connected.
 * @param {string | null} [botUserId] - The bot's user ID for dynamic mentions.
 * @param {string | null} [orgType] - The user's stored org type id, if any.
 * @returns {import('@slack/types').HomeView}
 */
export function buildAppHomeView(installUrl = null, isConnected = false, botUserId = null, orgType = null) {
  const org = getOrgTypeById(orgType);

  /** @type {import('@slack/types').KnownBlock[]} */
  const blocks = [{ type: 'header', text: { type: 'plain_text', text: "Hi, I'm Benvu :wave:" } }];

  if (org) {
    // Personalized: greet by org type, offer tailored prompts, allow changing type.
    blocks.push(
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `You're set up as *${org.emoji} ${org.label}*. Here are a few things I can help with:`,
        },
      },
      buildPromptActionsBlock(org),
      {
        type: 'actions',
        block_id: 'change_org',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '↺ Change organization type', emoji: true },
            action_id: 'change_org_type',
            value: 'change',
          },
        ],
      },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: '*Quick actions:*' } },
      categoryActionsBlock(),
    );
  } else {
    // Onboarding: ask what kind of organization they are.
    blocks.push(
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            'I help nonprofit teams find grants, draft reports, thank donors, and track deadlines — ' +
            'just message me anytime in any language.\n\nFirst, *what kind of organization are you?*',
        },
      },
      buildOrgTypeActionsBlock(),
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: '*Or jump straight in:*' } },
      categoryActionsBlock(),
    );
  }

  blocks.push(
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `You can also mention me in any channel${botUserId ? ` with <@${botUserId}>` : ''} or send me a DM.`,
        },
      ],
    },
    { type: 'divider' },
    ...mcpStatusBlocks(installUrl, isConnected),
  );

  return { type: 'home', blocks };
}
