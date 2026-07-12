import assert from 'node:assert';
import { describe, it } from 'node:test';

import { createDraftDonorThankYouTool } from '../../agent/tools/donor-thankyou.js';
import { createDraftImpactReportTool } from '../../agent/tools/report-drafter.js';
import { createVolunteerAnnouncementTool } from '../../agent/tools/volunteer-announcement.js';
import { SessionStore } from '../../thread-context/store.js';

describe('draft capture via onDraft', () => {
  it('donor thank-you emits its type and core content, not the footer prompt', async () => {
    let captured = null;
    const t = createDraftDonorThankYouTool((d) => {
      captured = d;
    });
    const res = await t.handler({ donor_count: 12, gift_range: 'under $100' });

    assert.strictEqual(captured.type, 'donor thank-you');
    assert.ok(captured.content.includes('With gratitude'), 'captures the letter body');
    assert.ok(!captured.content.includes('Ready to send'), 'does not capture the follow-up footer');
    // The model still receives the full text (body + footer).
    assert.ok(res.content[0].text.includes('Ready to send'));
  });

  it('impact report and volunteer announcement emit their types', async () => {
    let report = null;
    await createDraftImpactReportTool((d) => {
      report = d;
    }).handler({ impact: 'fed 500 families this winter' });
    assert.strictEqual(report.type, 'impact report');
    assert.ok(report.content.includes('IMPACT REPORT'));

    let announce = null;
    await createVolunteerAnnouncementTool((d) => {
      announce = d;
    }).handler({ event_name: 'Food Drive', date: 'Sat Aug 16', time: '9-12', volunteers_needed: 8 });
    assert.strictEqual(announce.type, 'volunteer announcement');
    assert.ok(announce.content.includes('Volunteers needed: Food Drive'));
  });

  it('tools without an onDraft callback still work (default export path)', async () => {
    const t = createDraftImpactReportTool();
    const res = await t.handler({ impact: 'tutored 30 kids' });
    assert.ok(res.content[0].text.includes('IMPACT REPORT'));
  });
});

describe('last-draft tracking (full cycle: draft -> store -> retrieve for edit)', () => {
  it('a drafted message is remembered for its thread and found on the next turn', async () => {
    const store = new SessionStore();
    const channelId = 'C1';
    const threadTs = '100.1';

    // Turn 1: the donor tool runs; runKalaAgent would capture the draft like this.
    let captured = null;
    await createDraftDonorThankYouTool((d) => {
      captured = d;
    }).handler({ donor_count: 5, gift_range: '$50' });
    store.setLastDraft(channelId, threadTs, captured);

    // Turn 2 (the "make it shorter" reply, same thread): the draft is available.
    const pending = store.getLastDraft(channelId, threadTs);
    assert.strictEqual(pending.type, 'donor thank-you');
    assert.ok(pending.content.includes('With gratitude'));

    // A different thread has no pending draft to edit.
    assert.strictEqual(store.getLastDraft(channelId, '999.9'), null);
  });

  it('the newest draft in a thread replaces the previous one', async () => {
    const store = new SessionStore();
    await createVolunteerAnnouncementTool((d) => store.setLastDraft('C1', 'T1', d)).handler({
      event_name: 'Cleanup',
      date: 'Sun',
      time: '10-1',
      volunteers_needed: 4,
    });
    await createDraftImpactReportTool((d) => store.setLastDraft('C1', 'T1', d)).handler({ impact: 'ran a cleanup' });

    assert.strictEqual(store.getLastDraft('C1', 'T1').type, 'impact report');
  });
});
