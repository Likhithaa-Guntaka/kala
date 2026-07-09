import { handleAnnounceCommand } from './announce.js';
import { handleFeedbackAdminCommand } from './feedback.js';
import { handleGrantCommand } from './grant.js';
import { handleBenvuCommand } from './help.js';
import { handleRemindCommand } from './remind.js';
import { handleReportCommand } from './report.js';

/**
 * Register slash command listeners with the Bolt app.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  app.command('/grant', handleGrantCommand);
  app.command('/report', handleReportCommand);
  // NOTE: /remind is a reserved Slack built-in command, so we use /deadline.
  app.command('/deadline', handleRemindCommand);
  app.command('/announce', handleAnnounceCommand);
  app.command('/benvu', handleBenvuCommand);
  app.command('/benvu-feedback', handleFeedbackAdminCommand);
}
