import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { handleAnnounceCommand } from '../../../listeners/commands/announce.js';
import { handleGrantCommand } from '../../../listeners/commands/grant.js';
import { HELP_TEXT, handleKalaCommand } from '../../../listeners/commands/help.js';
import { handleRemindCommand } from '../../../listeners/commands/remind.js';
import { handleReportCommand } from '../../../listeners/commands/report.js';

describe('slash commands', () => {
  let ack;
  let respond;

  beforeEach(() => {
    ack = mock.fn(async () => {});
    respond = mock.fn(async () => {});
  });

  describe('usage hints when called with no text', () => {
    const commands = [
      ['/grant', handleGrantCommand],
      ['/report', handleReportCommand],
      ['/remind', handleRemindCommand],
      ['/announce', handleAnnounceCommand],
    ];

    for (const [name, handler] of commands) {
      it(`${name} acks and shows an ephemeral usage hint`, async () => {
        await handler({ command: { text: '', user_id: 'U1', channel_id: 'C1' }, ack, respond });
        assert.strictEqual(ack.mock.callCount(), 1);
        assert.strictEqual(respond.mock.callCount(), 1);
        const arg = respond.mock.calls[0].arguments[0];
        assert.strictEqual(arg.response_type, 'ephemeral');
        assert.ok(arg.text.includes('Usage:'));
      });
    }
  });

  describe('/kala help', () => {
    it('acks and returns help listing every command', async () => {
      await handleKalaCommand({ ack, respond });
      assert.strictEqual(ack.mock.callCount(), 1);
      const arg = respond.mock.calls[0].arguments[0];
      assert.strictEqual(arg.response_type, 'ephemeral');
      for (const cmd of ['/grant', '/report', '/deadline', '/announce', '/kala']) {
        assert.ok(arg.text.includes(cmd), `help mentions ${cmd}`);
      }
    });

    it('HELP_TEXT is non-empty', () => {
      assert.ok(HELP_TEXT.length > 0);
    });
  });
});
