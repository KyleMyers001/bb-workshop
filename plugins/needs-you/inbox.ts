import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createStore } from "./store";
import { createDirectory } from "./directory";
import { reconcileKanban } from "./kanban";
import { CHANGED, effectiveStatus, sameCategory, type Change, type Item, type Raise,
  type Request, type View, type ViewInput } from "./model";

export function createInbox(bb: BbPluginApi) {
  const store = createStore(bb);
  const directory = createDirectory(bb);
  function changed() { directory.invalidate(); bb.realtime.publish(CHANGED, null); }

  async function view(input: ViewInput): Promise<View> {
    const snapshot = await directory.load(input.threadLimit, input.refresh, input.projectId);
    for (const threadId of snapshot.threads.keys()) {
      reconcileKanban(store, threadId, snapshot.metadata.get(threadId));
    }
    const now = Date.now();
    const requests = store.all().filter(request => {
      const thread = snapshot.threads.get(request.threadId);
      return thread && (!input.projectId || thread.projectId === input.projectId);
    }).map(request => ({ ...request, status: effectiveStatus(request, now) }));
    const reported = new Map<string, Request[]>();
    for (const request of requests) {
      if (request.source !== "kanban" && ["open", "snoozed"].includes(request.status)) {
        const group = reported.get(request.threadId) ?? [];
        group.push(request); reported.set(request.threadId, group);
      }
    }
    const items: Item[] = requests.filter(request => request.source !== "kanban" ||
      !reported.get(request.threadId)?.some(explicit => sameCategory(request, explicit)))
      .map(request => {
        const thread = snapshot.threads.get(request.threadId)!;
        return { ...request, projectId: thread.projectId,
          projectName: snapshot.projects.get(thread.projectId) ?? thread.projectId,
          threadTitle: thread.title || thread.titleFallback || "Untitled thread" };
      });
    const needle = input.search.toLocaleLowerCase();
    const matching = items.filter(item => {
      const statusMatches = input.filter === "history" ? ["handled", "withdrawn"].includes(item.status)
        : input.filter === "snoozed" ? item.status === "snoozed"
        : item.status === "open" && (input.filter === "open" || item.kind === input.filter);
      return statusMatches && `${item.title} ${item.ask} ${item.threadTitle} ${item.projectName}`
        .toLocaleLowerCase().includes(needle);
    }).sort((a, b) => Number(a.kind === "review") - Number(b.kind === "review") ||
      a.raisedAt - b.raisedAt || a.id.localeCompare(b.id));
    return {
      items: matching.slice(input.offset, input.offset + 100),
      matching: matching.length, hasMore: matching.length > input.offset + 100,
      open: items.filter(item => item.status === "open").length,
      snoozed: items.filter(item => item.status === "snoozed").length,
      history: items.filter(item => ["handled", "withdrawn"].includes(item.status)).length,
      loadedThreads: snapshot.threads.size, limited: snapshot.limited,
      checkedAt: snapshot.checkedAt,
    };
  }

  async function report(threadId: string, projectId: string, input: Raise, source: "agent" | "cli") {
    await directory.getVisible(threadId, projectId);
    const { key, ...body } = input;
    const request = store.report(threadId, key, body, source);
    changed();
    return { id: request.id, key, status: request.status, version: request.version };
  }
  async function withdraw(threadId: string, projectId: string, key: string, source: "agent" | "cli") {
    await directory.getVisible(threadId, projectId);
    const request = store.withdraw(threadId, key, source);
    changed();
    return { id: request?.id ?? null, key, status: "withdrawn" as const };
  }
  async function change(input: Change) {
    const request = store.get(input.id);
    if (!request) throw new Error("Request no longer exists. Refresh the inbox.");
    await directory.getVisible(request.threadId);
    reconcileKanban(store, request.threadId, await directory.metadataFor(request.threadId));
    const result = store.change(input);
    changed();
    return { id: result.id };
  }
  // Reads reconcile persisted fallback revisions. Serialize them with mutations so
  // a slower, older scan cannot overwrite a newer ask or undo a handled receipt.
  let queue = Promise.resolve();
  function exclusive<T>(run: () => Promise<T>): Promise<T> {
    const result = queue.then(run);
    queue = result.then(() => {}, () => {});
    return result;
  }
  return {
    view: (input: ViewInput) => exclusive(() => view(input)),
    report: (...args: Parameters<typeof report>) => exclusive(() => report(...args)),
    withdraw: (...args: Parameters<typeof withdraw>) => exclusive(() => withdraw(...args)),
    change: (input: Change) => exclusive(() => change(input)),
    invalidate: changed,
  };
}
export type Inbox = ReturnType<typeof createInbox>;
