import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakePluginHost, experimental_scanPublicSdkOnly,
  makePluginAgentConfigurationContext, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "../server";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { vi.useRealTimers(); await Promise.all(cleanups.splice(0).map(fn => fn())); });
const ask = { key: "refresh-scope", kind: "question", title: "Choose refresh scope", ask: "Panel-open only?" };
const context = { threadId: "thr_one", projectId: "proj_one", signal: new AbortController().signal };

async function setup() {
  const thread = makeThreadResponse({ id: "thr_one", projectId: "proj_one" });
  let rows = [thread];
  const metadata = new Map<string, Record<string, unknown>>();
  const { bb, harness } = createFakePluginHost({ pluginId: "needs-you",
    agentSkillIds: ["needs-you-inbox"], sdk: {
      projects: { list: async () => [{ id: "proj_one", name: "Workshop" }, { id: "proj_two", name: "Other" }] as any },
      threads: {
        get: async ({ threadId }: any) => { const found = rows.find(row => row.id === threadId); if (!found) throw new Error("Thread missing"); return found; },
        list: async ({ projectId, offset = 0, limit = 100 }: any) => rows.filter(row => !projectId || row.projectId === projectId).slice(offset, offset + limit),
        experimental_listPluginMetadata: async ({ threadIds }: any) => ({ threads: threadIds.filter((id: string) => metadata.has(id)).map((threadId: string) => ({ threadId, metadata: metadata.get(threadId) as any })) }),
      },
    },
  });
  cleanups.push(() => harness.lifecycle.dispose());
  plugin(bb);
  const view = (input = {}) => harness.behavior.callRpc("inbox_view", { ...input }) as Promise<any>;
  const raise = (input = ask, ctx = context) => harness.behavior.callAgentTool("needs_you_raise", input, ctx);
  const change = (item: any, action: string) => harness.behavior.callRpc("request_change", { id: item.id, version: item.version, action });
  return { harness, thread, metadata, view, raise, change, setRows: (next: typeof rows) => { rows = next; } };
}

