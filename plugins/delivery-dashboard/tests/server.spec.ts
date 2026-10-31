import { afterEach, expect, test, vi } from 'vitest';
import { createFakePluginHost, experimental_scanPublicSdkOnly } from '@get-bb/plugin-sdk/testing';
import plugin from '../server';

vi.mock('../gh-api', () => ({ ghFetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args), CLI_SETUP_MESSAGE: 'Run gh auth login' }));

vi.mock('node:timers/promises', () => ({
  setTimeout: (ms: number, value: unknown, { signal }: { signal: AbortSignal }) => new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('aborted')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(value); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  }),
}));

const hosts: ReturnType<typeof createFakePluginHost>[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function host() {
  const result = createFakePluginHost({ pluginId: 'delivery-dashboard', settings: { repository: 'acme/app', refreshSeconds: 60 } });
  hosts.push(result);
  return result;
}
function mockApi() {
  return vi.fn(async (url: string) => Response.json(url.includes('/actions/') ? { workflow_runs: [] } : []));
}
test('refreshes at the configured interval and stops on abort', async () => {
  vi.useFakeTimers();
  const fetcher = mockApi();
  vi.stubGlobal('fetch', fetcher);
  const { bb, harness } = host();
  await plugin(bb);
  const service = harness.behavior.runService('refresh-metrics');
  await vi.advanceTimersByTimeAsync(1);
  expect(fetcher).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(59_000);
  expect(fetcher).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(fetcher).toHaveBeenCalledTimes(8);
  service.controller.abort();
  await service.done;
  await vi.advanceTimersByTimeAsync(120_000);
  expect(fetcher).toHaveBeenCalledTimes(8);
});
test('settings clear cached data and reject invalid configuration', async () => {
  vi.stubGlobal('fetch', mockApi());
  const { bb, harness } = host();
  await plugin(bb);
  await harness.behavior.callRpc('refresh', null);
  expect((await harness.behavior.callRpc('status', null)).updatedAt).not.toBeNull();
  await harness.behavior.setSettings({ repository: 'other/repo' });
  const result = await harness.behavior.callRpc('status', null);
  expect(result.repository).toBe('other/repo');
  expect(result.people[0].username).toBe('KyleMyers001');
  await harness.behavior.setSettings({ usernames: 'KyleMyers001, teammate', comparisonRepositories: 'acme/app, acme/api' });
  const personal = await harness.behavior.callRpc('status', null);
  expect(personal.people.map((person: { username: string }) => person.username)).toEqual(['KyleMyers001', 'teammate']);
  expect(personal.repositories).toEqual(['acme/app', 'acme/api']);
  await expect(harness.behavior.setSettings({ usernames: 'is:pr' })).rejects.toThrow();
  expect(result.updatedAt).toBeNull();
  await expect(harness.behavior.setSettings({ refreshSeconds: 0 })).rejects.toThrow();
  await expect(harness.behavior.setSettings({ repository: '../escape' })).rejects.toThrow();
  await expect(harness.behavior.setSettings({ repository: 'acme/..' })).rejects.toThrow();
});
test('concurrent refreshes share one collection', async () => {
  const fetcher = mockApi();
  vi.stubGlobal('fetch', fetcher);
  const { bb, harness } = host();
  await plugin(bb);
  await Promise.all([harness.behavior.callRpc('refresh', null), harness.behavior.callRpc('refresh', null)]);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
test('imports only the public SDK', async () => {
  const result = await experimental_scanPublicSdkOnly(process.cwd(), { allow: [
    'react', 'react-dom', '@radix-ui/react-slot', '@radix-ui/react-checkbox', '@radix-ui/react-dialog', 'class-variance-authority', 'clsx',
    'tailwind-merge', 'vitest', 'vitest/config', '@testing-library/react',
    '@get-bb/plugin-sdk/testing', '@get-bb/plugin-sdk/testing/app',
  ].map(name => new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')) });
  expect(result.violations).toEqual([]);
  expect(result.privateDependencies).toEqual([]);
});

test('range caches are independent, coalesce requests, and validate supported spans', async () => {
  const fetcher = mockApi(); vi.stubGlobal('fetch', fetcher);
  const { bb, harness } = host(); await plugin(bb);
  const [month, sameMonth] = await Promise.all([
    harness.behavior.callRpc('view', { days: 30 }), harness.behavior.callRpc('view', { days: 30 }),
  ]);
  expect(month.days).toBe(30);
  expect(sameMonth).toEqual(month);
  expect(fetcher).toHaveBeenCalledTimes(4);
  await harness.behavior.callRpc('view', { days: 30 });
  expect(fetcher).toHaveBeenCalledTimes(4);
  const year = await harness.behavior.callRpc('view', { days: 365 });
  expect(year.days).toBe(365);
  expect(fetcher).toHaveBeenCalledTimes(8);
  await expect(harness.behavior.callRpc('view', { days: 999 })).rejects.toThrow();
  await harness.behavior.setSettings({ usernames: 'other' });
  const fresh = await harness.behavior.callRpc('view', { days: 30 });
  expect(fresh.people[0].username).toBe('other');
  expect(fetcher).toHaveBeenCalledTimes(12);
});

test('settings changes prevent an older in-flight range from restoring stale people', async () => {
  let release: (() => void) | undefined;
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes('/graphql') && !release) await new Promise<void>(resolve => { release = resolve; });
    return Response.json(url.includes('/actions/') ? { workflow_runs: [] } : []);
  });
  vi.stubGlobal('fetch', fetcher);
  const { bb, harness } = host(); await plugin(bb);
  const old = harness.behavior.callRpc('view', { days: 30 });
  await vi.waitFor(() => expect(release).toBeDefined());
  await harness.behavior.setSettings({ usernames: 'new-person' });
  release!();
  const result = await old;
  expect(result.people.map((person: { username: string }) => person.username)).toEqual(['new-person']);
  expect(result.updatedAt).toBeNull();
});
