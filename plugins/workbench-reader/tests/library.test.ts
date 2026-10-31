import Database from "better-sqlite3";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createLibrary } from "../library";
import { SearchIndex } from "../search-index";
import { sourceConfig, type SourceConfig } from "../source";

it("serves the last complete index without waiting for an in-flight background scan", async () => {
  const root = await mkdtemp(join(tmpdir(), "workbench-latency-"));
  await mkdir(join(root, "Plans"));
  await writeFile(join(root, "Plans", "one.md"), "# One\n\nCurrent document.");
  const db = new Database(":memory:"), config = sourceConfig(root, "Plans");
  let blockNext = false, release!: (config: SourceConfig) => void;
  const deferred = new Promise<SourceConfig>(resolve => { release = resolve; });
  const library = createLibrary(new SearchIndex(db), () => {
    if (blockNext) { blockNext = false; return deferred; }
    return Promise.resolve(config);
  }, new AbortController().signal);
  await library.refresh(); blockNext = true;
  const background = library.refresh(true);
  try {
    const ready = await Promise.race([
      library.search({ query: "current", folder: "", sort: "smart", offset: 0, limit: 50 }).then(result => result.total),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 100)),
    ]);
    expect(ready).toBe(1);
  } finally { release(config); await background; db.close(); }
});
