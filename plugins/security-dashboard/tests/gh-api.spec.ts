import { afterEach, expect, test, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { ghFetch } from '../gh-api';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
const execute = vi.mocked(execFile);
afterEach(() => vi.resetAllMocks());
function reply(stdout: string, error: Error | null = null) {
  execute.mockImplementation(((_file: string, _args: unknown, _options: unknown, callback: (error: Error | null, output: string, stderr: string) => void) => {
    callback(error, stdout, 'credential-like diagnostic that must never escape');
    return {};
  }) as unknown as typeof execFile);
}

test('uses only GET, an explicit hostname and argument arrays; preserves pagination', async () => {
  reply('HTTP/2.0 200 OK\r\nLink: <https://api.github.com/next>; rel="next"\r\n\r\n[]');
  const response = await ghFetch('https://api.github.com/repos/acme/app/dependabot/alerts?state=open&page=1');
  expect(response.status).toBe(200);
  expect(response.headers.get('link')).toContain('rel="next"');
  expect(await response.json()).toEqual([]);
  expect(execute.mock.calls[0]?.[0]).toBe('gh');
  expect(execute.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(['--hostname', 'github.com', '--method', 'GET', '--include']));
  expect(execute.mock.calls[0]?.[2]).not.toHaveProperty('shell');
});

test.each([
  'https://evil.example/repos/acme/app/dependabot/alerts',
  'https://api.github.com/repos/acme/app/issues',
  'https://user:password@api.github.com/repos/acme/app/dependabot/alerts',
])('refuses unsupported endpoint %s without execution', async url => {
  await expect(ghFetch(url)).rejects.toThrow(); expect(execute).not.toHaveBeenCalled();
});

test('HTTP failures survive gh nonzero exit while raw diagnostics do not', async () => {
  reply('HTTP/2.0 403 Forbidden\n\n{"message":"denied"}', new Error('raw secret-like text'));
  expect((await ghFetch('https://api.github.com/repos/acme/app/dependabot/alerts')).status).toBe(403);
  reply('', new Error('raw secret-like text'));
  await expect(ghFetch('https://api.github.com/repos/acme/app/dependabot/alerts')).rejects.toThrow('GitHub CLI unavailable');
});

test('does not execute for writes or an already cancelled operation', async () => {
  const url = 'https://api.github.com/repos/acme/app/dependabot/alerts';
  await expect(ghFetch(url, { method: 'PATCH' })).rejects.toThrow();
  const controller = new AbortController(); controller.abort();
  await expect(ghFetch(url, { signal: controller.signal })).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
});
