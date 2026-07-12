import { ackSummary } from '../../agent/tools/schedule-store.js';
import { actions, button, context, header, section } from './kit.js';

/** Action ID for the "Acknowledge" button. The change id rides in the value. */
export const SCHEDULE_ACK_ACTION = 'schedule_ack';

/**
 * Plain-text fallback for notifications and non-block clients.
 * @param {import('../../agent/tools/schedule-store.js').ScheduleChange} record
 * @returns {string}
 */
export function buildScheduleAckText(record) {
  const s = ackSummary(record);
  return `Schedule change — please confirm: ${record.change} (${s.acked}/${s.total} confirmed)`;
}

/**
 * The acknowledgment card posted to a channel: the schedule change, a live
 * "X of Y confirmed" line with who is still waiting, and an "Acknowledge" button.
 * People can also just react to the message to confirm. Emoji-free view style.
 * @param {import('../../agent/tools/schedule-store.js').ScheduleChange} record
 * @returns {import('@slack/types').KnownBlock[]}
 */
export function buildScheduleAckBlocks(record) {
  const s = ackSummary(record);

  /** @type {import('@slack/types').KnownBlock[]} */
  const blocks = [header('Schedule change — please confirm'), section(`*${record.change}*`)];

  if (s.total === 0) {
    blocks.push(context('Waiting on the team to confirm.'));
  } else if (s.pending.length === 0) {
    blocks.push(section(`*All ${s.total} confirmed.* Thanks, everyone.`));
  } else {
    blocks.push(section(`*${s.acked} of ${s.total} confirmed.* Still waiting on: ${s.pending.join(', ')}`));
  }

  blocks.push(
    actions('schedule_ack_actions', [
      button({ text: 'Acknowledge', actionId: SCHEDULE_ACK_ACTION, value: record.id, style: 'primary' }),
    ]),
  );
  blocks.push(context('Tap Acknowledge or react to this message to confirm you saw it.'));

  return blocks;
}
