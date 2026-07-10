import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

/**
 * Build the draft_donor_thankyou tool. `onDraft` receives the draft's type and
 * core content each time the tool runs, so the caller can remember the most
 * recent draft for follow-up edits. The text returned to the model is unchanged.
 * @param {(draft: { type: string, content: string }) => void} [onDraft]
 */
export function createDraftDonorThankYouTool(onDraft) {
  return tool(
    'draft_donor_thankyou',
    'Draft a warm, genuine, non-generic thank-you message for donors. Use this when a user ' +
      'wants to thank donors after a gift, campaign, or drive. First establish WHO is being ' +
      'thanked — which donors, and for what campaign, drive, or occasion — before gathering the ' +
      'rest, like how many donors and the gift size. Use only specifics the user actually gave ' +
      'you or a tool returned; never invent a donor name, amount, or campaign.',
    {
      donor_count: z.number().describe('How many donors are being thanked, e.g. 42.'),
      gift_range: z
        .string()
        .describe('The gift size or range, e.g. "under $100", "$50–$250", "in-kind food donations".'),
      campaign_name: z.string().optional().describe('The campaign, drive, or occasion the gifts supported, if named.'),
      personal_note: z
        .string()
        .optional()
        .describe('Any specific detail or sentiment the user wants woven in, if provided.'),
    },
    async ({ donor_count, gift_range, campaign_name, personal_note }) => {
      const forCampaign = campaign_name ? ` to *${campaign_name}*` : '';
      const plural = donor_count === 1 ? 'donor' : 'donors';
      const noteLine = personal_note ? `\n\n${personal_note.trim()}` : '';

      const message =
        'Dear friend,\n\n' +
        `Thank you. Your gift${forCampaign} — one of ${donor_count} ${plural} who gave ${gift_range} — ` +
        'is already at work in our community. Gifts like yours are the reason we can show up for the people who ' +
        'count on us, day after day.\n\n' +
        `It's easy to think a single contribution is a small thing. It isn't. Pooled with others, it becomes meals ` +
        `served, doors opened, and lives steadied. You made that real.${noteLine}\n\n` +
        'With gratitude,\nThe team';

      if (onDraft) onDraft({ type: 'donor thank-you', content: message });

      const text =
        '*Donor thank-you draft*\n\n' +
        `${message}\n\n` +
        '---\n' +
        'Ready to send as-is, or I can personalize it for a specific donor by name, ' +
        'shorten it for a text/DM, or adjust the tone. Want me to tailor a version?';

      return { content: [{ type: 'text', text }] };
    },
  );
}

/** Default draft_donor_thankyou tool with no draft capture. */
export const draftDonorThankYouTool = createDraftDonorThankYouTool();
