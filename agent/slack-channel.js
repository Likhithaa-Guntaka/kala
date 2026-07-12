/**
 * Whether a Slack conversation id refers to a 1:1 direct message (im).
 *
 * Slack conversation ids are prefixed by type: im/DM ids start with "D", public
 * channels with "C", and private channels / group DMs (mpim) with "G". We treat
 * only 1:1 DMs as "not a real channel", so team-facing tracker cards (RSVP,
 * schedule-change acknowledgment) are never posted somewhere only one person can
 * see them. Private channels (G) are legitimate places to post, so they are not
 * flagged.
 *
 * @param {string | null | undefined} channelId
 * @returns {boolean}
 */
export function isDmChannel(channelId) {
  return typeof channelId === 'string' && channelId.startsWith('D');
}
