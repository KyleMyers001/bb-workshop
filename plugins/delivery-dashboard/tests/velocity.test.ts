import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectVelocity } from '../velocity.ts';
import { parseList, usernamesSchema, repositoriesSchema } from '../velocity-model.ts';

const config = { usernames: ['KyleMyers001'], repositories: ['acme/app'], days: 7, token: 'test-token' };
const now = new Date('2026-10-30T12:00:00Z');
function result() {
  return { data: {
    user: { contributionsCollection: {
      totalPullRequestReviewContributions: 5,
      totalRepositoriesWithContributedPullRequestReviews: 2,
      pullRequestReviewContributionsByRepository: [
        { repository: { nameWithOwner: 'ACME/app' }, contributions: { totalCount: 3 } },
        { repository: { nameWithOwner: 'elsewhere/app' }, contributions: { totalCount: 2 } },
      ],
    } },
    opened: { issueCount: 4 }, open: { issueCount: 1 }, previous: { issueCount: 2 },
    merged: { issueCount: 2, nodes: [
      { createdAt: '2026-10-01T12:00:00Z', mergedAt: '2026-10-24T12:00:00Z' },
      { createdAt: '2026-10-27T12:00:00Z', mergedAt: '2026-10-28T12:00:00Z' },
    ], pageInfo: { hasNextPage: false, endCursor: null } },
  } };
}
test('collects person metrics with a common repo scope and median creation-to-merge time', async () => {
  const mock = (async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.match(body.variables.merged, /author:KyleMyers001/);
    assert.match(body.variables.merged, /repo:acme\/app/);
    assert.match(body.variables.previous, /merged:2026-10-16T12:00:00Z\.\.2026-10-23T11:59:59Z/);
    assert.match(body.variables.merged, /merged:2026-10-23T12:00:00Z\.\.2026-10-30T11:59:59Z/);
    return Response.json(result());
  }) as typeof fetch;
  const [person] = await collectVelocity(config, new AbortController().signal, mock, now);
  assert.equal(person.merged.value, 2);
  assert.equal(person.history!.reduce((sum, bucket) => sum + bucket.merged, 0), 2);
  assert.equal(person.previousMerged.value, 2);
  assert.equal(person.medianMergeHours.value, 288);
  assert.equal(person.reviewedPrs.value, 3);
});
test('uses all visible review contributions when scope is empty', async () => {
  const [person] = await collectVelocity({ ...config, repositories: [] }, new AbortController().signal,
    (async () => Response.json(result())) as typeof fetch, now);
  assert.equal(person.reviewedPrs.value, 5);
});
test('blank token permits authenticated CLI transport instead of blocking collection', async () => {
  const [person] = await collectVelocity({ ...config, token: '' }, new AbortController().signal,
    (async () => Response.json(result())) as typeof fetch, now);
  assert.equal(person.merged.value, 2);
});
test('GraphQL errors never become zero metrics or expose upstream messages', async () => {
  const [person] = await collectVelocity(config, new AbortController().signal,
    (async () => Response.json({ errors: [{ message: 'secret upstream details' }], data: result().data })) as typeof fetch, now);
  assert.equal(person.merged.value, null);
  assert.doesNotMatch(person.merged.error!, /secret/);
});
test('empty history has zero throughput and unavailable median', async () => {
  const response = result(); response.data.merged.issueCount = 0; response.data.merged.nodes = [];
  const [person] = await collectVelocity(config, new AbortController().signal,
    (async () => Response.json(response)) as typeof fetch, now);
  assert.equal(person.merged.value, 0);
  assert.equal(person.medianMergeHours.value, null);
});
test('validates and deduplicates configured people and repository lists', () => {
  assert.deepEqual(parseList('KyleMyers001, kylemyers001\nTeammate'), ['KyleMyers001', 'Teammate']);
  assert.equal(usernamesSchema.safeParse('KyleMyers001 someone').success, true);
  assert.equal(usernamesSchema.safeParse('user is:pr').success, false);
  assert.equal(repositoriesSchema.safeParse('acme/app, acme/api').success, true);
  assert.equal(repositoriesSchema.safeParse('acme/app author:evil').success, false);
});
test('paginates merged PRs before calculating a median', async () => {
  let calls = 0;
  const first = result();
  first.data.merged.pageInfo = { hasNextPage: true, endCursor: 'cursor-1' } as typeof first.data.merged.pageInfo;
  first.data.merged.nodes = first.data.merged.nodes.slice(0, 1);
  const [person] = await collectVelocity(config, new AbortController().signal,
    (async (_url, options) => {
      calls++;
      if (calls === 1) return Response.json(first);
      assert.equal(JSON.parse(String(options?.body)).variables.cursor, 'cursor-1');
      return Response.json({ data: { merged: { ...result().data.merged, nodes: result().data.merged.nodes.slice(1) } } });
    }) as typeof fetch, now);
  assert.equal(calls, 2);
  assert.equal(person.medianMergeHours.value, 288);
});
test('large merge history retains counts but does not claim a partial median', async () => {
  const response = result(); response.data.merged.issueCount = 1001;
  const [person] = await collectVelocity(config, new AbortController().signal,
    (async () => Response.json(response)) as typeof fetch, now);
  assert.equal(person.merged.value, 1001);
  assert.equal(person.medianMergeHours.value, null);
  assert.match(person.medianMergeHours.error!, /limit/);
});
test('isolates unavailable users from successful teammates', async () => {
  const people = await collectVelocity({ ...config, usernames: ['missing', 'KyleMyers001'] },
    new AbortController().signal, (async (_url, options) => {
      const data = result();
      if (JSON.parse(String(options?.body)).variables.login === 'missing') {
        return Response.json({ data: { ...data.data, user: null } });
      }
      return Response.json(data);
    }) as typeof fetch, now);
  assert.equal(people[0].merged.value, null);
  assert.equal(people[1].merged.value, 2);
});
test('cancellation aborts rather than publishing misleading unavailable data', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(collectVelocity(config, controller.signal,
    (async () => { throw new Error('aborted'); }) as typeof fetch, now));
});

