import { z } from 'zod';
import { bucketMerges } from './history.ts';
import { ghFetch, CLI_SETUP_MESSAGE } from './gh-api.ts';
import { emptyPerson, type Person, type VelocityConfig } from './velocity-model.ts';

const count = z.number().int().nonnegative();
const countSchema = z.object({ issueCount: count });
const mergedSchema = z.object({
  issueCount: count,
  nodes: z.array(z.object({ createdAt: z.string().datetime(), mergedAt: z.string().datetime() })),
  pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
});
const collectionSchema = z.object({
  totalPullRequestReviewContributions: count,
  totalRepositoriesWithContributedPullRequestReviews: count,
  pullRequestReviewContributionsByRepository: z.array(z.object({
    repository: z.object({ nameWithOwner: z.string() }),
    contributions: z.object({ totalCount: count }),
  })),
});
const responseSchema = z.object({
  user: z.object({ contributionsCollection: collectionSchema }).nullable(),
  opened: countSchema, open: countSchema, previous: countSchema, merged: mergedSchema,
});
const mergedFields = `issueCount nodes { ... on PullRequest { createdAt mergedAt } }
  pageInfo { hasNextPage endCursor }`;
const query = `query Velocity($login:String!, $from:DateTime!, $to:DateTime!,
  $opened:String!, $open:String!, $previous:String!, $merged:String!) {
  user(login:$login) { contributionsCollection(from:$from, to:$to) {
    totalPullRequestReviewContributions totalRepositoriesWithContributedPullRequestReviews
    pullRequestReviewContributionsByRepository(maxRepositories:100) {
      repository { nameWithOwner } contributions(first:1) { totalCount }
    }
  } }
  opened:search(query:$opened, type:ISSUE, first:1) { issueCount }
  open:search(query:$open, type:ISSUE, first:1) { issueCount }
  previous:search(query:$previous, type:ISSUE, first:1) { issueCount }
  merged:search(query:$merged, type:ISSUE, first:100) { ${mergedFields} }
}`;
const pageQuery = `query Merged($merged:String!, $cursor:String!) {
  merged:search(query:$merged, type:ISSUE, first:100, after:$cursor) { ${mergedFields} }
}`;
const metric = (value: number | null, error: string | null = null) => ({ value, error });

