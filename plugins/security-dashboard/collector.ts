import { z } from 'zod';
import { repositorySchema, type Alert, type RepositorySnapshot } from './model';

const sourceAlert = z.object({
  number: z.number().int().positive(), state: z.literal('open'), created_at: z.iso.datetime(),
  dependency: z.object({
    package: z.object({ name: z.string().min(1).max(500), ecosystem: z.string().max(100) }),
    manifest_path: z.string().max(1000), scope: z.string().nullable().optional(),
  }),
  security_advisory: z.object({ summary: z.string().max(1024) }),
  security_vulnerability: z.object({
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    vulnerable_version_range: z.string().max(1000),
    first_patched_version: z.object({ identifier: z.string().max(200) }).nullable(),
  }),
});

function normalize(repository: string, source: z.infer<typeof sourceAlert>): Alert {
  const { dependency, security_vulnerability: vulnerability } = source;
  return {
    key: `${repository.toLowerCase()}#${source.number}`, number: source.number, repository,
    package: dependency.package.name, ecosystem: dependency.package.ecosystem,
    manifest: dependency.manifest_path,
    scope: dependency.scope === 'runtime' || dependency.scope === 'development' ? dependency.scope : 'unknown',
    severity: vulnerability.severity, summary: source.security_advisory.summary,
    vulnerableRange: vulnerability.vulnerable_version_range,
    patchedVersion: vulnerability.first_patched_version?.identifier ?? null,
    createdAt: source.created_at,
    // Never trust an upstream URL or pagination destination as an executable link.
    url: `https://github.com/${repository}/security/dependabot/${source.number}`, work: null,
  };
}

export async function collectRepository(
  repository: string, fetcher: typeof fetch, signal: AbortSignal, maxPages = 2,
): Promise<RepositorySnapshot> {
  repositorySchema.parse(repository);
  signal.throwIfAborted();
  const base = { repository, checkedAt: new Date().toISOString() };
  try {
    const alerts = new Map<string, Alert>();
    let after: string | null = null;
    for (let page = 1; page <= maxPages; page++) {
      signal.throwIfAborted();
      const url = new URL(`https://api.github.com/repos/${repository}/dependabot/alerts`);
      url.searchParams.set('state', 'open');
      url.searchParams.set('per_page', '100');
      if (after) url.searchParams.set('after', after);
      const response = await fetcher(url.href, { signal });
      if (!response.ok) {
        const error = response.status === 401 ? 'GitHub authentication failed. Run gh auth login on the BB server.'
          : response.status === 403 || response.status === 404 ? 'Alerts unavailable. Check repository access, Dependabot enablement, token permissions, and API rate limits.'
          : response.status === 429 ? 'GitHub rate limit reached. Try again later.'
          : 'GitHub request failed. Try refreshing later.';
        return { ...base, status: 'unavailable', error, alerts: [] };
      }
      const sources = z.array(sourceAlert).max(100).parse(await response.json());
      for (const source of sources) {
        const alert = normalize(repository, source);
        alerts.set(alert.key, alert);
      }
      const link = response.headers.get('link') ?? '';
      const next = /<([^>]+)>;\s*rel="next"/.exec(link);
      if (!next) {
        if (/rel="next"/.test(link)) throw new Error('Invalid pagination');
        return { ...base, status: 'readable', error: null, alerts: [...alerts.values()] };
      }
      const destination = new URL(next[1]!);
      after = destination.searchParams.get('after');
      if (destination.origin !== url.origin || destination.pathname !== url.pathname ||
          destination.username || destination.password || !after || after.length > 2048) {
        throw new Error('Invalid pagination');
      }
      // Read only the cursor, never follow an upstream-controlled destination.
    }
    return { ...base, status: 'limited', error: 'Showing at most 200 open alerts. Open GitHub for the full list.', alerts: [...alerts.values()] };
  } catch {
    signal.throwIfAborted();
    return { ...base, status: 'unavailable', error: 'Cannot read alerts. Check gh installation/login on the BB server, connectivity, and GitHub permissions; then retry.', alerts: [] };
  }
}

export async function collectWatchList(repositories: string[], fetcher: typeof fetch, signal: AbortSignal) {
  const results: RepositorySnapshot[] = new Array(repositories.length);
  let next = 0;
  // Bound CLI subprocess concurrency; pages for a repository are always serial.
  await Promise.all(Array.from({ length: Math.min(4, repositories.length) }, async () => {
    while (next < repositories.length) {
      const index = next++;
      results[index] = await collectRepository(repositories[index]!, fetcher, signal);
    }
  }));
  return results;
}
