import { handleFeedbackButton } from './feedback-buttons.js';
import { handleIssueButton } from './issue-buttons.js';
import { handleChangeOrgType, handleOrgTypeSelected, handlePromptButton } from './onboarding-buttons.js';

/**
 * Register action listeners with the Bolt app.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  app.action(/^category_/, handleIssueButton);
  app.action('feedback', handleFeedbackButton);
  app.action(/^orgtype_/, handleOrgTypeSelected);
  app.action('change_org_type', handleChangeOrgType);
  app.action(/^prompt_run_/, handlePromptButton);
}
