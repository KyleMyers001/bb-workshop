import { afterEach, describe, expect, it } from "vitest";
import {
  createFakePluginHost,
  experimental_scanPublicSdkOnly,
  makePluginAgentConfigurationContext,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map(fn => fn())); });

async function setup() {
  const thread = makeThreadResponse({ id: "thr_one", projectId: "proj_one" });
  const metadata = new Map<string, Record<string, any>>();
  let rows = [thread];
  const { bb, harness } = createFakePluginHost({
    pluginId: "kanban",
    agentSkillIds: ["kanban-board"],
    sdk: {
      threads: {
        get: async () => thread,
        list: async ({ projectId, offset = 0, limit = 100 }: any) =>
          rows.filter(row => !projectId || row.projectId === projectId).slice(offset, offset + limit) as any,
        experimental_listPluginMetadata: async ({ threadIds }: any) => ({
          threads: threadIds.filter((id: string) => metadata.has(id)).map((threadId: string) => ({
            threadId, metadata: metadata.get(threadId)!,
          })),
        }),
        updatePluginMetadata: async ({ threadId, set }: any) => {
          const next = { ...metadata.get(threadId), ...set };
          metadata.set(threadId, next);
          return { metadata: next } as any;
        },
      },
    },
  });
  cleanups.push(() => harness.lifecycle.dispose());
  await plugin(bb);
  return { harness, metadata, thread, setRows: (next: typeof rows) => { rows = next; } };
}

