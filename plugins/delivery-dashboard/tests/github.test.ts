import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectMetrics } from '../github.ts';

const config = { repository: 'acme/app', environment: 'production', days: 7, token: '' };
const now = new Date('2026-10-30T12:00:00Z');
function api(routes: Record<string, unknown>) {
  return (async (url: string | URL | Request) => {
    const path = String(url).replace('https://api.github.com/repos/acme/app', '');
    const key = Object.keys(routes).find(key => path.startsWith(key));
    assert.ok(key, `Unexpected request: ${path}`);
    return Response.json(routes[key]);
  }) as typeof fetch;
}
test('counts PRs separately and successful deployments even after becoming inactive', async () => {
  const result = await collectMetrics(config, new AbortController().signal, api({
    '/pulls?': [{ id: 1 }, { id: 2 }],
    '/actions/runs?': { workflow_runs: [
      { status: 'completed', conclusion: 'success' },
      { status: 'completed', conclusion: 'failure' },
      { status: 'completed', conclusion: 'cancelled' },
    ] },
    '/deployments?': [{ id: 1, created_at: now.toISOString() }, { id: 2, created_at: now.toISOString() }],
    '/deployments/1/statuses?': [{ state: 'inactive' }, { state: 'success' }],
    '/deployments/2/statuses?': [{ state: 'failure' }],
  }), now);
  assert.equal(result.openPrs.value, 2);
  assert.equal(result.deployments.value, 1);
  assert.equal(result.ciPassRate.value, 100 / 3);
});
test('no CI runs is unavailable rather than a fabricated zero percent', async () => {
  const result = await collectMetrics(config, new AbortController().signal, api({
    '/pulls?': [], '/actions/runs?': { workflow_runs: [] }, '/deployments?': [],
  }), now);
  assert.equal(result.ciPassRate.value, null);
  assert.equal(result.ciPassRate.error, null);
  assert.equal(result.deployments.value, 0);
});
test('partial failures do not erase independent metrics or expose response bodies', async () => {
  const mock = (async (url: string | URL | Request) => String(url).includes('/pulls?')
    ? new Response('sensitive upstream details', { status: 403 })
    : Response.json(String(url).includes('/actions/') ? { workflow_runs: [] } : [])) as typeof fetch;
  const result = await collectMetrics(config, new AbortController().signal, mock, now);
  assert.equal(result.openPrs.value, null);
  assert.match(result.openPrs.error!, /403/);
  assert.doesNotMatch(result.openPrs.error!, /sensitive/);
  assert.equal(result.deployments.value, 0);
});
test('pagination follows full pages and refuses silently truncated counts', async () => {
  let pages = 0;
  const mock = (async (url: string | URL | Request) => {
    if (String(url).includes('/pulls?')) { pages++; return Response.json(Array(100).fill({ id: 1 })); }
    return Response.json(String(url).includes('/actions/') ? { workflow_runs: [] } : []);
  }) as typeof fetch;
  const result = await collectMetrics(config, new AbortController().signal, mock, now);
  assert.equal(pages, 10);
  assert.equal(result.openPrs.value, null);
  assert.match(result.openPrs.error!, /limit/);
});
