// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { badgeFor } from "../badge";
import type { Item, View } from "../model";

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); });
const item: Item = { id: "ask_1", threadId: "thr_one", projectId: "proj_one", projectName: "Workshop",
  threadTitle: "Dashboard refresh", key: "scope", kind: "question", title: "Choose refresh scope",
  ask: "Panel-open only?", context: "Waiting on scope", recommendation: "Panel-open only",
  source: "agent", status: "open", version: 1, raisedAt: 10, updatedAt: 10, snoozedUntil: null };
const other: Item = { ...item, id: "ask_2", threadId: "thr_two", projectId: "proj_two", projectName: "Other",
  threadTitle: "Plugin cutover", kind: "permission", title: "May I install?", ask: "Install this verified plugin?" };
function snapshot(items: Item[] = [item], overrides: Partial<View> = {}): View {
  return { items, open: items.filter(item => item.status === "open").length,
    snoozed: items.filter(item => item.status === "snoozed").length,
    history: items.filter(item => ["handled", "withdrawn"].includes(item.status)).length,
    matching: items.length, loadedThreads: 12, limited: false,
    checkedAt: Date.now(), hasMore: false, ...overrides };
}
async function setup(options: { items?: Item[]; view?: (input: any) => View | Promise<View>; failChange?: boolean } = {}) {
  let items = structuredClone(options.items ?? [item]);
  const changes: any[] = [];
  const app = await loadPluginApp(() => import("../app"));
  const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, { rpc: {
    projects_list: () => ({ projects: [{ id: "proj_one", name: "Workshop" }, { id: "proj_two", name: "Other" }] }),
    inbox_view: (input: any) => {
      if (options.view) return options.view(input);
      const scoped = items.filter(item => !input.projectId || item.projectId === input.projectId);
      const filtered = scoped.filter(item => {
        const statusMatches = input.filter === "history" ? ["handled", "withdrawn"].includes(item.status)
          : input.filter === "snoozed" ? item.status === "snoozed"
          : item.status === "open" && (input.filter === "open" || item.kind === input.filter);
        return statusMatches && `${item.title} ${item.ask}`.toLowerCase().includes(input.search.toLowerCase());
      });
      return snapshot(filtered.slice(input.offset, input.offset + 100), {
        open: scoped.filter(item => item.status === "open").length,
        snoozed: scoped.filter(item => item.status === "snoozed").length,
        history: scoped.filter(item => ["handled", "withdrawn"].includes(item.status)).length,
        matching: filtered.length, hasMore: filtered.length > input.offset + 100,
      });
    },
    request_change: (input: any) => {
      if (options.failChange) throw new Error("Request changed elsewhere.");
      changes.push(input);
      items = items.map(item => item.id !== input.id ? item : { ...item, version: item.version + 1,
        status: input.action === "handle" ? "handled" : input.action === "snooze" ? "snoozed" : "open",
        snoozedUntil: input.action === "snooze" ? Date.now() + 3_600_000 : null });
      return { id: input.id };
    },
  } });
  cleanups.push(() => slot.lifecycle.unmount());
  return { slot, changes, app };
}

it("shows the actual ask and opens its original thread without sending a message", async () => {
  const { slot, app } = await setup();
  await slot.findByText(item.ask);
  fireEvent.click(slot.getByRole("button", { name: "Open thread" }));
  expect(slot.inspection.navigateCalls).toContainEqual({ method: "toThread", threadId: item.threadId, options: { split: true } });
  expect(slot.inspection.rpcCalls.some(call => call.method.includes("send"))).toBe(false);
  expect(app.navPanels[0]!.experimental_useBadge).toBeTruthy();
});

it("defaults to all projects and can select another request and project", async () => {
  const { slot } = await setup({ items: [item, other] });
  await slot.findByText(item.ask);
  expect((slot.getByRole("combobox", { name: "Project" }) as HTMLSelectElement).value).toBe("");
  fireEvent.click(slot.getByRole("button", { name: new RegExp(other.title) }));
  await slot.findByText(other.ask);
  fireEvent.change(slot.getByRole("combobox", { name: "Project" }), { target: { value: "proj_two" } });
  await slot.findByText(other.ask);
  expect(slot.queryByText(item.ask)).toBeNull();
  expect(slot.queryByRole("button", { name: /approve|merge|install now|send reply/i })).toBeNull();
});

it("filters by type and search without treating a filtered empty list as all clear", async () => {
  const { slot } = await setup({ items: [item, other] });
  await slot.findByText(item.ask);
  fireEvent.click(slot.getByRole("button", { name: "Permissions" }));
  await slot.findByText(other.ask);
  expect(slot.queryByText(item.ask)).toBeNull();
  fireEvent.change(slot.getByRole("searchbox", { name: "Filter requests" }), { target: { value: "nothing-matches" } });
  await slot.findByRole("heading", { name: "No matching requests" });
  expect(slot.queryByText("Nothing needs you right now.")).toBeNull();
});

it("snoozes and unsnoozes a request, then handles and reopens it from history", async () => {
  const { slot, changes } = await setup();
  fireEvent.click(await slot.findByRole("button", { name: "Snooze 1h" }));
  await slot.findByText("Snoozed for one hour. The agent is still waiting.");
  await slot.findByText("1 request(s) remain snoozed.");
  fireEvent.click(slot.getByRole("button", { name: "Snoozed" }));
  fireEvent.click(await slot.findByRole("button", { name: "Unsnooze" }));
  await slot.findByText("Request returned to Open.");
  fireEvent.click(slot.getByRole("button", { name: "Open" }));
  fireEvent.click(await slot.findByRole("button", { name: "Mark handled" }));
  await slot.findByText("Marked handled. No permission granted and no thread status changed.");
  fireEvent.click(slot.getByRole("button", { name: "History" }));
  fireEvent.click(await slot.findByRole("button", { name: "Reopen request" }));
  await slot.findByText("Request returned to Open.");
  expect(changes.map(change => change.action)).toEqual(["snooze", "unsnooze", "handle", "reopen"]);
  expect(changes.map(change => change.version)).toEqual([1, 2, 3, 4]);
});

