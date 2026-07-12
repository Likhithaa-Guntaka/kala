import assert from 'node:assert';
import { describe, it } from 'node:test';

import { agentPromptFor } from '../../../listeners/events/message.js';

/**
 * These cover the exact one-line fix for the "blank field reaches the agent" bug:
 * an issue submission's visible message is a short human line, so the agent must
 * run on the prompt carried in metadata — falling back to the message text only
 * when there is no usable prompt.
 */
describe('agentPromptFor', () => {
  it('uses the metadata prompt for an issue submission (not the visible human line)', () => {
    const meta = {
      event_type: 'issue_submission',
      event_payload: { user_id: 'U1', prompt: 'Find Grants: youth education under $50k' },
    };
    const event = { text: 'On it — working on *Find Grants*. The full answer is in the thread below.' };
    assert.strictEqual(agentPromptFor(meta, event), 'Find Grants: youth education under $50k');
  });

  it('uses the category-only prompt when Details was left blank (the bug case)', () => {
    // issue-modal builds prompt = category when Details is empty — never "" and
    // never the human display text. The agent must receive "Find Grants".
    const meta = { event_type: 'issue_submission', event_payload: { user_id: 'U1', prompt: 'Find Grants' } };
    const event = { text: 'On it — working on *Find Grants*. The full answer is in the thread below.' };
    assert.strictEqual(agentPromptFor(meta, event), 'Find Grants');
  });

  it('falls back to the message text for a normal message (no issue metadata)', () => {
    const event = { text: 'find grants for a community theater in Ohio' };
    assert.strictEqual(agentPromptFor(null, event), 'find grants for a community theater in Ohio');
  });

  it('falls back to the message text if an issue submission somehow has no prompt', () => {
    const meta = { event_type: 'issue_submission', event_payload: { user_id: 'U1' } };
    const event = { text: 'raw message text' };
    assert.strictEqual(agentPromptFor(meta, event), 'raw message text');
  });

  it('never returns undefined when neither a prompt nor text is present', () => {
    assert.strictEqual(agentPromptFor(null, {}), '');
  });
});
