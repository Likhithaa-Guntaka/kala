import { DEADLINE_DONE_ACTION, DEADLINE_SNOOZE_ACTION } from '../views/deadline-reminder-builder.js';
import { EVENT_RSVP_ACTION } from '../views/event-rsvp-builder.js';
import { GRANT_TRACK_ACTION, GRANT_VIEW_ACTION } from '../views/grant-results-builder.js';
import { SCHEDULE_ACK_ACTION } from '../views/schedule-ack-builder.js';
import { handleDeadlineDone, handleDeadlineSnooze } from './deadline-buttons.js';
import { handleRsvpGoing } from './event-buttons.js';
import { handleFeedbackButton, handleFeedbackDownSubmit } from './feedback-buttons.js';
import { handleGrantTrackDeadline, handleGrantViewOpportunity } from './grant-buttons.js';
import { handleIssueButton } from './issue-buttons.js';
import { handlePromptButton } from './onboarding-buttons.js';
import { handleScheduleAck } from './schedule-buttons.js';

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
  app.action(/^prompt_run_/, handlePromptButton);
  app.action(DEADLINE_DONE_ACTION, handleDeadlineDone);
  app.action(DEADLINE_SNOOZE_ACTION, handleDeadlineSnooze);
  app.action(GRANT_TRACK_ACTION, handleGrantTrackDeadline);
  app.action(GRANT_VIEW_ACTION, handleGrantViewOpportunity);
  app.action(EVENT_RSVP_ACTION, handleRsvpGoing);
  app.action(SCHEDULE_ACK_ACTION, handleScheduleAck);
}