export async function collectVelocity(
  config: VelocityConfig, signal: AbortSignal, fetcher = config.token ? fetch : ghFetch, now = new Date(),
): Promise<Person[]> {
  const iso = (date: number) => new Date(date).toISOString().replace('.000Z', 'Z');
  const end = Math.floor(now.getTime() / 1000) * 1000;
  const start = end - config.days * 86_400_000;
  const range = `${iso(start)}..${iso(end - 1000)}`;
  const previous = `${iso(start - config.days * 86_400_000)}..${iso(start - 1000)}`;
  const scope = config.repositories.map(repo => `repo:${repo}`).join(' ');
  async function request(document: string, variables: Record<string, string>) {
    const response = await fetcher('https://api.github.com/graphql', {
      method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json',
        'User-Agent': 'bb-delivery-dashboard' },
      body: JSON.stringify({ query: document, variables }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok) throw new Error('request failed');
    const envelope = z.object({ errors: z.array(z.unknown()).optional(), data: z.unknown() }).parse(await response.json());
    if (envelope.errors?.length) throw new Error('query failed');
    return envelope.data;
  }
  async function person(username: string): Promise<Person> {
    try {
      const base = `is:pr author:${username} ${scope}`;
      const merged = `${base} is:merged merged:${range}`;
      const data = responseSchema.parse(await request(query, {
        login: username, from: iso(start), to: iso(end - 1000),
        opened: `${base} created:${range}`, open: `${base} is:open`,
        previous: `${base} is:merged merged:${previous}`, merged,
      }));
      if (!data.user) return emptyPerson(username, 'GitHub user not found or unavailable to this account.');
      const result: Person = {
        username, opened: metric(data.opened.issueCount), open: metric(data.open.issueCount),
        merged: metric(data.merged.issueCount), previousMerged: metric(data.previous.issueCount),
        medianMergeHours: metric(null), reviewedPrs: metric(null), history: null, historyError: null,
      };
      const collection = data.user.contributionsCollection;
      if (!config.repositories.length) result.reviewedPrs = metric(collection.totalPullRequestReviewContributions);
      else if (collection.totalRepositoriesWithContributedPullRequestReviews > 100) {
        result.reviewedPrs = metric(null, 'Review repository limit reached; shorten the window.');
      } else {
        const allowed = new Set(config.repositories.map(repo => repo.toLowerCase()));
        result.reviewedPrs = metric(collection.pullRequestReviewContributionsByRepository
          .filter(group => allowed.has(group.repository.nameWithOwner.toLowerCase()))
          .reduce((sum, group) => sum + group.contributions.totalCount, 0));
      }
      try {
        let requests = 0;
        const searchRange = (from: number, to: number) =>
          `${base} is:merged merged:${iso(from)}..${iso(to - 1000)}`;
        async function readPage(search: string, cursor?: string) {
          if (++requests > 64) throw new Error('history request limit');
          if (cursor) return z.object({ merged: mergedSchema }).parse(await request(pageQuery,
            { merged: search, cursor })).merged;
          // The same fields and validation apply to the first page of a split window.
          const first = `query History($merged:String!) {
            merged:search(query:$merged, type:ISSUE, first:100) { ${mergedFields} }
          }`;
          return z.object({ merged: mergedSchema }).parse(await request(first, { merged: search })).merged;
        }
        async function history(from: number, to: number, first: z.infer<typeof mergedSchema>): Promise<z.infer<typeof mergedSchema>['nodes']> {
          if (first.issueCount > 1000) {
            if (to - from <= 1000) throw new Error('history density limit');
            const middle = Math.floor((from + to) / 2000) * 1000;
            if (middle <= from || middle >= to) throw new Error('history density limit');
            const left = await history(from, middle, await readPage(searchRange(from, middle)));
            const right = await history(middle, to, await readPage(searchRange(middle, to)));
            if (left.length + right.length !== first.issueCount) throw new Error('history changed during scan');
            return [...left, ...right];
          }
          const nodes = [...first.nodes];
          let page = first;
          for (let index = 1; page.pageInfo.hasNextPage && index < 10; index++) {
            if (!page.pageInfo.endCursor) throw new Error('missing cursor');
            page = await readPage(searchRange(from, to), page.pageInfo.endCursor);
            nodes.push(...page.nodes);
          }
          if (page.pageInfo.hasNextPage || nodes.length !== first.issueCount) throw new Error('incomplete scan');
          return nodes;
        }
        const nodes = await history(start, end, data.merged);
        if (nodes.some(pr => Date.parse(pr.mergedAt) < start || Date.parse(pr.mergedAt) >= end)) {
          throw new Error('merge outside requested window');
        }
        result.history = bucketMerges(nodes.map(pr => pr.mergedAt), start, end, config.days);
        const hours = nodes.map(pr => (Date.parse(pr.mergedAt) - Date.parse(pr.createdAt)) / 3_600_000)
          .sort((a, b) => a - b);
        if (hours.some(value => value < 0)) throw new Error('invalid time range');
        const middle = Math.floor(hours.length / 2);
        result.medianMergeHours = metric(!hours.length ? null : hours.length % 2
          ? hours[middle] : (hours[middle - 1] + hours[middle]) / 2);
      } catch (cause) {
        if (signal.aborted) throw cause;
        result.history = null;
        result.historyError = 'Could not collect complete history within the scan limit. Try a shorter span or refresh.';
        result.medianMergeHours = metric(null, result.historyError);
      }
      return result;
    } catch (cause) {
      if (signal.aborted) throw cause;
      return emptyPerson(username, config.token
        ? 'Could not load GitHub metrics. Check username, token access, and rate limits.'
        : CLI_SETUP_MESSAGE);
    }
  }
  const people: Person[] = [];
  for (let index = 0; index < config.usernames.length; index += 2) {
    people.push(...await Promise.all(config.usernames.slice(index, index + 2).map(person)));
  }
  return people;
}