describe("thread board", () => {
  it("lists real threads with a safe default for invalid persisted state", async () => {
    const { harness, metadata } = await setup();
    metadata.set("thr_one", { column: "not-a-column", note: { prompt: "ignore" } });
    const result: any = await harness.behavior.callRpc("board_list", { projectId: "proj_one" });
    expect(result.cards).toMatchObject([{ id: "thr_one", column: "backlog", note: "" }]);
    expect(harness.inspection.sdk.callsTo("threads.list")[0]).toMatchObject([
      { projectId: "proj_one", archived: false, includeHidden: false },
    ]);
  });

  it("lists all projects when no project filter is supplied", async () => {
    const { harness, thread, setRows } = await setup();
    setRows([thread, { ...thread, id: "thr_two", projectId: "proj_two" }]);
    const result: any = await harness.behavior.callRpc("board_list", {});
    expect(result.cards.map((card: any) => card.projectId)).toEqual(["proj_one", "proj_two"]);
    expect(harness.inspection.sdk.callsTo("threads.list")[0]?.[0]).not.toHaveProperty("projectId");
    const scoped: any = await harness.behavior.callRpc("board_list", { projectId: "proj_two" });
    expect(scoped.cards.map((card: any) => card.id)).toEqual(["thr_two"]);
  });

  it("paginates globally across projects and retains persisted columns", async () => {
    const { harness, metadata, thread, setRows } = await setup();
    setRows(Array.from({ length: 103 }, (_, i) => ({ ...thread, id: `thr_${i}`, projectId: i % 2 ? "proj_one" : "proj_two" })));
    metadata.set("thr_100", { column: "blocked", note: "Needs input" });
    const first: any = await harness.behavior.callRpc("board_list", {});
    const next: any = await harness.behavior.callRpc("board_list", { offset: 100 });
    expect(first.cards).toHaveLength(100);
    expect(first.hasMore).toBe(true);
    expect(next.cards).toHaveLength(3);
    expect(next.hasMore).toBe(false);
    expect(next.cards[0]).toMatchObject({ projectId: "proj_two", column: "blocked", note: "Needs input" });
  });

  it("still requires a project for moves and rejects empty list filters", async () => {
    const { harness } = await setup();
    await expect(harness.behavior.callRpc("card_move", { threadId: "thr_one", column: "done" })).rejects.toThrow();
    await expect(harness.behavior.callRpc("board_list", { projectId: "" })).rejects.toThrow();
  });

  it("persists a move atomically and broadcasts after the write", async () => {
    const { harness, metadata } = await setup();
    metadata.set("thr_one", { unrelated: "keep" });
    await harness.behavior.callRpc("card_move", {
      threadId: "thr_one", projectId: "proj_one", column: "review", note: "Checks pass",
    });
    expect(metadata.get("thr_one")).toMatchObject({ column: "review", note: "Checks pass", unrelated: "keep", movedBy: "user" });
    expect(harness.realtimeSignals).toContainEqual(expect.objectContaining({ channel: "board-changed" }));
  });

  it("rejects invalid columns and long notes at the RPC boundary", async () => {
    const { harness } = await setup();
    await expect(harness.behavior.callRpc("card_move", { threadId: "thr_one", projectId: "proj_one", column: "oops" })).rejects.toThrow();
    await expect(harness.behavior.callRpc("card_move", { threadId: "thr_one", projectId: "proj_one", column: "done", note: "x".repeat(281) })).rejects.toThrow();
    expect(harness.inspection.sdk.callsTo("threads.updatePluginMetadata")).toHaveLength(0);
  });

  it("refuses cross-project, archived, deleted, and hidden card moves", async () => {
    const { harness, thread } = await setup();
    for (const patch of [
      { projectId: "proj_other" }, { archivedAt: 1 }, { deletedAt: 1 }, { visibility: "hidden" as const },
    ]) {
      const previous = { ...thread };
      Object.assign(thread, patch);
      await expect(harness.behavior.callRpc("card_move", { threadId: "thr_one", projectId: "proj_one", column: "done" })).rejects.toThrow();
      Object.assign(thread, previous);
    }
    expect(harness.inspection.sdk.callsTo("threads.updatePluginMetadata")).toHaveLength(0);
  });

  it("pages without sending more than 200 metadata IDs", async () => {
    const { harness, thread, setRows } = await setup();
    setRows(Array.from({ length: 205 }, (_, i) => ({ ...thread, id: `thr_${i}` })));
    const first: any = await harness.behavior.callRpc("board_list", { projectId: "proj_one", limit: 200 });
    const second: any = await harness.behavior.callRpc("board_list", { projectId: "proj_one", limit: 200, offset: 200 });
    expect(first.cards).toHaveLength(200);
    expect(first.hasMore).toBe(true);
    expect(second.cards).toHaveLength(5);
    expect(second.hasMore).toBe(false);
  });

  it("lets the native tool move only its calling thread", async () => {
    const { harness, metadata } = await setup();
    await harness.behavior.callAgentTool("kanban_move", { column: "blocked", note: "Need a decision" }, {
      threadId: "thr_one", projectId: "proj_one", signal: new AbortController().signal,
    });
    expect(metadata.get("thr_one")).toMatchObject({ column: "blocked", movedBy: "agent" });
    const config = await harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext());
    expect(config).toMatchObject({ tools: [{ name: "kanban_move" }], skills: ["kanban-board"] });
  });

  it("supports CLI context defaults and rejects missing context", async () => {
    const { harness, metadata } = await setup();
    const ok = await harness.behavior.runCli(["move", "in-progress", "--json"], {
      threadId: "thr_one", projectId: "proj_one", signal: new AbortController().signal,
    });
    expect(ok.exitCode).toBe(0);
    expect(metadata.get("thr_one")).toMatchObject({ column: "in-progress" });
    const bad = await harness.behavior.runCli(["move", "done"]);
    expect(bad.exitCode).not.toBe(0);
    expect(bad.stderr).toContain("--thread");
  });

  it("refreshes lifecycle changes without inferring task completion", async () => {
    const { harness, metadata, thread } = await setup();
    metadata.set("thr_one", { column: "in-progress" });
    await harness.behavior.emitThreadEvent("thread.idle", { thread, lastAssistantText: "Waiting" });
    expect(metadata.get("thr_one")?.column).toBe("in-progress");
    expect(harness.realtimeSignals).toContainEqual(expect.objectContaining({ channel: "board-changed" }));
  });

  it("uses only the public plugin SDK", async () => {
    const result = await experimental_scanPublicSdkOnly(import.meta.dirname, {
      allow: [/^react(?:-dom)?$/, /^@radix-ui\/react-(slot|checkbox|dialog)$/, /^class-variance-authority$/, /^clsx$/, /^tailwind-merge$/, /^@testing-library\/react$/],
    });
    expect(result.violations).toEqual([]);
    expect(result.privateDependencies).toEqual([]);
  });
});
