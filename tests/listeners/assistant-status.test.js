import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import { setAssistantStatus, statusForMessage } from '../../listeners/assistant-status.js';

describe('statusForMessage', () => {
  const cases = [
    ['find grants for youth education', 'Searching for grants...'],
    ['I need a grant', 'Searching for grants...'],
    ['draft an impact report', 'Drafting...'],
    ['write up our impact', 'Drafting...'],
    ['remind me about the deadline', 'Setting reminder...'],
    ['summarize these meeting notes', 'Summarizing notes...'],
    ['write a thank you for our donors', 'Drafting thank you...'],
    ['create a volunteer announcement', 'Creating announcement...'],
    ['hello there', 'Thinking...'],
    ['', 'Thinking...'],
  ];

  for (const [input, expected] of cases) {
    it(`maps "${input}" -> "${expected}"`, () => {
      assert.strictEqual(statusForMessage(input), expected);
    });
  }

  it('applies rules in order (first match wins)', () => {
    // "draft" is checked before "volunteer/announcement".
    assert.strictEqual(statusForMessage('draft a volunteer announcement'), 'Drafting...');
  });
});

describe('setAssistantStatus', () => {
  it('calls assistant.threads.setStatus with channel, thread, and status', async () => {
    const client = { assistant: { threads: { setStatus: mock.fn(async () => ({ ok: true })) } } };
    await setAssistantStatus(client, 'C1', 'T1', 'Thinking...');
    assert.strictEqual(client.assistant.threads.setStatus.mock.callCount(), 1);
    const args = client.assistant.threads.setStatus.mock.calls[0].arguments[0];
    assert.deepStrictEqual(args, { channel_id: 'C1', thread_ts: 'T1', status: 'Thinking...' });
  });

  it('swallows errors when the thread is not an assistant thread', async () => {
    const client = {
      assistant: {
        threads: {
          setStatus: mock.fn(async () => {
            throw new Error('not an assistant thread');
          }),
        },
      },
    };
    await assert.doesNotReject(() => setAssistantStatus(client, 'C1', 'T1', ''));
  });
});
