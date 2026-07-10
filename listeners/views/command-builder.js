import { summarizeFeedback } from '../feedback-store.js';
import { context, divider, header, section } from './kit.js';

/**
 * Blocks for the /benvu help message: a header, a one-line purpose, the command
 * list, and a "reach me" footer.
 * @returns {import('@slack/types').KnownBlock[]}
 */
export function buildHelpBlocks() {
  return [
    header('Benvu'),
    section('I find grants, draft reports, and track deadlines, in any language.'),
    divider(),
    section(
      [
        '`/grant [query]` — Find grant opportunities (e.g. `/grant youth education under $50k`)',
        '`/report [description]` — Draft an impact report from what you accomplished',
        '`/deadline [grant] [deadline]` — Set a grant deadline reminder',
        '`/announce [details]` — Create a volunteer shift announcement',
        '`/benvu` — Show this help',
      ].join('\n'),
    ),
    context('You can also send me a direct message or mention @Benvu in any channel, in any language.'),
  ];
}

/**
 * Blocks for the /benvu-feedback summary: a header, the tallies as a context
 * line, and recent items. Emoji-free.
 * @returns {import('@slack/types').KnownBlock[]}
 */
export function buildFeedbackSummaryBlocks() {
  const { total, up, down, positivePct, recent } = summarizeFeedback();

  if (total === 0) {
    return [header('Benvu feedback'), section('No feedback yet.')];
  }

  /** @type {import('@slack/types').KnownBlock[]} */
  const blocks = [
    header('Benvu feedback'),
    context(`Helpful: ${up}   ·   Not helpful: ${down}   ·   ${total} total (${positivePct}% positive)`),
  ];

  if (recent.length > 0) {
    blocks.push(divider());
    blocks.push(
      section(
        recent
          .map((f) => {
            const label = f.rating === 'up' ? 'Helpful' : 'Not helpful';
            const when = f.timestamp.slice(0, 10);
            const what = f.response_summary || f.message_summary || '(no summary)';
            return `*${label}* · ${when} — ${what}`;
          })
          .join('\n'),
      ),
    );
  }

  return blocks;
}