test('scoped reviews refuse a truncated repository grouping while keeping PR counts', async () => {
  const response = result();
  response.data.user.contributionsCollection.totalRepositoriesWithContributedPullRequestReviews = 101;
  const [person] = await collectVelocity(config, new AbortController().signal,
    (async () => Response.json(response)) as typeof fetch, now);
  assert.equal(person.reviewedPrs.value, null);
  assert.match(person.reviewedPrs.error!, /limit/);
  assert.equal(person.merged.value, 2);
});

test('splits a yearly history above GitHub search’s 1000-result limit', async () => {
  let calls = 0;
  const response = result(); response.data.merged.issueCount = 1002;
  const [person] = await collectVelocity({ ...config, days: 365 }, new AbortController().signal,
    (async (_url, options) => {
      calls++;
      const { query, variables } = JSON.parse(String(options?.body));
      if (query.includes('query Velocity')) return Response.json(response);
      const match = variables.merged.match(/merged:([^ ]+)\.\.([^ ]+)/)!;
      const mergedAt = new Date((Date.parse(match[1]) + Date.parse(match[2])) / 2).toISOString();
      const createdAt = new Date(Date.parse(mergedAt) - 3600000).toISOString();
      const offset = Number(variables.cursor ?? 0);
      const length = Math.min(100, 501 - offset);
      return Response.json({ data: { merged: {
        issueCount: 501, nodes: Array.from({ length }, () => ({ createdAt, mergedAt })),
        pageInfo: { hasNextPage: offset + length < 501, endCursor: String(offset + length) },
      } } });
    }) as typeof fetch, now);
  assert.equal(person.merged.value, 1002);
  assert.equal(person.medianMergeHours.value, 1);
  assert.equal(person.historyError, null);
  assert.equal(person.history!.reduce((sum, bucket) => sum + bucket.merged, 0), 1002);
  assert.ok(calls > 10 && calls < 64);
});
