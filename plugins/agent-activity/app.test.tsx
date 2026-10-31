// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import { loadPluginApp, mountPluginContentScripts, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { thread, type SidebarThread } from "./fixtures.test-support";

let app: Awaited<ReturnType<typeof loadPluginApp>>;
const cleanups: Array<() => void | Promise<void>> = [];
beforeAll(async () => {
  window.matchMedia = vi.fn().mockImplementation(query => ({
    matches: false, media: query, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null,
  }));
  app = await loadPluginApp(() => import("./app"));
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await act(cleanup);
  document.body.replaceChildren();
});
async function mount(rows: SidebarThread[] = [], status: "ready" | "loading" | "error" = "ready") {
  document.body.innerHTML = '<div data-sidebar="footer"><ul data-sidebar="menu"><li>Original utilities</li></ul></div>';
  const scripts = await mountPluginContentScripts(app, { pluginId: "agent-activity" });
  cleanups.push(() => scripts.lifecycle.dispose());
  const slot = renderSlot(app.appOverlays[0]!, {}, {
    sidebarThreads: { status, threads: rows, projects: [
      { id: "proj_test", name: "Test project", isPersonal: false, href: "/projects/proj_test", settingsHref: "/settings" },
    ] },
    realtimeConnectionState: "connected",
  });
  cleanups.push(() => slot.lifecycle.unmount());
  return { slot, ui: within(document.body) };
}

describe("Option A footer", () => {
  it("registers an additive extension without replacing navigation or thread lists", () => {
    expect(app.appOverlays).toHaveLength(1);
    expect(app.contentScripts).toHaveLength(1);
    expect(app.threadLists).toHaveLength(0);
    expect(app.navPanels).toHaveLength(0);
  });

  it("shows mutually exclusive counts and opens threads without starting or approving work", async () => {
    const { slot, ui } = await mount([
      thread({ id: "run" }), thread({ id: "wait", displayTitle: "Approve the plan", hasPendingInteraction: true }),
      thread({ id: "hidden", isHidden: true }),
    ]);
    expect(ui.getByRole("button", { name: "1 running" })).toBeTruthy();
    fireEvent.click(ui.getByRole("button", { name: "1 needs you" }));
    const link = await ui.findByRole("link", { name: /Approve the plan/ });
    expect(ui.getByText(/Test project · Question or approval/)).toBeTruthy();
    fireEvent.click(link);
    expect(slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "wait" }]);
    expect(slot.inspection.sdkCalls).toEqual([]);
    await waitFor(() => expect(ui.queryByRole("dialog")).toBeNull());
  });

  it("keeps modified clicks as ordinary links", async () => {
    const { slot, ui } = await mount([thread({ hasPendingInteraction: true })]);
    fireEvent.click(ui.getByRole("button", { name: "1 needs you" }));
    fireEvent.click(await ui.findByRole("link", { name: /Test thread/ }), { ctrlKey: true });
    expect(slot.inspection.navigateCalls).toEqual([]);
  });

  it("provides a quiet state and empty running list", async () => {
    const { ui } = await mount();
    expect(ui.queryByRole("button", { name: /needs? you/ })).toBeNull();
    fireEvent.click(ui.getByRole("button", { name: "0 running" }));
    expect(await ui.findByText("No agents running right now.")).toBeTruthy();
  });

  it("dismisses on Escape and keeps only one activity group open", async () => {
    const { ui } = await mount([thread(), thread({ id: "wait", hasPendingInteraction: true })]);
    fireEvent.click(ui.getByRole("button", { name: "1 running" }));
    await ui.findByRole("dialog", { name: "Running" });
    fireEvent.click(ui.getByRole("button", { name: "1 needs you" }));
    await ui.findByRole("dialog", { name: "Needs you" });
    expect(ui.queryByRole("dialog", { name: "Running" })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(ui.queryByRole("dialog")).toBeNull());
  });

  it("shows loading instead of a false zero count", async () => {
    const { ui } = await mount([], "loading");
    expect(ui.getByRole("status").textContent).toBe("Loading activity…");
    expect(ui.queryByRole("button", { name: "0 running" })).toBeNull();
  });

  it("shows failures instead of false zero counts", async () => {
    const { ui } = await mount([], "error");
    expect(ui.getByRole("status").textContent).toBe("Activity unavailable");
    expect(ui.queryByRole("button", { name: "0 running" })).toBeNull();
  });

  it("does not present cached counts as live while disconnected", async () => {
    const { slot, ui } = await mount([thread()]);
    await slot.behavior.setRealtimeConnectionState("reconnecting");
    expect(ui.getByRole("status").textContent).toBe("Activity reconnecting…");
    expect(ui.queryByRole("button", { name: "1 running" })).toBeNull();
    await slot.behavior.setRealtimeConnectionState("connected");
    expect(ui.getByRole("button", { name: "1 running" })).toBeTruthy();
  });

  it("shows a separate error count and does not treat failures as running", async () => {
    const { ui } = await mount([thread({ status: "error", runtimeStatus: "error" })]);
    expect(ui.getByRole("button", { name: "0 running" })).toBeTruthy();
    fireEvent.click(ui.getByRole("button", { name: "1 error" }));
    expect(await ui.findByText(/Open to inspect error/)).toBeTruthy();
  });

  it("bounds initial popover rows and lets you show more", async () => {
    const { ui } = await mount(Array.from({ length: 35 }, (_, i) => thread({ id: `thread_${i}`, displayTitle: `Thread ${i}` })));
    fireEvent.click(ui.getByRole("button", { name: "35 running" }));
    await ui.findByRole("dialog");
    expect(ui.getAllByRole("link")).toHaveLength(30);
    fireEvent.click(ui.getByRole("button", { name: "Show more (5)" }));
    expect(ui.getAllByRole("link")).toHaveLength(35);
  });
});
