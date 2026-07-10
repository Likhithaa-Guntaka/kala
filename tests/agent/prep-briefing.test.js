import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import { _resetDeadlines, addDeadline } from '../../agent/tools/deadline-store.js';
import { analyzeNotes } from '../../agent/tools/meeting-summarizer.js';
import { buildBriefing, gatherBriefing, PREP_BRIEFING_SCHEMA } from '../../agent/tools/prep-briefing.js';

/** An ok RTS search result with the given message contents. @param {string[]} contents */
function searchOk(contents) {
  return {
    ok: true,
    messages: contents.map((text, i) => ({
      author: `Person${i}`,
      channelName: 'grants',
      channelId: `C${i}`,
      ts: `${i}`,
      text,
    })),
    files: [],
  };
}

describe('buildBriefing', () => {
  it('organizes discussed / outstanding / coming up when there is material', () => {
    const search = searchOk([
      'We met the Ford Foundation program officer last week.',
      'Sam will send the Ford budget by Friday.',
    ]);
    const deadlines = [{ title: 'Ford Foundation report', dueDate: '2099-12-01', owner: 'Sam' }];

    const text = buildBriefing('Ford Foundation', search, deadlines);
    assert.ok(text.includes('Ford Foundation'));
    assert.ok(/DISCUSSED/.test(text), 'has a discussed section');
    assert.ok(/program officer/.test(text), 'includes a real mention');
    assert.ok(/OUTSTANDING/.test(text) && /will send the Ford budget/.test(text), 'pulls an open ask');
    assert.ok(/COMING UP/.test(text) && /Ford Foundation report/.test(text), 'lists the tracked deadline');
    // It instructs the model to synthesize, not dump.
    assert.ok(/short briefing/i.test(text));
  });

  it('is honest when nothing is found', () => {
    const text = buildBriefing('Nobody Inc', { ok: true, messages: [], files: [] }, []);
    assert.ok(/couldn't find anything about "Nobody Inc"/.test(text));
  });

  it('explains when search is unavailable and there are no deadlines', () => {
    const text = buildBriefing('Ford', { ok: false, messages: [], files: [], error: 'no_user_token' }, []);
    assert.ok(/can't search your workspace/i.test(text));
  });

  it('still briefs from deadlines alone when search returned nothing usable', () => {
    const text = buildBriefing('Ford', { ok: false, messages: [], files: [], error: 'no_user_token' }, [
      { title: 'Ford grant report', dueDate: '2099-10-01' },
    ]);
    assert.ok(/COMING UP/.test(text) && /Ford grant report/.test(text));
  });
});

describe('gatherBriefing (full cycle: search + deadlines -> briefing)', () => {
  beforeEach(() => _resetDeadlines());

  it('searches the workspace, folds in a tracked deadline, and returns a briefing', async () => {
    addDeadline({ title: 'Ford Foundation final report', dueDate: '2099-11-30', channelId: 'C1', createdBy: 'U1' });

    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        results: {
          messages: [
            {
              author_name: 'Lee',
              channel_name: 'grants',
              channel_id: 'C1',
              message_ts: '1',
              content: 'We met the Ford program officer.',
            },
            {
              author_name: 'Sam',
              channel_name: 'grants',
              channel_id: 'C1',
              message_ts: '2',
              content: 'Sam will send the Ford budget by Friday.',
            },
          ],
        },
      }),
    });

    const text = await gatherBriefing({ subject: 'Ford', userToken: 'xoxp-test', fetchImpl });
    assert.ok(/DISCUSSED/.test(text) && /program officer/.test(text), 'discussed section from search');
    assert.ok(/OUTSTANDING/.test(text) && /will send the Ford budget/.test(text), 'outstanding from an open ask');
    assert.ok(
      /COMING UP/.test(text) && /Ford Foundation final report/.test(text),
      'coming up from the tracked deadline',
    );
  });

  it('degrades gracefully with no user token', async () => {
    const text = await gatherBriefing({ subject: 'Ford', userToken: undefined });
    assert.ok(/can't search your workspace/i.test(text) || /couldn't find/i.test(text));
  });
});

describe('prep_briefing schema + shared extraction', () => {
  it('validates a subject string', () => {
    assert.strictEqual(PREP_BRIEFING_SCHEMA.subject.parse('the Ford Foundation'), 'the Ford Foundation');
    assert.throws(() => PREP_BRIEFING_SCHEMA.subject.parse(42));
  });

  it('analyzeNotes (shared with summarize_meeting) finds open asks in free text', () => {
    const { actionItems } = analyzeNotes('Nice to see everyone. Maria will follow up with the funder by Aug 30.');
    assert.ok(actionItems.some((a) => /follow up with the funder/.test(a.task)));
  });
});