it("disables status changes while disconnected but keeps source navigation available", async () => {
  const { slot, changes } = await setup();
  await slot.findByText(item.ask);
  await act(() => slot.behavior.setRealtimeConnectionState("reconnecting"));
  await slot.findByRole("alert");
  expect((slot.getByRole("button", { name: "Mark handled" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(slot.getByRole("button", { name: "Mark handled" }));
  expect(changes).toEqual([]);
  expect((slot.getByRole("button", { name: "Open thread" }) as HTMLButtonElement).disabled).toBe(false);
  await act(() => slot.behavior.setRealtimeConnectionState("connected"));
  await waitFor(() => expect((slot.getByRole("button", { name: "Mark handled" }) as HTMLButtonElement).disabled).toBe(false));
});

it("preserves last-known requests on refresh failure and restores actions after retry", async () => {
  let fail = false;
  const { slot } = await setup({ view: () => { if (fail) throw new Error("Private backend diagnostics"); return snapshot(); } });
  await slot.findByText(item.ask); fail = true;
  fireEvent.click(slot.getByRole("button", { name: "Refresh" }));
  expect((await slot.findByRole("alert")).textContent).toContain("last-known requests");
  expect(slot.getByText(item.ask)).toBeTruthy();
  expect(slot.queryByText("Private backend diagnostics")).toBeNull();
  expect((slot.getByRole("button", { name: "Mark handled" }) as HTMLButtonElement).disabled).toBe(true);
  fail = false; fireEvent.click(slot.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(slot.queryByRole("alert")).toBeNull());
});

it("never renders all clear for failed, stale, or partial reads", async () => {
  const failed = await setup({ view: () => { throw new Error("Unavailable"); } });
  await failed.slot.findByRole("alert");
  expect(failed.slot.queryByText("Nothing needs you right now.")).toBeNull();
  failed.slot.lifecycle.unmount(); cleanups.pop();
  const partial = await setup({ view: () => snapshot([], { limited: true }) });
  await partial.slot.findByRole("button", { name: "Scan more threads" });
  expect(partial.slot.queryByText("Nothing needs you right now.")).toBeNull();
  fireEvent.click(partial.slot.getByRole("button", { name: "Scan more threads" }));
  await waitFor(() => expect(partial.slot.inspection.rpcCalls.some(call => (call.input as any)?.threadLimit === 4000)).toBe(true));
  partial.slot.lifecycle.unmount(); cleanups.pop();
  const stale = await setup({ view: () => snapshot([item], { checkedAt: Date.now() - 100_000 }) });
  await stale.slot.findByText(item.ask); await stale.slot.findByRole("alert");
  expect((stale.slot.getByRole("button", { name: "Snooze 1h" }) as HTMLButtonElement).disabled).toBe(true);
});

it("only shows all clear after a complete successful read", async () => {
  const { slot } = await setup({ items: [] });
  await slot.findByRole("heading", { name: "Nothing needs you right now." });
  expect(slot.getByText(/does not mean their work is complete/)).toBeTruthy();
});

it("reports action conflicts without optimistically hiding the ask", async () => {
  const { slot } = await setup({ failChange: true });
  fireEvent.click(await slot.findByRole("button", { name: "Mark handled" }));
  expect((await slot.findByRole("alert")).textContent).toContain("changed elsewhere");
  expect(slot.getByText(item.ask)).toBeTruthy();
});

it("paginates all matching requests and responds to realtime invalidations", async () => {
  const items = Array.from({ length: 101 }, (_, i) => ({ ...item, id: `ask_${i}`, title: `Request ${i}` }));
  const { slot } = await setup({ items });
  fireEvent.click(await slot.findByRole("button", { name: "Next requests" }));
  await slot.findByRole("button", { name: /Request 100/ });
  expect(slot.getByText("101–101 of 101 matching requests")).toBeTruthy();
  const before = slot.inspection.rpcCalls.length;
  await slot.behavior.emitRealtime("inbox-changed", null);
  await waitFor(() => expect(slot.inspection.rpcCalls.length).toBeGreaterThan(before));
  fireEvent.click(slot.getByRole("button", { name: "Previous requests" }));
  await slot.findByText("1–100 of 101 matching requests");
});

it("discards a late response from a previous project scope", async () => {
  let release!: (result: View) => void;
  const delayed = new Promise<View>(resolve => { release = resolve; });
  const { slot } = await setup({ view: input => input.projectId === "proj_one" ? delayed : snapshot([other]) });
  await slot.findByText(other.ask);
  const project = slot.getByRole("combobox", { name: "Project" });
  fireEvent.change(project, { target: { value: "proj_one" } });
  fireEvent.change(project, { target: { value: "proj_two" } });
  await slot.findByText(other.ask);
  await act(async () => { release(snapshot([item])); await delayed; });
  expect(slot.queryByText(item.ask)).toBeNull();
  expect(slot.getByText(other.ask)).toBeTruthy();
});

it("distinguishes unknown and partial badge counts from a true zero", () => {
  expect(badgeFor(null, true)?.text).toBe("?");
  expect(badgeFor(snapshot([], { limited: true }), false)?.text).toBe("0+");
  expect(badgeFor(snapshot(), true)?.text).toBe("?");
  expect(badgeFor(snapshot(), false)?.count).toBe(1);
  expect(badgeFor(snapshot([]), false)).toBeNull();
});
