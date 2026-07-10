import { CATEGORIES } from './app-home-builder.js';
import { plain } from './kit.js';

/**
 * Short action verb shown on the submit button for each category, so the button
 * names the action ("Find grants") instead of a generic "Submit". Modal button
 * text is capped at 24 characters by Slack.
 * @type {Record<string, string>}
 */
const SUBMIT_LABELS = {
  'Find Grants': 'Find grants',
  'Draft a Report': 'Draft report',
  'Track a Deadline': 'Track deadline',
  'Summarize Meeting Notes': 'Summarize',
  'Draft Donor Thank You': 'Draft note',
  'Create Volunteer Announcement': 'Create post',
};

/**
 * Build the detail-collection modal opened from a Home action.
 * @param {string | undefined} category - Pre-selected category, if any.
 * @returns {import('@slack/types').ModalView}
 */
export function buildIssueModal(category) {
  /** @type {import('@slack/types').PlainTextOption[]} */
  const categoryOptions = CATEGORIES.map((cat) => ({ text: plain(cat.value), value: cat.value }));
  const initialOption = categoryOptions.find((opt) => opt.value === category) || categoryOptions[0];
  const submitLabel = SUBMIT_LABELS[initialOption.value || ''] || 'Send to Benvu';

  return {
    type: 'modal',
    callback_id: 'issue_submission',
    title: plain('How can Benvu help?', 24),
    submit: plain(submitLabel, 24),
    close: plain('Cancel', 24),
    blocks: [
      {
        type: 'input',
        block_id: 'category_block',
        element: {
          type: 'static_select',
          action_id: 'category_select',
          placeholder: plain('Select what you need'),
          options: categoryOptions,
          initial_option: initialOption,
        },
        label: plain('What do you need?'),
      },
      {
        type: 'input',
        block_id: 'description_block',
        optional: true,
        element: {
          type: 'plain_text_input',
          action_id: 'description_input',
          multiline: true,
          placeholder: plain("Add any details — amounts, dates, who it's for…"),
        },
        label: plain('Details'),
        hint: plain("Optional. Write in any language and I'll reply in the same one."),
      },
    ],
  };
}
