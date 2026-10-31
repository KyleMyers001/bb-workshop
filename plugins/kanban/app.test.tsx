// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Card } from "./model";

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); });
const card: Card = {
  id: "thr_one", projectId: "proj_one", title: "Implement search", column: "backlog",
  note: "", runtimeStatus: "active", providerId: "codex", updatedAt: 10,
  movedAt: null, movedBy: null,
};

async function setup(options: { failList?: boolean; failMove?: boolean } = {}) {
  let cards = [{ ...card }];
  const moves: unknown[] = [];
  const app = await loadPluginApp(() => import("./app"));
  const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, {
    rpc: {
      projects_list: () => ({ projects: [{ id: "proj_one", name: "Workshop" }, { id: "proj_two", name: "Other" }] }),
      board_list: (input: any) => {
        if (options.failList) throw new Error("Board unavailable");
        return { cards: input.projectId === "proj_one" ? cards : [], hasMore: false };
      },
      card_move: (input: any) => {
        if (options.failMove) throw new Error("Move failed");
        moves.push(input);
        cards = cards.map(item => ({ ...item, column: input.column }));
        return { threadId: input.threadId, column: input.column };
      },
    },
  });
  cleanups.push(() => slot.lifecycle.unmount());
  return { slot, moves };
}

describe("Kanban panel", () => {
  it("shows thread cards and opens the thread using host navigation", async () => {
    const { slot } = await setup();
    const title = await slot.findByRole("button", { name: card.title });
    expect(slot.getByRole("heading", { name: "In progress" })).toBeTruthy();
    fireEvent.click(title);
    expect(slot.inspection.navigateCalls).toContainEqual({ method: "toThread", threadId: "thr_one", options: { split: true } });
  });

  it("moves cards through a keyboard-accessible column selector", async () => {
    const { slot, moves } = await setup();
    const select = await slot.findByRole("combobox", { name: `Move ${card.title}` });
    fireEvent.change(select, { target: { value: "review" } });
    await waitFor(() => expect(moves).toHaveLength(1));
    await waitFor(() => expect((slot.getByRole("combobox", { name: `Move ${card.title}` }) as HTMLSelectElement).value).toBe("review"));
    expect(moves[0]).toMatchObject({ threadId: "thr_one", projectId: "proj_one", column: "review" });
  });

  it("filters cards and keeps projects separate", async () => {
    const { slot } = await setup();
    await slot.findByRole("button", { name: card.title });
    fireEvent.change(slot.getByRole("searchbox", { name: "Filter threads" }), { target: { value: "nonexistent" } });
    expect(slot.queryByRole("button", { name: card.title })).toBeNull();
    fireEvent.change(slot.getByRole("combobox", { name: "Project" }), { target: { value: "proj_two" } });
    await waitFor(() => expect(slot.getByText("0 of 0 threads")).toBeTruthy());
  });

  it("reports loading and move failures with a retry path", async () => {
    const first = await setup({ failList: true });
    expect((await first.slot.findByRole("alert")).textContent).toContain("Board unavailable");
    first.slot.lifecycle.unmount(); cleanups.pop();
    const { slot } = await setup({ failMove: true });
    fireEvent.change(await slot.findByRole("combobox", { name: `Move ${card.title}` }), { target: { value: "done" } });
    expect((await slot.findByRole("alert")).textContent).toContain("Move failed");
    expect((slot.getByRole("combobox", { name: `Move ${card.title}` }) as HTMLSelectElement).value).toBe("backlog");
  });

  it("refreshes after reconnecting", async () => {
    const { slot } = await setup();
    await slot.findByRole("button", { name: card.title });
    const before = slot.inspection.rpcCalls.length;
    await act(() => slot.behavior.setRealtimeConnectionState("reconnecting"));
    await act(() => slot.behavior.setRealtimeConnectionState("connected"));
    await waitFor(() => expect(slot.inspection.rpcCalls.length).toBeGreaterThan(before));
  });
});
