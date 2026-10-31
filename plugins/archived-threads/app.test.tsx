// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import type { useSdk } from "@get-bb/plugin-sdk/app";

type ThreadRow = Awaited<ReturnType<ReturnType<typeof useSdk>["threads"]["list"]>>[number];
function thread(id: string, title: string): ThreadRow {
  return {
    ...makeThreadResponse({ id, title, projectId: "proj_test", archivedAt: 1000 }),
    activity: { activeBackgroundAgentCount: 0, activeBackgroundCommandCount: 0,
      activeGoalCount: 0, activePlanModeCount: 0, activeWorkflowCount: 0 },
    environmentBranchName: null, environmentHostId: null,
    environmentIsWorktree: null, environmentName: null, environmentPath: null,
    environmentProviderId: null, environmentWorkspaceDisplayKind: "other",
    hasPendingInteraction: false, pinSortKey: null, queuedWork: "none",
  };
}
const projects = [{ id: "proj_test", name: "Test project", kind: "standard" as const,
  createdAt: 0, updatedAt: 0, gitRemoteUrl: null, sources: [] }];
let app: Awaited<ReturnType<typeof loadPluginApp>>;
const mounted: Array<ReturnType<typeof renderSlot>> = [];
beforeAll(async () => { app = await loadPluginApp(() => import("./app")); });
afterEach(() => { mounted.splice(0).forEach((slot) => slot.lifecycle.unmount()); });
function mount(
  list: ReturnType<typeof useSdk>["threads"]["list"] = async () => [thread("thr_1", "Hello World planner")],
  search: ReturnType<typeof useSdk>["threads"]["search"] = async () => ({
    active: { results: [], total: 0 }, archived: { results: [], total: 0 },
  }),
) {
  const panel = app.navPanels.find((entry) => entry.id === "archived");
  expect(panel, "dedicated Archived navigation panel").toBeDefined();
  const slot = renderSlot(panel!, { subPath: "" }, {
    sdk: { threads: { list, search }, projects: { list: async () => projects } },
  });
  mounted.push(slot);
  return slot;
}

describe("Archived navigation", () => {
  it("excludes hidden, deleted and non-archived rows from search results", async () => {
    const search = vi.fn().mockResolvedValue({ active: { results: [], total: 0 },
      archived: { total: 4, results: [
        thread("thr_visible", "Visible archive"),
        { ...thread("thr_hidden", "Hidden archive"), visibility: "hidden" },
        { ...thread("thr_deleted", "Deleted archive"), deletedAt: 2000 },
        { ...thread("thr_active", "Active thread"), archivedAt: null },
      ].map((thread) => ({ thread, matches: [] })) } });
    const slot = mount(undefined, search);
    fireEvent.change(slot.getByRole("searchbox"), { target: { value: "archive" } });
    fireEvent.submit(slot.getByRole("search"));
    await slot.findByRole("button", { name: /Visible archive/ });
    for (const title of ["Hidden archive", "Deleted archive", "Active thread"]) {
      expect(slot.queryByText(title)).toBeNull();
    }
  });

  it("aborts pending reads on unmount", async () => {
    let signal: AbortSignal | undefined;
    const slot = mount(async (args) => {
      signal = args?.signal;
      return [];
    });
    await slot.findByText("No archived threads yet.");
    slot.lifecycle.unmount();
    mounted.splice(mounted.indexOf(slot), 1);
    expect(signal?.aborted).toBe(true);
  });

  it("registers an Archived destination without replacing the main sidebar", () => {
    expect(app.navPanels.map(({ id, title, path }) => ({ id, title, path })))
      .toEqual([{ id: "archived", title: "Archived", path: "archived" }]);
    expect(app.threadLists).toHaveLength(0);
  });

  it("lists only archived, visible threads and opens without mutations", async () => {
    const list = vi.fn(async () => [thread("thr_1", "Hello World planner")]);
    const slot = mount(list);
    fireEvent.click(await slot.findByRole("button", { name: /Hello World planner/ }));
    expect(list).toHaveBeenCalledWith(expect.objectContaining({
      archived: true, includeHidden: false, limit: 50, offset: 0,
    }));
    expect(slot.getByText(/Test project/)).toBeTruthy();
    expect(slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_1" }]);
    expect(slot.inspection.sdkCalls.every(({ method }) =>
      ["threads.list", "projects.list"].includes(method))).toBe(true);
  });

  it("shows an explicit empty state", async () => {
    const slot = mount(vi.fn(async () => []));
    expect(await slot.findByText("No archived threads yet.")).toBeTruthy();
  });

  it("paginates without dropping the archived filter", async () => {
    const list = vi.fn().mockResolvedValueOnce(Array.from({ length: 50 },
      (_, index) => thread(`thr_${index}`, `Planner ${index}`)))
      .mockResolvedValueOnce([thread("thr_last", "Last planner")]);
    const slot = mount(list);
    fireEvent.click(await slot.findByRole("button", { name: "Next page" }));
    expect(await slot.findByRole("button", { name: /Last planner/ })).toBeTruthy();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ archived: true, offset: 50 }));
    expect((slot.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("searches all archived history, excludes active hits, and reports truncation", async () => {
    const search = vi.fn().mockResolvedValue({
      active: { results: [{ thread: thread("thr_active", "Active hit"), matches: [] }], total: 1 },
      archived: { results: [{ thread: thread("thr_match", "Archived hit"), matches: [] }], total: 70 },
    });
    const slot = mount(undefined, search);
    await slot.findByRole("button", { name: /Hello World planner/ });
    fireEvent.change(slot.getByRole("searchbox"), { target: { value: "hello" } });
    fireEvent.submit(slot.getByRole("search"));
    expect(await slot.findByRole("button", { name: /Archived hit/ })).toBeTruthy();
    expect(slot.queryByText("Active hit")).toBeNull();
    expect(slot.getByText(/70 matches/)).toBeTruthy();
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ query: "hello", limitPerGroup: "50" }));
    fireEvent.click(slot.getByRole("button", { name: "Clear search" }));
    expect(await slot.findByRole("button", { name: /Hello World planner/ })).toBeTruthy();
  });

  it("reports failures and retries rather than showing a false empty state", async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce([thread("thr_retry", "Retry succeeded")]);
    const slot = mount(list);
    expect(await slot.findByRole("alert")).toBeTruthy();
    expect(slot.queryByText("No archived threads yet.")).toBeNull();
    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));
    expect(await slot.findByRole("button", { name: /Retry succeeded/ })).toBeTruthy();
  });

  it("ignores stale responses when a newer search wins", async () => {
    let resolveFirst!: (value: ReturnType<typeof thread>[]) => void;
    const list = vi.fn(() => new Promise<ReturnType<typeof thread>[]>((resolve) => { resolveFirst = resolve; }));
    const search = vi.fn().mockResolvedValue({ active: { results: [], total: 0 },
      archived: { results: [{ thread: thread("thr_new", "New result"), matches: [] }], total: 1 } });
    const slot = mount(list, search);
    fireEvent.change(slot.getByRole("searchbox"), { target: { value: "new" } });
    fireEvent.submit(slot.getByRole("search"));
    await slot.findByRole("button", { name: /New result/ });
    await act(async () => { resolveFirst([thread("thr_stale", "Stale result")]); });
    expect(slot.queryByText("Stale result")).toBeNull();
    expect(slot.getByRole("button", { name: /New result/ })).toBeTruthy();
    expect((list.mock.calls[0] as unknown as [{ signal: AbortSignal }])[0].signal.aborted).toBe(true);
  });
});
