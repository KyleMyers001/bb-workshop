import { defineRpcContract, type BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { collectWatchList } from './collector';
import { ghFetch } from './gh-api';
import { emptySnapshot, parseRepositories, snapshotSchema, watchListSchema, workSchema, type Snapshot, type Work } from './model';

export const rpcContract = defineRpcContract({
  view: { input: z.null(), output: snapshotSchema },
  refresh: { input: z.null(), output: snapshotSchema },
  saveWatchList: {
    input: z.object({ watchList: watchListSchema, expectedWatchList: z.string().max(10_000) }).strict(),
    output: snapshotSchema,
  },
  saveWork: {
    input: z.object({ key: z.string().max(200), work: workSchema.nullable() }).strict(),
    output: snapshotSchema,
  },
});

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    repositories: { type: 'string', label: 'Watched GitHub repositories (owner/repository)',
      default: '', experimental_multiline: true, experimental_schema: watchListSchema },
  });
  let { repositories: watchList } = await settings.get();
  let snapshot = emptySnapshot(watchList);
  let controller = new AbortController();
  let pending: Promise<Snapshot> | null = null;
  let nextRefresh = 0;
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    'CREATE TABLE work_links (alert_key TEXT PRIMARY KEY, work_json TEXT NOT NULL)',
  ]);
  const readWork = db.prepare('SELECT alert_key, work_json FROM work_links');
  const writeWork = db.prepare('INSERT INTO work_links (alert_key, work_json) VALUES (?, ?) ON CONFLICT(alert_key) DO UPDATE SET work_json = excluded.work_json');
  function decorate(): Snapshot {
    const work = new Map((readWork.all() as { alert_key: string; work_json: string }[])
      .map(row => [row.alert_key, z.nullable(workSchema).parse(JSON.parse(row.work_json))]));
    return { ...snapshot, repositories: snapshot.repositories.map(repo => ({ ...repo,
      alerts: repo.alerts.map(alert => ({ ...alert, work: work.get(alert.key) ?? null })) })) };
  }
  function refresh(force = false): Promise<Snapshot> {
    if (pending) return pending;
    if (!force && Date.now() < nextRefresh) return Promise.resolve(decorate());
    if (!snapshot.repositories.length) return Promise.resolve(decorate());
    const current = controller;
    const work = collectWatchList(parseRepositories(watchList), ghFetch, current.signal)
      .then(repositories => {
        if (current.signal.aborted) return snapshot;
        snapshot = { ...emptySnapshot(watchList), repositories, updatedAt: new Date().toISOString() };
        nextRefresh = Date.now() + 300_000;
        bb.realtime.publish('security-changed', null);
        return decorate();
      }).catch(cause => {
        if (current.signal.aborted) return snapshot;
        throw cause;
      }).finally(() => { if (pending === work) pending = null; });
    pending = work;
    return work;
  }
  settings.onChange(next => {
    controller.abort(); controller = new AbortController(); pending = null;
    watchList = next.repositories; snapshot = emptySnapshot(watchList); nextRefresh = 0;
    bb.realtime.publish('security-changed', null);
  });
  bb.onDispose(() => controller.abort());
  bb.rpc.register(rpcContract, {
    view: () => refresh(),
    refresh: () => refresh(true),
    saveWatchList: async input => {
      if (input.expectedWatchList !== watchList) throw new Error('Watch list changed elsewhere. Reload before saving.');
      // Persist only explicit names. Never discover repositories from teams or BB projects.
      const normalized = parseRepositories(input.watchList).join('\n');
      await settings.experimental_set({ repositories: normalized });
      return decorate();
    },
    saveWork: ({ key, work }: { key: string; work: Work | null }) => {
      if (!snapshot.repositories.some(repo => repo.alerts.some(alert => alert.key === key))) {
        throw new Error('Alert is no longer in the current readable watch list. Refresh first.');
      }
      writeWork.run(key, JSON.stringify(work));
      bb.realtime.publish('security-changed', null);
      return decorate();
    },
  });
}