describe("Needs You backend", () => {
  it("reports multiple specific asks and preserves handled state on identical retries", async () => {
    const { view, raise, change } = await setup();
    await raise();
    await raise({ ...ask, key: "install-permission", kind: "permission", ask: "May I install?" });
    let result = await view();
    expect(result.items).toHaveLength(2);
    const item = result.items.find((item: any) => item.key === ask.key);
    await change(item, "handle");
    await raise();
    result = await view();
    expect(result.open).toBe(1);
    expect((await view({ filter: "history" })).items).toMatchObject([{ key: ask.key, status: "handled" }]);
    await raise({ ...ask, ask: "Does the changed requirement need background monitoring?" });
    expect((await view()).open).toBe(2);
  });

  it("persists across reloads, expires snoozes, and never messages or moves a thread", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(1_000_000);
    const { harness, raise, view, change } = await setup();
    await raise();
    await change((await view()).items[0], "snooze");
    expect((await view()).open).toBe(0);
    expect((await view({ filter: "snoozed" })).snoozed).toBe(1);
    const replacement = await harness.lifecycle.reload(plugin);
    cleanups.push(() => replacement.harness.lifecycle.dispose());
    const restored = (input = {}) => replacement.harness.behavior.callRpc("inbox_view", input) as Promise<any>;
    expect((await restored({ filter: "snoozed" })).items).toHaveLength(1);
    vi.setSystemTime(4_600_001);
    expect((await restored()).items).toMatchObject([{ key: ask.key, status: "open" }]);
    for (const method of ["threads.send", "threads.updatePluginMetadata", "threads.stop", "threads.spawn"] as const) {
      expect(harness.inspection.sdk.callsTo(method)).toHaveLength(0);
    }
  });

  it("rejects stale actions instead of hiding an updated ask", async () => {
    const { view, raise, change } = await setup();
    await raise(); const old = (await view()).items[0];
    await raise({ ...ask, ask: "A materially different question" });
    await expect(change(old, "handle")).rejects.toThrow("changed");
    expect((await view()).open).toBe(1);
  });

  it("withdraws obsolete asks but does not convert withdrawal into approval", async () => {
    const { harness, raise, view } = await setup();
    await raise();
    await harness.behavior.callAgentTool("needs_you_withdraw", { key: ask.key }, context);
    expect((await view()).open).toBe(0);
    expect((await view({ filter: "history" })).items).toMatchObject([{ status: "withdrawn" }]);
    await raise(); expect((await view()).open).toBe(1);
    expect(harness.inspection.sdk.callsTo("threads.send")).toHaveLength(0);
  });

  it("deduplicates a generic board signal against an explicit blocking ask", async () => {
    const { metadata, view, raise, change } = await setup();
    metadata.set(context.threadId, { column: "blocked", note: "Need scope", movedAt: 10 });
    await raise();
    let result = await view();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].source).toBe("agent");
    await change(result.items[0], "handle");
    expect((await view()).open).toBe(0);
    metadata.set(context.threadId, { column: "blocked", note: "A new blocker", movedAt: 20 });
    result = await view({ refresh: true });
    expect(result.items).toMatchObject([{ source: "kanban", ask: "A new blocker" }]);
  });

  it("does not hide an independent review handoff behind an explicit question", async () => {
    const { metadata, view, raise } = await setup();
    metadata.set(context.threadId, { column: "review", note: "Inspect the diff", movedAt: 10 });
    await raise();
    expect((await view()).open).toBe(2);
    expect((await view({ filter: "review" })).items).toMatchObject([{ source: "kanban", kind: "review" }]);
    metadata.set(context.threadId, { column: "done" });
    expect((await view({ refresh: true })).open).toBe(1);
  });

  it("rechecks board revisions before handling a stale fallback", async () => {
    const { metadata, view, change } = await setup();
    metadata.set(context.threadId, { column: "review", note: "First", movedAt: 10 });
    const item = (await view()).items[0];
    metadata.set(context.threadId, { column: "review", note: "Second", movedAt: 20 });
    await expect(change(item, "handle")).rejects.toThrow("changed");
    expect((await view({ refresh: true })).items[0].ask).toBe("Second");
  });

  it("fails a partial metadata read instead of interpreting it as all clear", async () => {
    const { harness, view } = await setup();
    harness.inspection.sdk.stub("threads.experimental_listPluginMetadata", async () => { throw new Error("Metadata unavailable"); });
    await expect(view()).rejects.toThrow();
  });

  it("filters hidden, archived, deleted and other-project threads defensively", async () => {
    const { thread, setRows, view, metadata } = await setup();
    setRows([thread, { ...thread, id: "thr_hidden", visibility: "hidden" },
      { ...thread, id: "thr_archived", archivedAt: 1 }, { ...thread, id: "thr_deleted", deletedAt: 1 },
      { ...thread, id: "thr_other", projectId: "proj_two" }]);
    for (const id of [thread.id, "thr_hidden", "thr_archived", "thr_deleted", "thr_other"]) metadata.set(id, { column: "review" });
    expect((await view()).items).toHaveLength(2);
    expect((await view({ projectId: "proj_two" })).items).toMatchObject([{ threadId: "thr_other", projectName: "Other" }]);
  });

  it("refuses cross-project or invisible tool targets and spoofed thread parameters", async () => {
    const { thread, raise } = await setup();
    await expect(raise({ ...ask, threadId: "thr_other" } as any)).rejects.toThrow();
    await expect(raise(ask, { ...context, projectId: "proj_other" })).rejects.toThrow();
    thread.visibility = "hidden"; await expect(raise()).rejects.toThrow();
    thread.visibility = "visible"; thread.archivedAt = 1; await expect(raise()).rejects.toThrow();
  });

  it("bounds fields and rejects unknown input at each mutation boundary", async () => {
    const { raise, harness } = await setup();
    for (const invalid of [{ ...ask, title: "x".repeat(161) }, { ...ask, key: "../path" },
      { ...ask, ask: "" }, { ...ask, kind: "approve" }]) await expect(raise(invalid)).rejects.toThrow();
    await expect(harness.behavior.callRpc("request_change", { id: "x", version: 1, action: "approve" })).rejects.toThrow();
  });

  it("paginates requests and marks thread scan counts as lower bounds", async () => {
    const { thread, setRows, metadata, view, harness } = await setup();
    const rows = Array.from({ length: 203 }, (_, i) => ({ ...thread, id: `thr_${String(i).padStart(3, "0")}` }));
    setRows(rows); rows.forEach(row => metadata.set(row.id, { column: "review" }));
    const first = await view({ threadLimit: 200 });
    expect(first).toMatchObject({ open: 200, limited: true, loadedThreads: 200, hasMore: true });
    const second = await view({ threadLimit: 200, offset: 100 });
    expect(second.items).toHaveLength(100);
    const ids = new Set([...first.items, ...second.items].map((item: any) => item.id));
    expect(ids.size).toBe(200);
    const more = await view({ threadLimit: 400 });
    expect(more).toMatchObject({ open: 203, limited: false, loadedThreads: 203 });
    for (const [input] of harness.inspection.sdk.callsTo("threads.experimental_listPluginMetadata")) {
      expect((input as any).threadIds.length).toBeLessThanOrEqual(200);
    }
  });

  it("supports CLI context, shared stable keys, help, validation and pagination", async () => {
    const { harness, raise, view } = await setup();
    await raise();
    const raised = await harness.behavior.runCli(["raise", ask.key, "--kind", "question", "--title", ask.title, "--ask", ask.ask, "--json"], context);
    expect(raised.exitCode).toBe(0);
    expect((await view()).open).toBe(1);
    const listed = await harness.behavior.runCli(["list", "--all", "--json"]);
    expect(JSON.parse(listed.stdout!)).toMatchObject({ open: 1 });
    expect((await harness.behavior.runCli(["raise", "x", "--kind", "question", "--title", "T", "--ask", "Q"])).stderr).toContain("--thread");
    expect((await harness.behavior.runCli(["withdraw", ask.key, "--thread", context.threadId])).exitCode).toBe(0);
    expect((await view()).open).toBe(0);
    expect((await harness.behavior.runCli(["list", "--all", "--project", "proj_one"])).exitCode).not.toBe(0);
    expect((await harness.behavior.runCli(["list", "--threads", "201"])).exitCode).not.toBe(0);
    expect((await harness.behavior.runCli(["raise", "--help"])).exitCode).toBe(0);
    expect((await harness.behavior.runCli(["list", "--wat"])).exitCode).not.toBe(0);
  });

  it("does not infer requests from runtime idle or failure", async () => {
    const { harness, thread, view } = await setup();
    await harness.behavior.emitThreadEvent("thread.idle", { thread, lastAssistantText: "All done" });
    await harness.behavior.emitThreadEvent("thread.failed", { thread, error: "Untrusted raw error" });
    expect((await view()).items).toEqual([]);
    expect(harness.realtimeSignals.length).toBeGreaterThan(0);
    const config = await harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext());
    expect(config).toMatchObject({ tools: [{ name: "needs_you_raise" }, { name: "needs_you_withdraw" }], skills: ["needs-you-inbox"] });
  });

  it("accepts only one of two concurrent actions on the same revision", async () => {
    const { raise, view, change } = await setup();
    await raise(); const item = (await view()).items[0];
    const results = await Promise.allSettled([change(item, "handle"), change(item, "snooze")]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await view()).open).toBe(0);
  });

  it("discards a scan invalidated by a lifecycle event, then recovers", async () => {
    const { harness, thread, view, raise } = await setup();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let entered = false;
    harness.inspection.sdk.stub("threads.experimental_listPluginMetadata", async () => {
      entered = true; await gate;
      return { threads: [{ threadId: thread.id, metadata: { column: "review" } }] };
    });
    const scan = view();
    const failure = expect(scan).rejects.toThrow("changed");
    await vi.waitFor(() => expect(entered).toBe(true));
    await harness.behavior.emitThreadEvent("thread.active", { thread });
    release(); await failure;
    harness.inspection.sdk.stub("threads.experimental_listPluginMetadata", async () => ({ threads: [] }));
    await raise();
    expect((await view()).items).toMatchObject([{ key: ask.key, source: "agent" }]);
  });

  it("uses only public SDK surfaces", async () => {
    const result = await experimental_scanPublicSdkOnly(new URL("..", import.meta.url).pathname, {
      allow: [/^react(?:-dom)?$/, /^@testing-library\/react$/, /^vitest$/, /^@get-bb\/plugin-sdk\/testing(?:\/app)?$/],
    });
    expect(result.violations).toEqual([]); expect(result.privateDependencies).toEqual([]);
  });
});
