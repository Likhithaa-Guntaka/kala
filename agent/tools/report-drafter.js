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
    '• People reached: [add the number of people served]\n' +
    '• Key outcome: [describe the main change or result you saw]\n' +
    '• A story that matters: [share one short story that shows the impact]\n\n' +
    `Because of this work, more people benefited from our efforts to ${summary}, and the results ` +
    'point to a meaningful, lasting difference.\n\n' +
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

export const draftImpactReportTool = tool(
  'draft_impact_report',
  'Turn a short, one-line description of the impact a nonprofit made into a full, ' +
    'ready-to-use impact report draft. Use this when a user needs help writing a report ' +
    'and gives you a brief description of what they accomplished.',
  {
    impact: z
      .string()
      .describe('A one-line description of the impact the organization made, e.g. "fed 500 families this winter".'),
  },
  async ({ impact }) => {
    const report = draftReport(impact);
    return { content: [{ type: 'text', text: report }] };
  },
);
