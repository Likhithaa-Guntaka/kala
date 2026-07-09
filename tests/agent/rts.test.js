import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import { formatWorkspaceResults, searchWorkspaceContext } from '../../agent/tools/rts.js';

/** Build a fake fetch that returns the given JSON payload and records the call. */
function fakeFetch(payload) {
  return mock.fn(async () => ({ json: async () => payload }));
}

const SAMPLE = {
  ok: true,
  results: {
    messages: [
      {
        author_name: 'Maria',
        channel_id: 'C1',
        channel_name: 'grants',
        message_ts: '1720000000.000100',
        content: '  We should apply for the Ford Foundation grant before the September deadline. ',
        permalink: 'https://slack.com/archives/C1/p1720000000000100',
      },
    ],
    files: [{ file_id: 'F1', title: 'Ford proposal draft', author_name: 'Sam', permalink: 'https://files/F1' }],
  },
};

describe('searchWorkspaceContext', () => {
  it('POSTs to assistant.search.context with the user token and query', async () => {
    const f = fakeFetch(SAMPLE);
    await searchWorkspaceContext({ userToken: 'xoxp-abc', query: 'Ford grant', fetchImpl: f });

    assert.strictEqual(f.mock.callCount(), 1);
    const [url, init] = f.mock.calls[0].arguments;
    assert.strictEqual(url, 'https://slack.com/api/assistant.search.context');
    assert.strictEqual(init.method, 'POST');
    assert.strictEqual(init.headers.Authorization, 'Bearer xoxp-abc');
    const body = JSON.parse(init.body);
    assert.strictEqual(body.query, 'Ford grant');
    assert.deepStrictEqual(body.content_types, ['messages']);
  });

  it('normalizes messages and files from the response', async () => {
    const res = await searchWorkspaceContext({
      userToken: 'xoxp-abc',
      query: 'Ford grant',
      contentTypes: ['messages', 'files'],
      fetchImpl: fakeFetch(SAMPLE),
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.messages.length, 1);
    assert.strictEqual(res.messages[0].author, 'Maria');
    assert.strictEqual(res.messages[0].channelName, 'grants');
    assert.ok(res.messages[0].text.startsWith('We should apply'));
    assert.strictEqual(res.files.length, 1);
    assert.strictEqual(res.files[0].title, 'Ford proposal draft');
  });

  it('clamps limit to the API max of 20', async () => {
    const f = fakeFetch(SAMPLE);
    await searchWorkspaceContext({ userToken: 'xoxp-abc', query: 'x', limit: 100, fetchImpl: f });
    assert.strictEqual(JSON.parse(f.mock.calls[0].arguments[1].body).limit, 20);
  });

  it('returns no_user_token error when the user token is missing', async () => {
    const f = fakeFetch(SAMPLE);
    const res = await searchWorkspaceContext({ userToken: undefined, query: 'x', fetchImpl: f });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error, 'no_user_token');
    assert.strictEqual(f.mock.callCount(), 0);
  });

  it('surfaces a Slack API error', async () => {
    const res = await searchWorkspaceContext({
      userToken: 'xoxp-abc',
      query: 'x',
      fetchImpl: fakeFetch({ ok: false, error: 'missing_scope' }),
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error, 'missing_scope');
  });
});

describe('formatWorkspaceResults', () => {
  it('renders messages with author, channel link, and snippet', () => {
    const res = {
      ok: true,
      messages: [
        {
          author: 'Maria',
          channelName: 'grants',
          channelId: 'C1',
          ts: '1',
          text: 'Apply for Ford grant',
          permalink: 'https://p/1',
        },
      ],
      files: [],
    };
    const text = formatWorkspaceResults('Ford grant', res);
    assert.ok(text.includes('Maria'));
    assert.ok(text.includes('grants'));
    assert.ok(text.includes('Apply for Ford grant'));
    assert.ok(text.includes('https://p/1'));
  });

  it('gives a connect hint when the user token is missing', () => {
    const text = formatWorkspaceResults('x', { ok: false, messages: [], files: [], error: 'no_user_token' });
    assert.ok(/connected to Slack search/i.test(text));
  });

  it('handles an empty result set', () => {
    const text = formatWorkspaceResults('nothing', { ok: true, messages: [], files: [] });
    assert.ok(/found nothing/i.test(text));
  });
});
