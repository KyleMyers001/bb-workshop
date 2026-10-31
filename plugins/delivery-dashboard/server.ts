import { setTimeout as delay } from 'node:timers/promises';
import { defineRpcContract, type BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { repositorySchema, snapshotSchema, type Snapshot } from './model';
import { collectMetrics } from './github';
import { collectVelocity } from './velocity';
import { emptyPerson, parseList, usernamesSchema, repositoriesSchema } from './velocity-model';

export const rpcContract = defineRpcContract({
  status: { input: z.null(), output: snapshotSchema },
  refresh: { input: z.null(), output: snapshotSchema },
  view: { input: z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(180), z.literal(365)]) }).strict(), output: snapshotSchema },
  refreshView: { input: z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(180), z.literal(365)]) }).strict(), output: snapshotSchema },
});

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    usernames: {
      type: 'string', label: 'People (GitHub usernames)', default: 'KyleMyers001',
      experimental_multiline: true, experimental_schema: usernamesSchema,
    },
    comparisonRepositories: {
      type: 'string', label: 'Personal metric repositories (blank = all visible repositories)', default: '',
      experimental_multiline: true, experimental_schema: repositoriesSchema,
    },
    repository: {
      type: 'string', label: 'Optional repository context (owner/repository)', default: '',
      experimental_schema: z.union([z.literal(''), repositorySchema]),
    },
    token: { type: 'string', label: 'Optional GitHub token override (default: gh CLI login)', secret: true },
    environment: {
      type: 'string', label: 'Deployment environment', default: 'production',
      experimental_schema: z.string().min(1).max(100).refine(value => value.trim().length > 0, 'Enter an environment name'),
    },
    days: {
      type: 'number', label: 'Lookback window (days)', default: 7,
      experimental_schema: z.number().int().min(1).max(365),
    },
    refreshSeconds: {
      type: 'number', label: 'Refresh interval (seconds)', default: 300,
      experimental_schema: z.number().int().min(60).max(3600),
    },
  });
  let config = await settings.get();
  let controller = new AbortController();
  type Entry = { snapshot: Snapshot; nextRefresh: number; pending: Promise<Snapshot> | null };
  const entries = new Map<number, Entry>();
  function empty(days: number): Snapshot {
    const unavailable = { value: null, error: null };
    return {
      repository: config.repository.trim(), environment: config.environment.trim(),
      days, refreshSeconds: config.refreshSeconds, updatedAt: null,
      people: parseList(config.usernames).map(username => emptyPerson(username)),
      repositories: parseList(config.comparisonRepositories),
      deployments: unavailable, openPrs: unavailable, ciPassRate: unavailable,
    };
  }
  function entry(days: number): Entry {
    let result = entries.get(days);
    if (!result) {
      result = { snapshot: empty(days), nextRefresh: 0, pending: null };
      entries.set(days, result);
    }
    return result;
  }
  entry(config.days);
  function refresh(days = config.days): Promise<Snapshot> {
    const target = entry(days);
    if (target.pending) return target.pending;
    const current = controller;
    const read = { ...config, days, repository: config.repository.trim(),
      environment: config.environment.trim(), token: config.token ?? '' };
    const work = Promise.all([
      read.repository ? collectMetrics(read, current.signal) : Promise.resolve({}),
      collectVelocity({ usernames: parseList(read.usernames),
        repositories: parseList(read.comparisonRepositories), days, token: read.token }, current.signal),
    ]).then(([metrics, people]) => {
      if (!current.signal.aborted) {
        target.snapshot = { ...empty(days), ...metrics, people, updatedAt: new Date().toISOString() };
        target.nextRefresh = Date.now() + config.refreshSeconds * 1000;
        bb.realtime.publish('metrics-changed', null);
      }
      return current.signal.aborted ? entry(days).snapshot : target.snapshot;
    }).catch(cause => {
      if (current.signal.aborted) return entry(days).snapshot;
      throw cause;
    }).finally(() => { if (target.pending === work) target.pending = null; });
    target.pending = work;
    return work;
  }
  settings.onChange(next => {
    controller.abort();
    controller = new AbortController();
    config = next;
    entries.clear();
    entry(config.days);
    bb.realtime.publish('metrics-changed', null);
  });
  bb.onDispose(() => controller.abort());
  bb.rpc.register(rpcContract, {
    status: () => entry(config.days).snapshot,
    refresh: () => refresh(),
    view: ({ days }) => Date.now() >= entry(days).nextRefresh ? refresh(days) : entry(days).snapshot,
    refreshView: ({ days }) => refresh(days),
  });
  bb.background.service('refresh-metrics', {
    async start(signal) {
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      try {
        while (!signal.aborted) {
          for (const [days, target] of entries) {
            if (signal.aborted) break;
            if (Date.now() >= target.nextRefresh) await refresh(days);
          }
          await delay(1000, undefined, { signal });
        }
      } catch (cause) {
        if (!signal.aborted) throw cause;
      } finally {
        signal.removeEventListener('abort', abort);
      }
    },
  });
}
