import { z } from 'zod';
import { ghFetch } from './gh-api.ts';
import type { GitHubConfig, Metric } from './model.ts';

const deploymentSchema = z.object({ id: z.number().int(), created_at: z.string().datetime() });
const runSchema = z.object({ status: z.string(), conclusion: z.string().nullable() });
const statusSchema = z.object({ state: z.string() });

export async function collectMetrics(
  config: GitHubConfig, signal: AbortSignal, fetcher = config.token ? fetch : ghFetch, now = new Date(),
) {
  const since = new Date(now.getTime() - config.days * 86_400_000).toISOString();
  const root = `https://api.github.com/repos/${config.repository}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'bb-delivery-dashboard',
  };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;

  async function page(path: string, query: URLSearchParams, index: number) {
    query.set('per_page', '100');
    query.set('page', String(index));
    const response = await fetcher(`${root}${path}?${query}`, {
      headers, signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      redirect: 'error',
    });
    if (!response.ok) {
      const hint = response.status === 401 || response.status === 403
        ? 'Check token permissions or GitHub rate limits.'
        : response.status === 404 ? 'Check the repository and token access.' : 'Try again later.';
      throw new Error(`GitHub returned ${response.status}. ${hint}`);
    }
    return response.json() as Promise<unknown>;
  }
  async function list<T>(path: string, query: URLSearchParams, schema: z.ZodType<T>, field?: string) {
    const items: T[] = [];
    for (let index = 1; index <= 10; index++) {
      const body = await page(path, query, index);
      const raw = field ? z.record(z.string(), z.unknown()).parse(body)[field] : body;
      const batch = z.array(schema).parse(raw);
      items.push(...batch);
      if (batch.length < 100) return items;
    }
    throw new Error('GitHub scan limit reached; use a shorter lookback window.');
  }
  async function measure(read: () => Promise<number | null>): Promise<Metric> {
    try { return { value: await read(), error: null }; }
    catch (cause) {
      if (signal.aborted) throw cause;
      // Never return upstream bodies, request headers, or validator payloads.
      const message = cause instanceof Error && cause.message.startsWith('GitHub ')
        ? cause.message : 'Could not read GitHub data. Check your connection and retry.';
      return { value: null, error: message };
    }
  }
  const [openPrs, ciPassRate, deployments] = await Promise.all([
    measure(async () => (await list('/pulls', new URLSearchParams({ state: 'open' }),
      z.object({ id: z.number() }))).length),
    measure(async () => {
      const runs = await list('/actions/runs', new URLSearchParams({
        status: 'completed', created: `${since}..${now.toISOString()}`,
      }), runSchema, 'workflow_runs');
      const completed = runs.filter(run => run.status === 'completed');
      return completed.length ? 100 * completed.filter(run => run.conclusion === 'success').length / completed.length : null;
    }),
    measure(async () => {
      // Deployment lists have no date filter; stop at the first older page.
      const recent: z.infer<typeof deploymentSchema>[] = [];
      for (let index = 1; index <= 10; index++) {
        const batch = z.array(deploymentSchema).parse(await page('/deployments',
          new URLSearchParams({ environment: config.environment }), index));
        recent.push(...batch.filter(item => item.created_at >= since && item.created_at <= now.toISOString()));
        if (batch.length < 100 || batch.some(item => item.created_at < since)) break;
        if (index === 10) throw new Error('GitHub deployment scan limit reached; shorten the lookback window.');
      }
      if (recent.length > 200) throw new Error('GitHub deployment scan limit reached (200); shorten the lookback window.');
      let successful = 0;
      // Bounded concurrency avoids a burst of hundreds of status requests.
      for (let start = 0; start < recent.length; start += 5) {
        const results = await Promise.all(recent.slice(start, start + 5).map(async deployment => {
          const statuses = await list(`/deployments/${deployment.id}/statuses`, new URLSearchParams(), statusSchema);
          return statuses.some(status => status.state === 'success');
        }));
        successful += results.filter(Boolean).length;
      }
      return successful;
    }),
  ]);
  return { deployments, openPrs, ciPassRate };
}
