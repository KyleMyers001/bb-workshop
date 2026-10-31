// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { SearchResult, ReadResult } from "../contract";

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));
const first: SearchResult["documents"][number] = {
  path: "Plans/rollout.md", title: "Plugin rollout", folder: "Plans", added: 1_700_000_000_000,
  modified: 1_700_000_000_000, snippet: "A useful \u0001rollout\u0002 plan.",
};
const second = { ...first, path: "Reports/checks.md", title: "Verification report", folder: "Reports" };
const status = { root: "/example/Workbench", folders: [{ name: "Plans", count: 1 }, { name: "Reports", count: 1 }], indexedAt: Date.now(), warnings: [] };
function page(input: Partial<SearchResult> = {}): SearchResult {
  return { ...status, documents: [first, second], total: 2, hasMore: false, correctedQuery: null, ...input };
}
function read(path: string): ReadResult {
  const title = path === first.path ? first.title : second.title;
  return { path, title, added: first.added, modified: first.modified,
    content: `# ${title}\n\n## Outcome\nEverything stays read only.\n\n[Related report](../Reports/checks.md)`,
    outline: [{ id: title.toLowerCase().replaceAll(" ", "-"), text: title, depth: 1 }, { id: "outcome", text: "Outcome", depth: 2 }] };
}
async function setup(options: {
  subPath?: string; search?: (input: any) => SearchResult | Promise<SearchResult>;
  read?: (input: any) => ReadResult | Promise<ReadResult>; resolve?: () => { path: string; anchor: string };
} = {}) {
  const app = await loadPluginApp(() => import("../app"));
  const slot = renderSlot(app.navPanels[0]!, { subPath: options.subPath ?? "" }, {
    pluginId: "workbench-reader", rpc: {
      search: options.search ?? (() => page()), refresh: () => status,
      read: options.read ?? ((input: unknown) => read((input as { path: string }).path)),
      resolve: options.resolve ?? (() => ({ path: second.path, anchor: "outcome" })),
    },
  });
  cleanups.push(() => slot.lifecycle.unmount()); return slot;
}

