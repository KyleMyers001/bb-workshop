import type { BbPluginApi } from "@get-bb/plugin-sdk";

type Thread = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["list"]>>[number];
export function visible(thread: Pick<Thread, "archivedAt" | "deletedAt" | "visibility">) {
  return thread.archivedAt === null && thread.deletedAt === null && thread.visibility !== "hidden";
}

export function createDirectory(bb: BbPluginApi) {
  type Snapshot = { threads: Map<string, Thread>; metadata: Map<string, unknown>;
    projects: Map<string, string>; limited: boolean; checkedAt: number };
  let cache: { key: string; value: Snapshot } | null = null;
  let pending: { key: string; promise: Promise<Snapshot> } | null = null;
  let generation = 0;
  function invalidate() { generation++; cache = null; pending = null; }

  async function load(limit: number, refresh = false, projectId?: string): Promise<Snapshot> {
    if (refresh) invalidate();
    const key = `${projectId ?? "all"}:${limit}`;
    if (cache?.key === key && Date.now() - cache.value.checkedAt < 5000) return cache.value;
    if (pending?.key === key) return pending.promise;
    const requestGeneration = generation;
    const promise = (async () => {
      const threads = new Map<string, Thread>();
      const metadata = new Map<string, unknown>();
      const projects = new Map((await bb.sdk.projects.list({ includePersonal: true }))
        .map(project => [project.id, project.name]));
      let limited = false;
      for (let offset = 0; offset < limit; offset += 200) {
        const rows = await bb.sdk.threads.list({ archived: false, includeHidden: false,
          ...(projectId ? { projectId } : {}), offset, limit: 201 });
        const batch = rows.slice(0, 200).filter(visible);
        batch.forEach(thread => threads.set(thread.id, thread));
        if (batch.length) {
          const result = await bb.sdk.threads.experimental_listPluginMetadata({
            pluginId: "kanban", threadIds: batch.map(thread => thread.id),
          });
          result.threads.forEach(row => metadata.set(row.threadId, row.metadata));
        }
        limited = rows.length > 200;
        if (!limited) break;
      }
      return { threads, metadata, projects, limited, checkedAt: Date.now() };
    })();
    pending = { key, promise };
    try {
      const value = await promise;
      if (generation !== requestGeneration) throw new Error("Threads changed while reading. Refresh the inbox.");
      cache = { key, value };
      return value;
    } finally { if (pending?.promise === promise) pending = null; }
  }

  async function getVisible(threadId: string, projectId?: string) {
    const thread = await bb.sdk.threads.get({ threadId });
    if (!visible(thread) || (projectId && thread.projectId !== projectId)) {
      throw new Error("Choose a visible, unarchived thread in this project.");
    }
    return thread;
  }
  async function metadataFor(threadId: string) {
    const result = await bb.sdk.threads.experimental_listPluginMetadata({ pluginId: "kanban", threadIds: [threadId] });
    return result.threads.find(row => row.threadId === threadId)?.metadata;
  }
  return { load, invalidate, getVisible, metadataFor };
}
