import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { catalogWorkflows } from "./workflow-catalog.js";

const source = `export const meta = { name: "metadata-name", description: "Reusable loop", phases: [], inputSchema: { type: "object", properties: { task: { type: "string" } } } }; throw new Error("must not execute");`;
const missing = () => Object.assign(new Error("absent"), { status: 404, code: "ENOENT" });

describe("workflow catalog", () => {
  async function fixture(files: Record<string, string>, truncated = false) {
    const host = createFakePluginHost({
      sdk: {
        threads: { get: async () => ({ environmentId: "env-origin" }) as never },
        environments: { get: async () => ({ id: "env-origin", projectId: "project-test", hostId: "host-origin", path: "/repo" }) as never },
        hosts: { directory: async ({ path }) => ({
          directory: path!, parent: null, roots: [],
          entries: [...Object.keys(files).filter((file) => file.startsWith(`${path}/`) && !file.slice(path!.length + 1).includes("/"))
            .map((file) => ({ kind: "file" as const, name: file.split("/").at(-1)!, path: file })),
            ...(truncated ? Array.from({ length: 1_001 }, (_, index) => ({ kind: "directory" as const, name: `dir-${index}`, path: `${path}/dir-${index}` })) : [])],
        }) },
        files: {
          read: async ({ path }) => {
            if (!(path in files)) throw missing();
            return { content: files[path]!, contentEncoding: "utf8", sizeBytes: Buffer.byteLength(files[path]!), sha256: "test" };
          },
        },
      },
    });
    return host;
  }

  it("parses metadata without execution/providers and shows broken local shadowing", async () => {
    const { bb, harness } = await fixture({
      "/repo/.bb/workflows/loop.js": "invalid local source",
      "/shared/loop.js": source,
      "/shared/shared-only.js": source,
      "/shared/subdir/hidden.js": source,
    });
    try {
      const result = await catalogWorkflows(bb, { projectId: "project-test", threadId: "thread-test" }, "/shared");
      expect(result.entries).toHaveLength(3);
      expect(result.entries).toContainEqual(expect.objectContaining({ lookupName: "loop", scope: "local", selected: true, diagnostic: expect.stringContaining("syntax") }));
      expect(result.entries).toContainEqual(expect.objectContaining({ lookupName: "loop", scope: "shared", selected: false, shadowedBy: "/repo/.bb/workflows/loop.js" }));
      expect(result.entries).toContainEqual(expect.objectContaining({ lookupName: "shared-only", scope: "shared", selected: true, metadata: expect.objectContaining({ name: "metadata-name", inputSchema: expect.objectContaining({ type: "object" }) }) }));
      expect(harness.sdk.callsTo("providers.list")).toHaveLength(0);
      expect(harness.sdk.callsTo("threads.spawn")).toHaveLength(0);
      expect(harness.sdk.callsTo("files.read").every(([input]) => (input as { hostId: string }).hostId === "host-origin")).toBe(true);
    } finally { await harness.dispose(); }
  });

  it.each([
    Object.assign(new Error("missing shared root"), { status: 404, code: "ENOENT" }),
    Object.assign(new Error("not a directory"), { status: 400, code: "invalid_path" }),
    Object.assign(new Error("origin host offline"), { status: 503, code: "host_offline" }),
  ])("reports unavailable roots rather than claiming an exhaustive empty library: %s", async (error) => {
    const { bb, harness } = await fixture({});
    harness.sdk.stub("hosts.directory", async () => { throw error; });
    try {
      const result = await catalogWorkflows(bb, { projectId: "project-test", threadId: "thread-test" }, "/shared");
      expect(result.scanIncomplete).toBe(true);
      expect(result.diagnostics.join(" ")).toContain(error.message);
      expect(result.diagnostics.join(" ")).toContain("host-origin");
    } finally { await harness.dispose(); }
  });

  it("reports missing names and bounds metadata and total serialized output", async () => {
    const hugeSource = `export const meta = { name: "huge", description: ${JSON.stringify("x".repeat(9_000))}, phases: [] }; return null;`;
    const { bb, harness } = await fixture({
      "/shared/huge.js": hugeSource,
      ...Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`/shared/loop-${index}.js`, source.replace("Reusable loop", "x".repeat(7_000))])),
    });
    try {
      const context = { projectId: "project-test", threadId: "thread-test" };
      const huge = await catalogWorkflows(bb, context, "/shared", { name: "huge" });
      expect(huge.entries[0]).toMatchObject({ metadataOmitted: true, metadata: null });
      expect(huge.outputTruncated).toBe(true);
      const all = await catalogWorkflows(bb, context, "/shared", { limit: 50 });
      expect(all.outputTruncated).toBe(true);
      expect(all.omittedEntries).toBeGreaterThan(0);
      expect(Buffer.byteLength(JSON.stringify(all))).toBeLessThanOrEqual(65_536);
      const missing = await catalogWorkflows(bb, context, "/shared", { name: "missing" });
      expect(missing.entries).toEqual([]);
      expect(missing.diagnostics.join(" ")).toContain("No workflow found");
    } finally { await harness.dispose(); }
  });

  it("never reads directory-supplied paths and diagnoses symlink confinement failures", async () => {
    const { bb, harness } = await fixture({});
    harness.sdk.stub("hosts.directory", async ({ path }) => ({ directory: path, parent: null, roots: [], entries: [
      { kind: "file", name: "escape.js", path: "/outside/secret.js" },
      { kind: "file", name: "../bad.js", path: "/outside/bad.js" },
    ] }));
    harness.sdk.stub("files.read", async () => { throw Object.assign(new Error("symlink escape"), { status: 400, code: "invalid_path" }); });
    try {
      const result = await catalogWorkflows(bb, { projectId: "project-test", threadId: "thread-test" }, "/shared");
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]).toMatchObject({ scope: "local", selected: true, diagnostic: expect.stringContaining("symlink escape") });
      expect(result.entries[1]).toMatchObject({ scope: "shared", selected: false });
      expect(harness.sdk.callsTo("files.read").map(([input]) => input)).toEqual([
        { hostId: "host-origin", rootPath: "/repo", path: "/repo/.bb/workflows/escape.js" },
        { hostId: "host-origin", rootPath: "/shared", path: "/shared/escape.js" },
      ]);
    } finally { await harness.dispose(); }
  });

  it("refuses a directory browse that resolves outside the selected root", async () => {
    const { bb, harness } = await fixture({});
    harness.sdk.stub("hosts.directory", async () => ({ directory: "/outside", parent: null, roots: [], entries: [{ kind: "file", name: "secret.js", path: "/outside/secret.js" }] }));
    try {
      const result = await catalogWorkflows(bb, { projectId: "project-test", threadId: "thread-test" }, "/shared");
      expect(result.scanIncomplete).toBe(true);
      expect(result.entries).toEqual([]);
      expect(result.diagnostics.join(" ")).toContain("inside the origin workspace");
      expect(harness.sdk.callsTo("files.read")).toHaveLength(0);
    } finally { await harness.dispose(); }
  });

  it("reports scan and output truncation explicitly", async () => {
    const { bb, harness } = await fixture({ "/shared/one.js": source, "/shared/two.js": source }, true);
    try {
      const result = await catalogWorkflows(bb, { projectId: "project-test", threadId: "thread-test" }, "/shared", { limit: 1 });
      expect(result.entries).toHaveLength(1);
      expect(result.outputTruncated).toBe(true);
      expect(result.scanIncomplete).toBe(true);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(65_536);
    } finally { await harness.dispose(); }
  });
});
