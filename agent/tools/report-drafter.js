import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

/**
 * Placeholder report generator. In production this might call a dedicated
 * template service or model. For now it expands a one-line impact description
 * into a full, ready-to-use impact report draft the user can edit.
 * @param {string} impact
 * @returns {string}
 */
function draftReport(impact) {
  const summary = impact.trim();

  return (
    'IMPACT REPORT\n' +
    '=============\n\n' +
    'Executive Summary\n' +
    '-----------------\n' +
    `Over the past reporting period, our organization worked to ${summary}. ` +
    'This report shares what we set out to do, what we achieved, and the difference ' +
    'it made for the people and communities we serve.\n\n' +
    'The Need\n' +
    '--------\n' +
    'The communities we serve continue to face real and pressing challenges. ' +
    `Our work to ${summary} responds directly to that need, focusing our time and ` +
    'resources where they can do the most good.\n\n' +
    'What We Did\n' +
    '-----------\n' +
    `To ${summary}, our team delivered a focused program of activities throughout the period. ` +
    'We coordinated staff, volunteers, and partners to reach the people who needed support most, ' +
    'and adjusted our approach along the way based on what we learned.\n\n' +
    'Our Impact\n' +
    '----------\n' +
    '• Audience reached: [add attendance or number of people engaged]\n' +
    '• Artists supported: [number of artists paid, commissioned, or featured]\n' +
    '• Community engagement: [describe programs, workshops, or outreach and who they reached]\n' +
    '• A story that matters: [share one short story that shows the impact]\n\n' +
    `Because of this work, more people connected with our efforts to ${summary}, and the results ` +
    'point to a meaningful, lasting difference for the artists and audiences we serve.\n\n' +
    'Looking Ahead\n' +
    '-------------\n' +
    'Building on this progress, we plan to deepen and expand this work in the coming period. ' +
    'Continued support will help us reach more people and strengthen the outcomes described above.\n\n' +
    'Thank You\n' +
    '---------\n' +
    'We are grateful to our funders, partners, volunteers, and community members. ' +
    'None of this would be possible without you.\n\n' +
    '[Tip: replace the bracketed placeholders with your real numbers and a story before sharing.]'
  );
}

/**
 * Build the draft_impact_report tool. `onDraft` receives the draft's type and
 * content each time the tool runs, so the caller can remember the most recent
 * draft for follow-up edits. The text returned to the model is unchanged.
 * @param {(draft: { type: string, content: string }) => void} [onDraft]
 */
export function createDraftImpactReportTool(onDraft) {
  return tool(
    'draft_impact_report',
    'Turn a short, one-line description of the impact a nonprofit made into a full, ' +
      'ready-to-use impact report draft. Use this when a user needs help writing a report ' +
      'and gives you a brief description of what they accomplished.',
    {
      impact: z
        .string()
        .describe(
          'A one-line description of the impact the organization made, e.g. "brought free theater to 1,200 students this season".',
        ),
    },
    async ({ impact }) => {
      const report = draftReport(impact);
      if (onDraft) onDraft({ type: 'impact report', content: report });
      return { content: [{ type: 'text', text: report }] };
    },
  );
}

/** Default draft_impact_report tool with no draft capture. */
export const draftImpactReportTool = createDraftImpactReportTool();
