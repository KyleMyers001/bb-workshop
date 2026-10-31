import { expect, test, vi } from 'vitest';
import { collectRepository } from '../collector';
import { parseRepositories } from '../model';

export const finding = {
  number: 20, state: 'open', created_at: '2026-10-01T00:00:00Z',
  dependency: { package: { name: 'glib', ecosystem: 'rust' }, manifest_path: 'Cargo.lock', scope: 'runtime' },
  security_advisory: { summary: 'Unsound iterator', ghsa_id: 'GHSA-test-abcd-1234' },
  security_vulnerability: { severity: 'medium', vulnerable_version_range: '< 0.20.0', first_patched_version: { identifier: '0.20.0' } },
};

test('watch scope is explicit, normalized, deduplicated, and bounded', () => {
  expect(parseRepositories('Acme/App, acme/app\nacme/api')).toEqual(['Acme/App', 'acme/api']);
  expect(parseRepositories('')).toEqual([]);
  for (const bad of ['acme/..', '../escape', 'https://github.com/acme/app', 'acme/app?x=1', '-evil/app']) {
    expect(() => parseRepositories(bad)).toThrow();
  }
  expect(() => parseRepositories(Array.from({ length: 51 }, (_, i) => `acme/repo${i}`).join('\n'))).toThrow();
});

test('normalizes alert facts and constructs trusted GitHub links', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json([{ ...finding, html_url: 'javascript:evil()' }]));
  const result = await collectRepository('acme/app', fetcher, new AbortController().signal);
  expect(result.status).toBe('readable');
  expect(result.alerts[0]).toMatchObject({ number: 20, package: 'glib', patchedVersion: '0.20.0',
    url: 'https://github.com/acme/app/security/dependabot/20', severity: 'medium' });
  expect(String(fetcher.mock.calls[0]?.[0])).toContain('/repos/acme/app/dependabot/alerts?');
  expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.has('page')).toBe(false);
});

test('paginates and marks capped collections as limited, never complete', async () => {
  const fetcher = vi.fn(async () => Response.json([finding], { headers: { link: '<https://api.github.com/repos/acme/app/dependabot/alerts?after=cursor1>; rel="next"' } }));
  const result = await collectRepository('acme/app', fetcher, new AbortController().signal, 2);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(result.status).toBe('limited');
  expect(result.alerts).toHaveLength(1); // Deduplicate stable repository/alert identifiers.
});

test.each([401, 403, 404, 429, 500])('HTTP %s is unavailable, not a clean repository', async status => {
  const result = await collectRepository('acme/app', async () => new Response('sensitive upstream body', { status }), new AbortController().signal);
  expect(result.status).toBe('unavailable');
  expect(result.error).toBeTruthy();
  expect(result.error).not.toContain('sensitive');
  expect(result.alerts).toEqual([]);
});

test('malformed or non-open findings cannot masquerade as a successful scan', async () => {
  for (const body of [{ unexpected: true }, [{ ...finding, state: 'fixed' }], [{ ...finding, number: -2 }]]) {
    const result = await collectRepository('acme/app', async () => Response.json(body), new AbortController().signal);
    expect(result.status).toBe('unavailable');
  }
});

test('an incomplete later page discards the count and reports unavailability', async () => {
  let calls = 0;
  const result = await collectRepository('acme/app', async () => ++calls === 1
    ? Response.json([finding], { headers: { link: '<https://api.github.com/repos/acme/app/dependabot/alerts?after=cursor1>; rel="next"' } })
    : new Response('', { status: 403 }), new AbortController().signal);
  expect(result.status).toBe('unavailable');
  expect(result.alerts).toEqual([]);
});

test('follows cursor pagination only and rejects untrusted pagination destinations', async () => {
  const fetcher = vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input));
    expect(url.searchParams.has('page')).toBe(false);
    return url.searchParams.has('after') ? Response.json([{ ...finding, number: 21 }])
      : Response.json([finding], { headers: { link: '<https://api.github.com/repos/acme/app/dependabot/alerts?after=cursor1>; rel="next"' } });
  });
  const result = await collectRepository('acme/app', fetcher, new AbortController().signal);
  expect(result.status).toBe('readable');
  expect(result.alerts).toHaveLength(2);
  expect(new URL(String(fetcher.mock.calls[1]?.[0])).searchParams.get('after')).toBe('cursor1');
  const unsafe = await collectRepository('acme/app', async () => Response.json([finding], {
    headers: { link: '<https://evil.example/repos/acme/app/dependabot/alerts?after=x>; rel="next"' },
  }), new AbortController().signal);
  expect(unsafe.status).toBe('unavailable');
});

test('cancellation propagates instead of being mislabeled as an access problem', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(collectRepository('acme/app', vi.fn(), controller.signal)).rejects.toThrow();
});
