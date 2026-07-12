import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import {
  _resetScheduleChanges,
  acknowledge,
  addScheduleChange,
  getScheduleChange,
} from '../../../agent/tools/schedule-store.js';
import {
  buildScheduleAckBlocks,
  buildScheduleAckText,
  SCHEDULE_ACK_ACTION,
} from '../../../listeners/views/schedule-ack-builder.js';

describe('schedule acknowledgment card', () => {
  beforeEach(() => _resetScheduleChanges());

  it('renders the change, a tally with the still-waiting names, and an Acknowledge button', () => {
    const c = addScheduleChange({ change: 'Call time moved to 8am', people: ['<@U1>', '<@U2>'], channelId: 'C1' });
    acknowledge(c.id, { userId: 'U1' });
    const blocks = buildScheduleAckBlocks(getScheduleChange(c.id));

    assert.strictEqual(blocks[0].type, 'header');
    assert.match(blocks[1].text.text, /Call time moved to 8am/);
    const tally = blocks.find((b) => b.type === 'section' && /confirmed/.test(b.text?.text || ''));
    assert.match(tally.text.text, /\*1 of 2 confirmed\.\*/);
    assert.match(tally.text.text, /<@U2>/, 'names the person still waiting');

    const btn = blocks.find((b) => b.type === 'actions').elements[0];
    assert.strictEqual(btn.action_id, SCHEDULE_ACK_ACTION);
    assert.strictEqual(btn.value, c.id);
    assert.strictEqual(btn.style, 'primary');
  });

  it('shows an all-confirmed line once everyone acknowledges', () => {
    const c = addScheduleChange({ change: 'x', people: ['<@U1>'], channelId: 'C1' });
    acknowledge(c.id, { userId: 'U1' });
    const blocks = buildScheduleAckBlocks(getScheduleChange(c.id));
    assert.ok(blocks.some((b) => b.type === 'section' && /All 1 confirmed/.test(b.text?.text || '')));
  });

  it('buildScheduleAckText gives a plain fallback with the tally', () => {
    const c = addScheduleChange({ change: 'Doors at 7', people: ['<@U1>', '<@U2>'], channelId: 'C1' });
    assert.match(buildScheduleAckText(c), /Schedule change — please confirm: Doors at 7 \(0\/2 confirmed\)/);
  });
});
