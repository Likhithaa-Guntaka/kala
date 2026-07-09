/**
 * Nonprofit org types offered during onboarding. Each type carries a label, an
 * emoji, and three tailored example prompts shown after the user picks it.
 *
 * @typedef {Object} OrgType
 * @property {string} id - Stable identifier stored per user (never shown).
 * @property {string} emoji
 * @property {string} label
 * @property {string[]} primaryActions - Action IDs of the 2-3 quick actions this org type uses most.
 * @property {string[]} prompts - Three tailored example prompts.
 */

/** @type {OrgType[]} */
export const ORG_TYPES = [
  {
    id: 'food_bank',
    emoji: '🍎',
    label: 'Food Bank / Basic Needs',
    primaryActions: ['category_find_grants', 'category_volunteer_announcement', 'category_donor_thankyou'],
    prompts: [
      'Find food assistance grants under $50k',
      'Draft a volunteer shift announcement for Saturday distribution',
      'Write a donor thank you for in-kind food donations',
    ],
  },
  {
    id: 'mental_health',
    emoji: '🧠',
    label: 'Mental Health / Crisis Support',
    primaryActions: ['category_find_grants', 'category_track_deadline', 'category_draft_report'],
    prompts: [
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
    prompts: [
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
    prompts: [
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
    prompts: [
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
    prompts: [
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

/**
 * Human-readable label with emoji, e.g. "📚 Education / Youth Programs".
 * @param {string | null | undefined} id
 * @returns {string | null}
 */
export function orgTypeLabel(id) {
  const t = getOrgTypeById(id);
  return t ? `${t.emoji} ${t.label}` : null;
}
