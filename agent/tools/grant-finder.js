import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

/**
 * @typedef {Object} Grant
 * @property {string} name
 * @property {string} deadline
 * @property {string} amount
 * @property {string} eligibility
 */

/**
 * Placeholder grant search. In production this would query a real grants
 * database or API. For now it returns 10 plausible, varied grants that
 * reference the user's query so the agent has realistic data to summarize.
 * @param {string} query
 * @returns {Grant[]}
 */
function searchGrants(query) {
  const focus = query.trim() || 'community programs';

  const funders = [
    'Open Horizons Foundation',
    'Bright Futures Fund',
    'Community Roots Trust',
    'Greenlight Grants',
    'The Willow Foundation',
    'United Neighbors Fund',
    'Cornerstone Charitable Trust',
    'New Leaf Initiative',
    'Riverside Community Foundation',
    'Global Impact Collective',
  ];

  const deadlines = [
    'March 15, 2026',
    'April 30, 2026',
    'May 1, 2026',
    'June 12, 2026',
    'July 31, 2026',
    'August 20, 2026',
    'September 9, 2026',
    'October 15, 2026',
    'November 3, 2026',
    'Rolling (reviewed monthly)',
  ];

  const amounts = [
    'Up to $10,000',
    '$5,000 – $25,000',
    'Up to $50,000',
    '$15,000 – $40,000',
    'Up to $100,000',
    '$2,500 – $10,000',
    'Up to $75,000',
    '$20,000 – $60,000',
    'Up to $250,000',
    '$1,000 – $5,000 micro-grants',
  ];

  const eligibility = [
    'Registered nonprofits with 501(c)(3) status or local equivalent.',
    'Small, community-based organizations with annual budgets under $500K.',
    'Nonprofits serving underserved or rural communities.',
    'Organizations with at least two years of operating history.',
    'New and grassroots groups welcome; fiscal sponsorship accepted.',
    'Nonprofits working directly with youth or families.',
    'Any charitable organization; no minimum budget required.',
    'Groups partnering with at least one other local organization.',
    'Nonprofits led by or primarily serving the communities they represent.',
    'Open to nonprofits and social enterprises with a clear public benefit.',
  ];

  return funders.map((funder, i) => ({
    name: `${funder} — ${focus} Grant`,
    deadline: deadlines[i],
    amount: amounts[i],
    eligibility: eligibility[i],
  }));
}

export const findGrantsTool = tool(
  'find_grants',
  'Find grant opportunities that match what the nonprofit is looking for. ' +
    'Use this whenever a user asks about funding, grants, or where to apply for money. ' +
    'Returns up to 10 matching grants with name, deadline, amount, and eligibility.',
  {
    query: z
      .string()
      .describe('What the user is looking for, e.g. their mission, cause area, or the kind of funding they need.'),
  },
  async ({ query }) => {
    const grants = searchGrants(query);

    const results = grants
      .map(
        (g, i) =>
          `${i + 1}. **${g.name}**\n` +
          `   • Deadline: ${g.deadline}\n` +
          `   • Amount: ${g.amount}\n` +
          `   • Eligibility: ${g.eligibility}`,
      )
      .join('\n\n');

    const text = `Found ${grants.length} grants matching "${query}":\n\n${results}`;

    return { content: [{ type: 'text', text }] };
  },
);
