import { handleFeedbackButton, handleFeedbackDownSubmit } from './feedback-buttons.js';
import { handleIssueButton } from './issue-buttons.js';
import { handleMoreActionsSelect, handleOrgTypeSelected, handlePromptButton } from './onboarding-buttons.js';

/**
 * Register action listeners with the Bolt app. The 👎 comment modal's submission
 * is registered here too, so the whole feedback flow lives in one place.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  app.action(/^category_/, handleIssueButton);
  app.action(/^feedback_/, handleFeedbackButton);
  app.view('feedback_down_submit', handleFeedbackDownSubmit);
  app.action(/^orgtype_/, handleOrgTypeSelected);
  app.action('more_actions_select', handleMoreActionsSelect);
  app.action(/^prompt_run_/, handlePromptButton);
}
