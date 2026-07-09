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
 * Small modal shown after 👎: one optional free-text input, asked before the
 * feedback is logged. 👍 never opens this — it stays a single click.
 * @param {string} privateMetadata - JSON context to carry through to submission.
 * @returns {import('@slack/types').View}
 */
export function buildFeedbackCommentModal(privateMetadata) {
  return {
    type: 'modal',
    callback_id: 'feedback_down_submit',
    private_metadata: privateMetadata,
    title: { type: 'plain_text', text: 'Send feedback' },
    submit: { type: 'plain_text', text: 'Send' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'comment',
        optional: true,
        label: { type: 'plain_text', text: 'What went wrong?' },
        element: {
          type: 'plain_text_input',
          action_id: 'text',
          multiline: true,
          placeholder: { type: 'plain_text', text: 'Optional — tell me what would have helped.' },
        },
      },
    ],
  };
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
