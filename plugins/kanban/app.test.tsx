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

const otherCard: Card = { ...card, id: "thr_two", projectId: "proj_two", title: "Fix build", column: "blocked" };

async function setup(options: { failList?: boolean; failMove?: boolean; cards?: Card[]; projects?: Array<{ id: string; name: string }> } = {}) {
  let cards = options.cards ?? [{ ...card }];
  const moves: unknown[] = [];
  const app = await loadPluginApp(() => import("./app"));
  const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, {
    rpc: {
      projects_list: () => ({ projects: options.projects ?? [{ id: "proj_one", name: "Workshop" }, { id: "proj_two", name: "Other" }] }),
      board_list: (input: any) => {
        if (options.failList) throw new Error("Board unavailable");
        const scoped = cards.filter(item => !input.projectId || item.projectId === input.projectId);
        return { cards: scoped.slice(input.offset, input.offset + input.limit), hasMore: scoped.length > input.offset + input.limit };
      },
      card_move: (input: any) => {
        if (options.failMove) throw new Error("Move failed");
        moves.push(input);
        cards = cards.map(item => item.id === input.threadId ? { ...item, column: input.column } : item);
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

  it("defaults to all projects and labels cards with their project", async () => {
    const { slot } = await setup({ cards: [card, otherCard] });
    await slot.findByRole("button", { name: otherCard.title });
    expect((slot.getByRole("combobox", { name: "Project" }) as HTMLSelectElement).value).toBe("");
    expect(slot.getByRole("option", { name: "All projects" })).toBeTruthy();
    expect(slot.getByText("Workshop", { selector: ".kanban-card-project" })).toBeTruthy();
    expect(slot.getByText("Other", { selector: ".kanban-card-project" })).toBeTruthy();
    expect(slot.getByText("2 of 2 threads")).toBeTruthy();
  });

  it("can switch between an individual project and all projects", async () => {
    const { slot } = await setup({ cards: [card, otherCard] });
    await slot.findByRole("button", { name: otherCard.title });
    const project = slot.getByRole("combobox", { name: "Project" });
    fireEvent.change(project, { target: { value: "proj_one" } });
    await slot.findByRole("button", { name: card.title });
    expect(slot.queryByRole("button", { name: otherCard.title })).toBeNull();
    expect(slot.queryByText("Other", { selector: ".kanban-card-project" })).toBeNull();
    fireEvent.change(project, { target: { value: "" } });
    await slot.findByRole("button", { name: otherCard.title });
  });

  it("moves a card using its own project in the combined board", async () => {
    const { slot, moves } = await setup({ cards: [card, otherCard] });
    fireEvent.change(await slot.findByRole("combobox", { name: `Move ${otherCard.title}` }), { target: { value: "review" } });
    await waitFor(() => expect(moves).toHaveLength(1));
    expect(moves[0]).toMatchObject({ threadId: "thr_two", projectId: "proj_two", column: "review" });
    await waitFor(() => expect((slot.getByRole("combobox", { name: `Move ${otherCard.title}` }) as HTMLSelectElement).value).toBe("review"));
    expect((slot.getByRole("combobox", { name: `Move ${card.title}` }) as HTMLSelectElement).value).toBe("backlog");
  });

  it("drags a card from another project into a column on the combined board", async () => {
    const { slot, moves } = await setup({ cards: [card, otherCard] });
    const title = await slot.findByRole("button", { name: otherCard.title });
    const dataTransfer = { setData: () => {}, effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(title.closest("article")!, { dataTransfer });
    const review = slot.getByRole("region", { name: "Review" });
    fireEvent.dragOver(review, { dataTransfer });
    fireEvent.drop(review, { dataTransfer });
    await waitFor(() => expect(moves).toHaveLength(1));
    expect(moves[0]).toMatchObject({ threadId: "thr_two", projectId: "proj_two", column: "review" });
  });

  it("refreshes the all-projects board for changes in another project", async () => {
    const { slot } = await setup({ cards: [card, otherCard] });
    await slot.findByRole("button", { name: otherCard.title });
    const before = slot.inspection.rpcCalls.length;
    await slot.behavior.emitRealtime("board-changed", { projectId: "proj_two" });
    await waitFor(() => expect(slot.inspection.rpcCalls.length).toBeGreaterThan(before));
  });

  it("pages the combined board without losing cards from other projects", async () => {
    const cards = Array.from({ length: 101 }, (_, i) => ({ ...card, id: `thr_${i}`, title: `Task ${i}`, projectId: i % 2 ? "proj_one" : "proj_two" }));
    const { slot } = await setup({ cards });
    fireEvent.click(await slot.findByRole("button", { name: "Load more threads" }));
    await slot.findByRole("button", { name: "Task 100" });
    expect(slot.getByText("101 of 101 threads")).toBeTruthy();
    expect(slot.queryByRole("button", { name: "Load more threads" })).toBeNull();
  });

  it("opens the composer without forcing a project in all-projects mode", async () => {
    const { slot } = await setup();
    fireEvent.click(await slot.findByRole("button", { name: "New thread" }));
    expect(slot.inspection.navigateCalls).toContainEqual({ method: "toCompose", options: { focusPrompt: true } });
    fireEvent.change(slot.getByRole("combobox", { name: "Project" }), { target: { value: "proj_two" } });
    fireEvent.click(await slot.findByRole("button", { name: "New thread" }));
    expect(slot.inspection.navigateCalls).toContainEqual({ method: "toCompose", options: { projectId: "proj_two", focusPrompt: true } });
  });

  it("shows an empty-project prompt when no projects exist", async () => {
    const { slot } = await setup({ projects: [] });
    await slot.findByText("Create a project to start tracking threads.");
    expect(slot.queryByRole("button", { name: "New thread" })).toBeNull();
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
