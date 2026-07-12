import { plain, section, truncate } from './kit.js';

/** Callback ID for the "Send to Kala" modal submission. */
export const SEND_TO_KALA_CALLBACK = 'send_to_kala_submit';

/**
 * The actions a user can run on a message. Values must match the PROMPTS keys in
 * the shortcut handler.
 * @type {Array<{ text: import('@slack/types').PlainTextElement, value: string }>}
 */
export const CHOICES = [
  { text: plain('Summarize'), value: 'summarize' },
  { text: plain('Find related grants'), value: 'grants' },
  { text: plain('Draft a report'), value: 'report' },
  { text: plain('Set a reminder'), value: 'reminder' },
];

/**
 * Build the "Send to Kala" modal: a preview of the message plus a required
 * choice of what to do with it. The full message text is carried in
 * private_metadata (capped to stay under Slack's 3000-char limit).
 * @param {string} messageText
 * @returns {import('@slack/types').ModalView}
 */
export function buildSendToKalaModal(messageText) {
  const preview = messageText ? truncate(messageText, 600) : '_(this message has no text)_';

  return {
    type: 'modal',
    callback_id: SEND_TO_KALA_CALLBACK,
    private_metadata: JSON.stringify({ text: truncate(messageText, 2800) }),
    title: plain('Send to Kala', 24),
    submit: plain('Run', 24),
    close: plain('Cancel', 24),
    blocks: [
      section(`*Message*\n${preview}`),
      {
        type: 'input',
        block_id: 'action',
        label: plain('What should I do with it?'),
        hint: plain('I will run it and send the result to your direct message with me.'),
        element: { type: 'radio_buttons', action_id: 'choice', initial_option: CHOICES[0], options: CHOICES },
      },
    ],
  };
}
