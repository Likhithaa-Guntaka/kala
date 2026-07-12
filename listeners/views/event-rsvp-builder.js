import { actions, button, context, header, section } from './kit.js';

/** Action ID for the "I'll be there" RSVP button. The event id rides in the value. */
export const EVENT_RSVP_ACTION = 'event_rsvp_going';

/**
 * Plain-text fallback for notifications and non-block clients.
 * @param {import('../../agent/tools/event-store.js').TrackedEvent} event
 * @returns {string}
 */
export function buildRsvpText(event) {
  const when = event.date ? ` (${event.date})` : '';
  const n = event.rsvps.length;
  return `RSVP for ${event.title}${when} — ${n} going so far. Tap "I'll be there" to confirm.`;
}

/**
 * The RSVP sign-up card posted to a channel: the event, a live head count with
 * the confirmed names, and an "I'll be there" button. Clicking it adds the user
 * and the message updates in place. Emoji-free, matching the app's view style.
 * @param {import('../../agent/tools/event-store.js').TrackedEvent} event
 * @returns {import('@slack/types').KnownBlock[]}
 */
export function buildRsvpMessageBlocks(event) {
  const count = event.rsvps.length;
  const whenLine = event.date ? `*When:* ${event.date}\n` : '';

  /** @type {import('@slack/types').KnownBlock[]} */
  const blocks = [
    header(event.title),
    section(`${whenLine}You're invited. Tap the button below to let us know you're coming.`),
  ];

  if (count === 0) {
    blocks.push(context('No RSVPs yet — be the first.'));
  } else {
    const names = event.rsvps.map((r) => r.who).join(', ');
    blocks.push(section(`*${count}* ${count === 1 ? 'person is' : 'people are'} going: ${names}`));
  }

  blocks.push(
    actions('event_rsvp_actions', [
      button({ text: "I'll be there", actionId: EVENT_RSVP_ACTION, value: event.id, style: 'primary' }),
    ]),
  );

  return blocks;
}
