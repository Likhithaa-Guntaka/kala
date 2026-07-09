import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export const draftDonorThankYouTool = tool(
  'draft_donor_thankyou',
  'Draft a warm, genuine, non-generic thank-you message for a group of donors. ' +
    'Use this when a user wants to thank donors after a gift, campaign, or drive. ' +
    'Extract the donor count, gift range, and any campaign name or personal note from what the user said.',
  {
    donor_count: z.number().describe('How many donors are being thanked, e.g. 42.'),
    gift_range: z.string().describe('The gift size or range, e.g. "under $100", "$50–$250", "in-kind food donations".'),
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

    const text =
      '*Donor thank-you draft*\n\n' +
      `${message}\n\n` +
      '---\n' +
      'Ready to send as-is, or I can personalize it for a specific donor by name, ' +
      'shorten it for a text/DM, or adjust the tone. Want me to tailor a version?';

    return { content: [{ type: 'text', text }] };
  },
);
