import { afterEach, expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createStore } from "../store";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { vi.useRealTimers(); await Promise.all(cleanups.splice(0).map(fn => fn())); });

it("persists a specific request and deduplicates repeat reports", () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "needs-you" });
  cleanups.push(() => harness.lifecycle.dispose());
  const store = createStore(bb);
  const body = { kind: "question" as const, title: "Choose refresh scope", ask: "Panel-open only?", context: "Waiting on scope.", recommendation: "Panel-open only." };
  const first = store.report("thr_one", "refresh-scope", body, "agent");
  expect(first).toMatchObject({ threadId: "thr_one", key: "refresh-scope", status: "open", version: 1, ...body });
  expect(store.report("thr_one", "refresh-scope", body, "agent")).toEqual(first);
});

it("rejects conflicting state changes and allows explicit undo of handling", () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "needs-you" });
  cleanups.push(() => harness.lifecycle.dispose());
  const store = createStore(bb);
  const body = { kind: "review" as const, title: "Review", ask: "Inspect diff", context: "", recommendation: "" };
  const item = store.report("thr_one", "review", body, "cli");
  const handled = store.change({ id: item.id, version: item.version, action: "handle" });
  expect(() => store.change({ id: item.id, version: item.version, action: "snooze" })).toThrow("changed");
  const reopened = store.change({ id: handled.id, version: handled.version, action: "reopen" });
  expect(reopened.status).toBe("open");
  const snoozed = store.change({ id: reopened.id, version: reopened.version, action: "snooze" });
  expect(store.change({ id: snoozed.id, version: snoozed.version, action: "unsnooze" }).status).toBe("open");
  expect(() => store.change({ id: item.id, version: store.get(item.id)!.version, action: "reopen" })).toThrow("state");
});

it("bounds distinct request keys without deleting history", () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "needs-you" });
  cleanups.push(() => harness.lifecycle.dispose());
  const store = createStore(bb);
  const body = { kind: "question" as const, title: "Q", ask: "Choose", context: "", recommendation: "" };
  for (let i = 0; i < 100; i++) store.report("thr_one", `ask-${i}`, body, "agent");
  expect(() => store.report("thr_one", "overflow", body, "agent")).toThrow("limit");
  expect(store.report("thr_one", "ask-0", { ...body, ask: "Changed" }, "agent").version).toBe(2);
  expect(store.all()).toHaveLength(100);
});
