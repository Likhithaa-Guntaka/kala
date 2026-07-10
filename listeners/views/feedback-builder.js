import { actions, button, plain, splitSections } from './kit.js';

/**
 * The bottom feedback actions block: text-labeled Helpful / Not helpful buttons.
 * Real Block Kit buttons so clicks reach the feedback handler; the action IDs and
 * values (up/down) are unchanged so logging still works.
 * @returns {import('@slack/types').KnownBlock[]}
 */
export function buildFeedbackBlocks() {
  return [
    actions('feedback', [
      button({ text: 'Helpful', actionId: 'feedback_up', value: 'up' }),
      button({ text: 'Not helpful', actionId: 'feedback_down', value: 'down' }),
    ]),
  ];
}

/**
 * Small modal shown after "Not helpful": one optional free-text input, asked
 * before the feedback is logged. "Helpful" never opens this — it stays one click.
 * @param {string} privateMetadata - JSON context to carry through to submission.
 * @returns {import('@slack/types').View}
 */
export function buildFeedbackCommentModal(privateMetadata) {
  return {
    type: 'modal',
    callback_id: 'feedback_down_submit',
    private_metadata: privateMetadata,
    title: plain('Send feedback', 24),
    submit: plain('Send', 24),
    close: plain('Cancel', 24),
    blocks: [
      {
        type: 'input',
        block_id: 'comment',
        optional: true,
        label: plain('What went wrong?'),
        element: {
          type: 'plain_text_input',
          action_id: 'text',
          multiline: true,
          placeholder: plain('Optional — tell me what would have helped.'),
        },
      },
    ],
  };
}

/**
 * Wrap a full agent response for a single posted message: the response text as
 * one or more section blocks (Slack caps section text at 3000 chars), followed by
 * the bottom feedback actions block.
 * @param {string} text
 * @returns {import('@slack/types').KnownBlock[]}
 */
export function buildAgentReply(text) {
  return [...splitSections(text), ...buildFeedbackBlocks()];
}
