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
 *   | { kind: 'seed_deadlines', deadlines: SeededDeadline[], note?: string }
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
      'Find SAMHSA block-grant deadlines for our state',
      'Draft a sustainability plan section for our grant renewal',
      'Find mental health and crisis funding',
    ],
    defaultGrantCategories: ['HL', 'ISS'],
    rtsPrompts: [
      'Summarize what our team decided about our crisis response protocol',
      'Catch me up on our SAMHSA renewal discussion',
    ],
    flagship: { kind: 'privacy_mode' },
  },
  {
    id: 'education',
    emoji: '📚',
    label: 'Education / Youth Programs',
    primaryActions: ['category_find_grants', 'category_draft_report', 'category_track_deadline'],
    tailoredPrompts: [
      'Summarize attendance and outcomes for our state performance report',
      'Draft our 21st Century Community Learning Centers continuation report',
      'Find youth education funding',
    ],
    defaultGrantCategories: ['ED'],
    rtsPrompts: [
      'Catch me up on our summer program planning',
      'Summarize what we decided about our after-school schedule',
    ],
    flagship: {
      kind: 'seed_deadlines',
      note:
        'This organization runs on an academic calendar — school year, terms, and summer programs — so its ' +
        'reporting and grant deadlines tend to cluster around term starts, the end of the school year, and the ' +
        'summer program cycle. When you offer to track a date, frame it against their academic calendar and ask ' +
        'which term or program it falls in if that helps.',
      deadlines: [
        {
          title: 'IRS Form 990',
          rule: 'irs990',
          framing: 'the annual IRS Form 990 information return every tax-exempt nonprofit files',
        },
        {
          title: 'State attendance and performance report',
          rule: 'state_varies',
          framing: 'your state education agency attendance and performance report, tied to the academic year',
        },
        {
          title: '21st Century Community Learning Centers (21st CCLC) continuation',
          rule: 'state_varies',
          framing: 'your 21st CCLC continuation application, which your state education agency schedules each year',
        },
      ],
    },
  },
  {
    id: 'immigrant_refugee',
    emoji: '🌍',
    label: 'Immigrant & Refugee Services',
    primaryActions: ['category_find_grants', 'category_draft_report', 'category_volunteer_announcement'],
    tailoredPrompts: [
      'Summarize this client intake and translate it to Spanish',
      'Draft know-your-rights info for a community post',
      'Find refugee and immigrant services funding',
    ],
    defaultGrantCategories: ['ISS', 'CD', 'ELT'],
    rtsPrompts: [
      'Catch me up on what the team decided about our new arrivals plan',
      'Summarize what we discussed about language-access services',
    ],
    flagship: { kind: 'multilingual', defaultLanguages: ['Spanish'] },
  },
  {
    id: 'housing',
    emoji: '🏠',
    label: 'Housing & Homelessness Services',
    primaryActions: ['category_find_grants', 'category_track_deadline', 'category_draft_report'],
    tailoredPrompts: [
      'Find HUD Continuum of Care funding',
      'Draft our point-in-time count summary',
      'Find housing and homelessness services funding',
    ],
    defaultGrantCategories: ['HO', 'ISS'],
    rtsPrompts: [
      'Summarize what we discussed about our CoC application',
      'Catch me up on our coordinated entry planning',
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
          title: 'HUD Continuum of Care (CoC) application',
          rule: 'state_varies',
          framing: 'your annual HUD CoC Program application, whose NOFO deadline HUD sets fresh each year',
        },
        {
          title: 'Point-in-Time (PIT) count',
          rule: 'state_varies',
          framing:
            'your annual Point-in-Time count of people experiencing homelessness, scheduled locally each January',
        },
      ],
    },
  },
  {
    id: 'arts_culture',
    emoji: '🎨',
    label: 'Arts & Culture',
    primaryActions: ['category_find_grants', 'category_donor_thankyou', 'category_draft_report'],
    tailoredPrompts: [
      'Draft our Challenge America project summary (max $10K)',
      'Draft our new season program announcement',
      'Find arts and culture funding',
    ],
    defaultGrantCategories: ['AR', 'HU'],
    rtsPrompts: ["Summarize what we decided about next season's programming", 'Catch me up on our gala planning'],
    flagship: { kind: 'match_tracker', ratio: '1:1', source: 'NEA' },
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
