import { expect, test, vi } from 'vitest';
const mock = vi.hoisted(() => ({ execFile: vi.fn(), end: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: mock.execFile }));
import { ghFetch, CLI_SETUP_MESSAGE } from '../gh-api';

function cli(output: string, error: Error | null = null) {
  mock.execFile.mockImplementation((_file, _args, _options, callback) => {
    queueMicrotask(() => callback(error, output));
    return { stdin: { on: vi.fn(), end: mock.end } };
  });
}
test('GraphQL uses authenticated gh and sends the query through stdin', async () => {
  cli('{"data":{"ok":true}}');
  const body = JSON.stringify({ query: 'query { viewer { login } }' });
  const signal = new AbortController().signal;
  const response = await ghFetch('https://api.github.com/graphql', { method: 'POST', body, signal });
  expect(await response.json()).toEqual({ data: { ok: true } });
  const [file, args, options] = mock.execFile.mock.lastCall!;
  expect(file).toBe('gh');
  expect(args).toContain('github.com');
  expect(args.slice(-2)).toEqual(['--input', '-']);
  expect(args).not.toContain(body);
  expect(mock.end).toHaveBeenLastCalledWith(body);
  expect(options).toMatchObject({ timeout: 15000, killSignal: 'SIGKILL', signal });
});
test('REST preserves query parameters and forces GET', async () => {
  cli('[]');
  await ghFetch('https://api.github.com/repos/acme/app/pulls?state=open&page=2');
  expect(mock.execFile.mock.lastCall![1]).toContain('repos/acme/app/pulls?state=open&page=2');
  expect(mock.execFile.mock.lastCall![1]).toContain('GET');
});
test('CLI failures do not expose stderr or command details', async () => {
  cli('', new Error('sensitive upstream credentials'));
  await expect(ghFetch('https://api.github.com/repos/acme/app/pulls')).rejects.toThrow(CLI_SETUP_MESSAGE);
});
test('does not run arbitrary hosts or mutations', async () => {
  await expect(ghFetch('https://example.com/repos/acme/app')).rejects.toThrow('Unsupported');
  await expect(ghFetch('https://api.github.com/repos/acme/app', { method: 'DELETE' })).rejects.toThrow('Unsupported');
});
test('aborted requests never launch a process', async () => {
  const controller = new AbortController(); controller.abort();
  const before = mock.execFile.mock.calls.length;
  await expect(ghFetch('https://api.github.com/repos/acme/app', { signal: controller.signal })).rejects.toThrow();
  expect(mock.execFile.mock.calls.length).toBe(before);
});
