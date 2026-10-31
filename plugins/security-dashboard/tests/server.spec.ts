import { afterEach, expect, test, vi } from 'vitest';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import plugin from '../server';
import { snapshotSchema } from '../model';

vi.mock('../gh-api', () => ({ ghFetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) }));
const hosts: ReturnType<typeof createFakePluginHost>[] = [];
function host(repositories = 'acme/app') {
  const value = createFakePluginHost({ pluginId: 'security-dashboard', settings: { repositories } });
  hosts.push(value); return value;
}
afterEach(async () => { for (const { harness } of hosts.splice(0)) await harness.lifecycle.dispose(); vi.unstubAllGlobals(); });
const finding = { number: 20, state: 'open', created_at: '2026-10-01T00:00:00Z',
  dependency: { package: { name: 'glib', ecosystem: 'rust' }, manifest_path: 'Cargo.lock', scope: 'runtime' },
  security_advisory: { summary: 'Example advisory' },
  security_vulnerability: { severity: 'medium', vulnerable_version_range: '<0.20.0', first_patched_version: { identifier: '0.20.0' } } };

test('an empty explicit list makes no SDK/discovery/CLI requests', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const { bb, harness } = host(''); await plugin(bb);
  expect(snapshotSchema.parse(await harness.behavior.callRpc('view', null)).repositories).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
  expect(harness.inspection.sdk.calls).toEqual([]);
});

test('coalesces active refreshes and caches successful reads for five minutes', async () => {
  const fetcher = vi.fn(async () => Response.json([finding])); vi.stubGlobal('fetch', fetcher);
  const { bb, harness } = host(); await plugin(bb);
  await Promise.all([harness.behavior.callRpc('view', null), harness.behavior.callRpc('view', null)]);
  await harness.behavior.callRpc('view', null);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await harness.behavior.callRpc('refresh', null);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('a scope change aborts old work and never resurrects removed repositories', async () => {
  let release!: () => void;
  vi.stubGlobal('fetch', vi.fn(async () => { await new Promise<void>(resolve => { release = resolve; }); return Response.json([finding]); }));
  const { bb, harness } = host(); await plugin(bb);
  const before = harness.behavior.callRpc('refresh', null);
  await vi.waitFor(() => expect(release).toBeDefined());
  await harness.behavior.setSettings({ repositories: '' });
  release();
  expect(snapshotSchema.parse(await before).repositories).toEqual([]);
});

test('validates explicit settings and rejects stale edits', async () => {
  const { bb, harness } = host(''); await plugin(bb);
  const saved = snapshotSchema.parse(await harness.behavior.callRpc('saveWatchList', { watchList: 'Acme/App, acme/app', expectedWatchList: '' }));
  expect(saved.watchList).toBe('Acme/App');
  expect(saved.repositories[0].status).toBe('pending');
  await expect(harness.behavior.callRpc('saveWatchList', { watchList: 'acme/other', expectedWatchList: '' })).rejects.toThrow();
  await expect(harness.behavior.setSettings({ repositories: '../escape' })).rejects.toThrow();
});

test('persists only manual local work metadata, without modifying GitHub or launching a thread', async () => {
  const fetcher = vi.fn(async () => Response.json([finding])); vi.stubGlobal('fetch', fetcher);
  const { bb, harness } = host(); await plugin(bb);
  await harness.behavior.callRpc('view', null);
  const work = { status: 'pr-open', url: 'https://github.com/acme/app/pull/42' };
  const result = snapshotSchema.parse(await harness.behavior.callRpc('saveWork', { key: 'acme/app#20', work }));
  expect(result.repositories[0].alerts[0].work).toEqual(work);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(harness.inspection.sdk.calls).toEqual([]);
  await expect(harness.behavior.callRpc('saveWork', { key: 'other/repo#20', work })).rejects.toThrow();
  await expect(harness.behavior.callRpc('saveWork', { key: 'acme/app#20', work: { status: 'fixed', url: null } })).rejects.toThrow();
  await expect(harness.behavior.callRpc('saveWork', { key: 'acme/app#20', work: { status: 'pr-open', url: 'javascript:evil()' } })).rejects.toThrow();
  await expect(harness.behavior.callRpc('saveWork', { key: 'acme/app#20', work: { status: 'pr-open', url: null } })).rejects.toThrow();
  const replacement = await harness.lifecycle.reload(plugin);
  hosts.push(replacement);
  const after = snapshotSchema.parse(await replacement.harness.behavior.callRpc('view', null));
  expect(after.repositories[0].alerts[0].work).toEqual(work);
});

test('a failed refresh replaces old alerts with explicit unavailable coverage', async () => {
  const fetcher = vi.fn(async () => Response.json([finding])); vi.stubGlobal('fetch', fetcher);
  const { bb, harness } = host(); await plugin(bb);
  await harness.behavior.callRpc('view', null);
  fetcher.mockImplementation(async () => new Response('', { status: 403 }));
  const result = snapshotSchema.parse(await harness.behavior.callRpc('refresh', null));
  expect(result.repositories[0]).toMatchObject({ status: 'unavailable', alerts: [] });
});
