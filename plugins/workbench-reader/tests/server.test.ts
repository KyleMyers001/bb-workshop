import { mkdtemp, mkdir, writeFile, rename, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFakePluginHost, experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import plugin from "../server";
import { addedDate } from "../library";
import type { SearchResult, ReadResult } from "../contract";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "workbench-rpc-"));
  await mkdir(join(root, "Plans"));
  await writeFile(join(root, "Plans", "one.md"), "# One plan\n\n## Scope\nRead-only local search.");
  const { bb, harness } = createFakePluginHost({ pluginId: "workbench-reader", settings: { root, folders: "Plans" } });
  plugin(bb); cleanups.push(() => harness.lifecycle.dispose());
  const search = (input = {}) => harness.behavior.callRpc("search", input) as Promise<SearchResult>;
  return { root, harness, search };
}

describe("Workbench backend", () => {
  it("indexes concurrently, reads live files, and leaves source content unchanged", async () => {
    const { root, harness, search } = await setup();
    const before = await readFile(join(root, "Plans", "one.md"));
    const results = await Promise.all([search(), search(), harness.behavior.callRpc("refresh")]);
    expect(results[0]).toMatchObject({ total: 1, folders: [{ name: "Plans", count: 1 }] });
    expect(await search({ query: "local" })).toMatchObject({ total: 1 });
    const document = await harness.behavior.callRpc("read", { path: "Plans/one.md" }) as ReadResult;
    expect(document).toMatchObject({ title: "One plan", outline: [{ text: "One plan" }, { text: "Scope" }] });
    expect(await readFile(join(root, "Plans", "one.md"))).toEqual(before);
    expect(harness.registrations.agentTools).toHaveLength(0);
  });

  it("refreshes edits and new documents, prunes missing files, and preserves added dates", async () => {
    const { root, harness, search } = await setup();
    const original = (await search()).documents[0]!;
    await writeFile(join(root, "Plans", "one.md"), "# Renamed title\n\nFresh content.");
    await writeFile(join(root, "Plans", "two.markdown"), "# Second plan\n\nOther content.");
    await harness.behavior.callRpc("refresh");
    expect((await search()).documents.find(doc => doc.path === original.path)).toMatchObject({ title: "Renamed title", added: original.added });
    await rename(join(root, "Plans", "two.markdown"), join(root, "saved-outside.markdown"));
    await harness.behavior.callRpc("refresh");
    expect((await search()).total).toBe(1);
    await expect(harness.behavior.callRpc("read", { path: "Plans/two.markdown" })).rejects.toThrow();
  });

  it("does not serve the previous root after settings change", async () => {
    const { harness, search } = await setup(); await search();
    const other = await mkdtemp(join(tmpdir(), "workbench-other-"));
    await mkdir(join(other, "Reports"));
    await writeFile(join(other, "Reports", "two.md"), "# Other root");
    await harness.behavior.setSettings({ root: other, folders: "Reports" });
    const next = await search();
    expect(next.documents.map(doc => doc.title)).toEqual(["Other root"]);
    await expect(harness.behavior.callRpc("read", { path: "Plans/one.md" })).rejects.toThrow();
  });

  it("preserves the index's added dates across a plugin reload", async () => {
    const { harness, search } = await setup();
    const before = (await search()).documents[0]!;
    const replacement = await harness.lifecycle.reload(plugin);
    cleanups.push(() => replacement.harness.lifecycle.dispose());
    const after = await replacement.harness.behavior.callRpc("search", {}) as SearchResult;
    expect(after.documents[0]).toMatchObject({ path: before.path, added: before.added });
  });

  it("validates RPC and settings boundaries and refuses unsafe image paths", async () => {
    const { harness } = await setup();
    for (const input of [{ query: "x".repeat(301) }, { offset: -1 }, { sort: "bogus" }, { unknown: true }])
      await expect(harness.behavior.callRpc("search", input)).rejects.toThrow();
    await expect(harness.behavior.setSettings({ folders: "../outside" })).rejects.toThrow();
    await expect(harness.behavior.callRpc("read", { path: "../outside.md" })).rejects.toThrow();
    const response = await harness.behavior.fetchHttp("GET", "/image?path=..%2Foutside.png");
    expect(response.status).toBe(404);
  });

  it("labels unknown import dates honestly and persists known additions", () => {
    expect(addedDate(null, undefined, true, 500)).toBeNull();
    expect(addedDate(null, undefined, false, 500)).toBe(500);
    expect(addedDate(123, undefined, true, 500)).toBe(123);
    expect(addedDate(999, { added: 123 }, false, 500)).toBe(123);
    expect(addedDate(999, { added: null }, false, 500)).toBeNull();
  });

  it("uses only public SDK imports and declared dependencies", async () => {
    const scan = await experimental_scanPublicSdkOnly(new URL("..", import.meta.url).pathname, {
      allow: [/^react(?:-dom)?$/, /^react-markdown$/, /^remark-/, /^unified$/, /^unist-util-visit$/,
        /^mdast-util-to-string$/, /^mdast$/, /^better-sqlite3$/, /^@testing-library\/react$/],
    });
    expect(scan.violations).toEqual([]); expect(scan.privateDependencies).toEqual([]);
  });
});
