/**
 * Nonprofit org types offered during onboarding. Each type carries a label, an
 * emoji, and — the part that makes tailoring real — its own operational prompts,
 * Grants.gov funding-category defaults, RTS-grounded prompts, and a flagship
 * behavior. Listeners and the agent read this data; they never hardcode per-type
 * behavior of their own.
 *
 * @typedef {Object} SeededDeadline
 * @property {string} title - What is due, e.g. "IRS Form 990".
 * @property {'irs990' | 'annual' | 'state_varies'} rule - How its date is derived.
 * @property {string} framing - One human line describing it, used when the agent offers to track it.
 * @property {string} [month] - For 'annual': the recurring "MM-DD" (e.g. "05-15").
 *
 * @typedef {{ kind: 'none' }
 *   | { kind: 'seed_deadlines', deadlines: SeededDeadline[] }
 *   | { kind: 'privacy_mode' }
 *   | { kind: 'multilingual', defaultLanguages: string[] }
 *   | { kind: 'match_tracker', ratio: string, source: string }
 * } FlagshipTool
 *
 * @typedef {Object} OrgType
 * @property {string} id - Stable identifier stored per user (never shown).
 * @property {string} emoji - Data only; never rendered in the emoji-free views.
 * @property {string} label
 * @property {string[]} primaryActions - Action IDs of the 2-3 quick actions this org type uses most.
 * @property {string[]} tailoredPrompts - Operational-language example prompts (App Home rows, onboarding, suggested prompts).
 * @property {string[]} [defaultGrantCategories] - Grants.gov funding-category CODES (primary first), e.g. ['FN','ISS'].
 * @property {string[]} [rtsPrompts] - Summarize/draft prompts framed to ground answers in the team's own channels via search_workspace.
 * @property {FlagshipTool} [flagship] - One tailored behavior for this org type.
 */

/** @type {OrgType[]} */
export const ORG_TYPES = [
  {
    id: 'food_bank',
    emoji: '🍎',
    label: 'Food Bank / Food & Nutrition',
    primaryActions: ['category_find_grants', 'category_volunteer_announcement', 'category_donor_thankyou'],
    tailoredPrompts: [
      'Draft our TEFAP civil-rights and beneficiary-rights posting',
      'Find food and nutrition grants for our programs',
      'Draft a donor thank-you for in-kind food donations',
    ],
    defaultGrantCategories: ['FN', 'ISS'],
    rtsPrompts: [
      'Summarize our distribution log into a monthly report',
      'Catch me up on what the team discussed about our next food drive',
    ],
    flagship: {
      kind: 'seed_deadlines',
      deadlines: [
        {
          title: 'IRS Form 990',
          rule: 'irs990',
          framing: 'the annual IRS Form 990 information return every tax-exempt nonprofit files',
        },
        {
          title: 'TEFAP reporting',
          rule: 'state_varies',
          framing: 'your recurring TEFAP report to the state distributing agency',
        },
      ],
    },
  },
  {
    id: 'mental_health',
    emoji: '🧠',
    label: 'Mental Health / Crisis Support',
    primaryActions: ['category_find_grants', 'category_track_deadline', 'category_draft_report'],
    tailoredPrompts: [
      'Find mental health crisis funding in my state',
      'Draft an impact report for our crisis hotline, we handled 200 calls this quarter',
      'Set a reminder for our SAMHSA grant report due August 30',
    ],
  },
  {
    id: 'education',
    emoji: '📚',
    label: 'Education / Youth Programs',
    primaryActions: ['category_find_grants', 'category_draft_report', 'category_track_deadline'],
    tailoredPrompts: [
      'Find youth education grants under $100k in New York',
      'Draft an impact report, we tutored 150 students this semester',
      'Write a thank you note to our school district partners',
    ],
  },
  {
    id: 'immigrant_refugee',
    emoji: '🌍',
    label: 'Immigrant & Refugee Services',
    primaryActions: ['category_find_grants', 'category_draft_report', 'category_volunteer_announcement'],
    tailoredPrompts: [
      'Find refugee resettlement funding',
      'Translate this program announcement to Spanish',
      'Draft an impact report for our ESL program, 80 families completed courses',
    ],
  },
  {
    id: 'arts_culture',
    emoji: '🎨',
    label: 'Arts & Culture',
    primaryActions: ['category_find_grants', 'category_donor_thankyou', 'category_draft_report'],
    tailoredPrompts: [
      'Find NEA or state arts council grants',
      'Draft an impact report for our community theater, we ran 12 shows this season',
      'Write a donor thank you for our annual gala sponsors',
    ],
  },
  {
    id: 'general',
    emoji: '💛',
    label: 'General Nonprofit',
    primaryActions: ['category_find_grants', 'category_draft_report', 'category_track_deadline'],
    tailoredPrompts: [
      'Find grants matching our mission',
      'Draft an impact report from our program data',
      'Set a deadline reminder for our next grant report',
    ],
  },
];

/** Action ID prefix for org-type selection buttons. */
export const ORG_TYPE_ACTION_PREFIX = 'orgtype_';

/**
 * Look up an org type by its id.
 * @param {string | null | undefined} id
 * @returns {OrgType | undefined}
 */
export function getOrgTypeById(id) {
  return ORG_TYPES.find((t) => t.id === id);
}