describe("Workbench library and reader", () => {
  it("loads local results, previews a document, highlights snippets and uses host routes", async () => {
    const slot = await setup();
    await slot.findByRole("heading", { name: first.title });
    expect(slot.getByText("Read only")).toBeTruthy();
    expect(slot.container.querySelector("mark")?.textContent).toBe("rollout");
    fireEvent.click(slot.getByRole("button", { name: /Reports.*Verification report/ }));
    await slot.findByRole("heading", { name: second.title });
    expect(slot.inspection.navigateCalls).toContainEqual({ method: "toPluginPanel", path: "library", options: { subPath: "file/Reports/checks.md", replace: false } });
    expect(slot.inspection.rpcCalls.every(call => ["search", "read"].includes(call.method))).toBe(true);
  });

  it("passes debounced search, folder and sort to the validated backend", async () => {
    const slot = await setup(); await slot.findByRole("heading", { name: first.title });
    fireEvent.change(slot.getByRole("searchbox"), { target: { value: "rollout" } });
    await waitFor(() => expect(slot.inspection.rpcCalls.some(call => call.method === "search" && (call.input as any).query === "rollout")).toBe(true));
    fireEvent.click(slot.getByRole("button", { name: "Reports, 1 document" }));
    fireEvent.change(slot.getByRole("combobox", { name: "Sort by" }), { target: { value: "updated" } });
    await waitFor(() => expect(slot.inspection.rpcCalls).toContainEqual(expect.objectContaining({ method: "search", input: expect.objectContaining({ query: "rollout", folder: "Reports", sort: "updated" }) })));
  });

  it("opens focus mode with an outline and returns without losing search state", async () => {
    const slot = await setup(); await slot.findByRole("heading", { name: first.title });
    fireEvent.change(slot.getByRole("searchbox"), { target: { value: "rollout" } });
    fireEvent.click(slot.getByRole("button", { name: "Focus ↗" }));
    expect(slot.container.querySelector(".wb-is-focused")).toBeTruthy();
    expect(slot.getByRole("navigation", { name: "On this page" })).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: "← Back to library" }));
    expect((slot.getByRole("searchbox") as HTMLInputElement).value).toBe("rollout");
    expect(slot.container.querySelector(".wb-is-focused")).toBeNull();
  });

  it("places document dates directly beneath the first title, without duplicating them", async () => {
    const slot = await setup();
    const title = await slot.findByRole("heading", { name: first.title });
    expect(title.nextElementSibling?.classList.contains("wb-document-meta")).toBe(true);
    expect(slot.container.querySelectorAll(".wb-document-meta")).toHaveLength(1);
  });

  it("gives different code fences separate host cache identities", async () => {
    const document = { ...read(first.path), content: '# Code blocks\n\n```ts\nconst short = 1;\n```\n\n```ts\nconst longer = {\n  value: 2,\n};\n```' };
    const slot = await setup({ read: () => document });
    await slot.findByRole("heading", { name: "Code blocks" });
    const blocks = slot.getAllByTestId("bb-source-code");
    expect(blocks.map(block => block.textContent)).toEqual(["const short = 1;", "const longer = {\n  value: 2,\n};"]);
    const paths = blocks.map(block => block.getAttribute("data-path"));
    expect(new Set(paths).size).toBe(2);
    expect(paths.every(path => path?.endsWith(".ts"))).toBe(true);
  });

  it("keeps a fence identity stable until its content changes", async () => {
    let document = { ...read(first.path), content: '# Code updates\n\n```ts\nconst value = 1;\n```' };
    const slot = await setup({ read: () => document });
    await slot.findByRole("heading", { name: "Code updates" });
    const initialPath = slot.getByTestId("bb-source-code").getAttribute("data-path");
    fireEvent.click(slot.getByRole("button", { name: "Focus ↗" }));
    expect(slot.getByTestId("bb-source-code").getAttribute("data-path")).toBe(initialPath);
    document = { ...document, content: '# Code updates\n\n```ts\nconst value = {\n  updated: true,\n};\n```' };
    await slot.behavior.emitRealtime("library-changed", null);
    await waitFor(() => expect(slot.getByTestId("bb-source-code").textContent).toContain("updated: true"));
    expect(slot.getByTestId("bb-source-code").getAttribute("data-path")).not.toBe(initialPath);
    expect(slot.getByTestId("bb-source-code").getAttribute("data-path")).toMatch(/\.ts$/);
  });

  it("keeps title metadata beneath a filename fallback when the source has no H1", async () => {
    const slot = await setup({ read: ({ path }) => ({ ...read(path), content: "Plain Markdown content.", outline: [] }) });
    const title = await slot.findByRole("heading", { name: first.title });
    expect(title.nextElementSibling?.classList.contains("wb-document-meta")).toBe(true);
    expect(slot.container.querySelectorAll(".wb-document h1")).toHaveLength(1);
  });

  it("collapses the source bar in Focus while keeping Refresh and Back available", async () => {
    const slot = await setup(); await slot.findByRole("heading", { name: first.title });
    fireEvent.click(slot.getByRole("button", { name: "Focus ↗" }));
    expect(slot.queryByText("Server · /example/Workbench")).toBeNull();
    expect(slot.getAllByRole("button", { name: "Refresh" })).toHaveLength(1);
    fireEvent.click(slot.getByRole("button", { name: "← Back to library" }));
    expect(slot.getByText("Server · /example/Workbench")).toBeTruthy();
  });

  it("loads subsequent pages without dropping or duplicating earlier results", async () => {
    const documents = Array.from({ length: 51 }, (_, i) => ({ ...first, path: `Plans/item-${i}.md`, title: `Item ${i}` }));
    const slot = await setup({ search: ({ offset, limit }) => page({ documents: documents.slice(offset, offset + limit), total: 51, hasMore: offset + limit < 51 }) });
    fireEvent.click(await slot.findByRole("button", { name: "Load more documents" }));
    await slot.findByRole("button", { name: /Item 50/ });
    expect(slot.container.querySelectorAll(".wb-result")).toHaveLength(51);
    expect(slot.queryByRole("button", { name: "Load more documents" })).toBeNull();
  });

  it("renders recoverable document errors and an honest empty library", async () => {
    let fails = true;
    const slot = await setup({ read: ({ path }) => { if (fails) throw new Error("Document unavailable"); return read(path); } });
    expect(await slot.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Document unavailable"));
    fails = false; fireEvent.click(slot.getByRole("button", { name: "Retry document" }));
    await slot.findByRole("heading", { name: first.title });
    slot.lifecycle.unmount();
    const empty = await setup({ search: () => page({ documents: [], total: 0 }) });
    expect(await empty.findByText(/No Markdown documents found/)).toBeTruthy();
  });

  it("honors a deep link instead of replacing it with the first result", async () => {
    const slot = await setup({ subPath: "read/Reports/checks.md" });
    await slot.findByRole("heading", { name: second.title });
    expect(slot.container.querySelector(".wb-is-focused")).toBeTruthy();
  });

  it("does not let a late document response replace a newer selection", async () => {
    let resolve!: (value: ReadResult) => void;
    const delayed = new Promise<ReadResult>(done => { resolve = done; });
    const slot = await setup({ read: ({ path }) => path === first.path ? delayed : read(path) });
    fireEvent.click(await slot.findByRole("button", { name: /Reports.*Verification report/ }));
    await slot.findByRole("heading", { name: second.title });
    await act(async () => { resolve(read(first.path)); });
    expect(slot.queryByRole("heading", { name: first.title })).toBeNull();
  });

  it("resolves document links and presents link failures without an edit surface", async () => {
    const slot = await setup({ resolve: () => { throw new Error("Linked document was not found"); } });
    fireEvent.click(await slot.findByRole("button", { name: "Related report" }));
    expect(await slot.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Linked document was not found"));
    expect(slot.container.querySelector('[contenteditable="true"],textarea')).toBeNull();
  });

  it("blocks active Markdown and remote images while retaining tables, tasks and wiki links", async () => {
    const document = read(first.path);
    document.content = '# Safety\n\n<script>window.__unsafe = true</script>\n\n[Unsafe](javascript:alert(1))\n\n![Remote](https://example.com/track.png)\n\n![Local](./image.png)\n\n[[report|Wiki report]]\n\n- [x] Done\n\n| Check | Status |\n| --- | --- |\n| Build | Pass |';
    const slot = await setup({ read: () => document });
    await slot.findByRole("heading", { name: "Safety" });
    expect(slot.container.querySelector("script,iframe")).toBeNull();
    expect(slot.container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(slot.getByText("Image not loaded: Remote")).toBeTruthy();
    expect(slot.getByRole("img", { name: "Local" }).getAttribute("src")).toBe("/api/v1/plugins/workbench-reader/http/image?path=Plans%2Fimage.png");
    expect(slot.getByRole("table")).toBeTruthy();
    expect((slot.getByRole("checkbox", { name: "Completed task" }) as HTMLInputElement).disabled).toBe(true);
    expect(slot.getByRole("button", { name: "Wiki report" })).toBeTruthy();
  });

  it("refreshes on realtime updates and shows recoverable search failures", async () => {
    let fails = true;
    const slot = await setup({ search: () => { if (fails) throw new Error("Index unavailable"); return page(); } });
    expect(await slot.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Index unavailable"));
    fails = false; fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await slot.findByRole("heading", { name: first.title });
    const before = slot.inspection.rpcCalls.length;
    await slot.behavior.emitRealtime("library-changed", null);
    await waitFor(() => expect(slot.inspection.rpcCalls.length).toBeGreaterThan(before));
  });

  it("ignores stale search results when a later query has completed", async () => {
    let resolve!: (value: SearchResult) => void;
    const delayed = new Promise<SearchResult>(done => { resolve = done; });
    const slot = await setup({ search: ({ query }) => query === "older" ? delayed : page({ documents: query ? [second] : [first, second] }) });
    await slot.findByRole("heading", { name: first.title });
    fireEvent.change(slot.getByRole("searchbox"), { target: { value: "older" } });
    await waitFor(() => expect(slot.inspection.rpcCalls.some(call => (call.input as any)?.query === "older")).toBe(true));
    fireEvent.change(slot.getByRole("searchbox"), { target: { value: "newer" } });
    await waitFor(() => expect(slot.inspection.rpcCalls.some(call => (call.input as any)?.query === "newer")).toBe(true));
    await act(async () => { resolve(page({ documents: [first] })); });
    expect(slot.queryByRole("button", { name: /Plans.*Plugin rollout/ })).toBeNull();
    expect(slot.getByRole("button", { name: /Reports.*Verification report/ })).toBeTruthy();
  });
});
