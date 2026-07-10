import { CHANGE_ORG_ACTION } from '../views/app-home-builder.js';
import { DEADLINE_DONE_ACTION, DEADLINE_SNOOZE_ACTION } from '../views/deadline-reminder-builder.js';
import { GRANT_TRACK_ACTION } from '../views/grant-results-builder.js';
import { handleDeadlineDone, handleDeadlineSnooze } from './deadline-buttons.js';
import { handleFeedbackButton, handleFeedbackDownSubmit } from './feedback-buttons.js';
import { handleGrantTrackDeadline } from './grant-buttons.js';
import { handleIssueButton } from './issue-buttons.js';
import { handleChangeOrgType, handleOrgTypeSelected, handlePromptButton } from './onboarding-buttons.js';

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
  app.action(CHANGE_ORG_ACTION, handleChangeOrgType);
  app.action(/^prompt_run_/, handlePromptButton);
  app.action(DEADLINE_DONE_ACTION, handleDeadlineDone);
  app.action(DEADLINE_SNOOZE_ACTION, handleDeadlineSnooze);
  app.action(GRANT_TRACK_ACTION, handleGrantTrackDeadline);
}
