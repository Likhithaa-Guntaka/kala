import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

/**
 * Build a friendly, formatted reminder message for a grant deadline.
 * In production this might also schedule the reminder; for now it returns
 * the formatted message text.
 * @param {string} grantName
 * @param {string} deadline
 * @returns {string}
 */
function buildReminder(grantName, deadline) {
  return (
    '⏰ Deadline Reminder\n' +
    '--------------------\n' +
    `Grant: ${grantName}\n` +
    `Due: ${deadline}\n\n` +
    `Don't forget — the application for "${grantName}" is due on ${deadline}. ` +
    'Give yourself a little time before then to gather documents and review everything.\n\n' +
    'Suggested next steps:\n' +
    '• Confirm your eligibility and required materials\n' +
    '• Draft or update your proposal and budget\n' +
    '• Submit a few days early to avoid last-minute surprises'
  );
}

export const remindDeadlineTool = tool(
  'remind_deadline',
  'Create a friendly, formatted reminder message for a grant deadline. ' +
    'Use this when a user wants to be reminded about a grant they need to apply for, ' +
    'and provides the grant name and its deadline date.',
  {
    grant_name: z.string().describe('The name of the grant the user wants a reminder for.'),
    deadline: z.string().describe('The deadline date for the grant, e.g. "March 15, 2026".'),
  },
  async ({ grant_name, deadline }) => {
    const text = buildReminder(grant_name, deadline);
    return { content: [{ type: 'text', text }] };
  },
);
