/**
 * Trackable 👍 / 👎 feedback buttons (real Block Kit action buttons, so clicks
 * are delivered to our action handler and can be logged).
 * @returns {import('@slack/types').KnownBlock[]}
 */
export function buildFeedbackBlocks() {
  return [
    {
      type: 'actions',
      block_id: 'feedback',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '👍', emoji: true },
          action_id: 'feedback_up',
          value: 'up',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '👎', emoji: true },
          action_id: 'feedback_down',
          value: 'down',
        },
      ],
    },
  ];
}

/**
 * Build blocks for a full agent response posted in one message: the response text
 * split into section blocks (Slack caps section text at 3000 chars) followed by the
 * feedback buttons.
 * @param {string} text
 * @returns {import('@slack/types').KnownBlock[]}
 */
export function buildResponseBlocks(text) {
  /** @type {import('@slack/types').KnownBlock[]} */
  const sections = [];
  let remaining = text || '';
  while (remaining.length > 0) {
    sections.push({ type: 'section', text: { type: 'mrkdwn', text: remaining.slice(0, 2900) } });
    remaining = remaining.slice(2900);
  }
  return [...sections, ...buildFeedbackBlocks()];
}
