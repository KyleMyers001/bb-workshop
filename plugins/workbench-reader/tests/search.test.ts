import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { SearchIndex, type IndexedDocument } from "../search-index";

const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
const now = 1_800_000_000_000, day = 86_400_000;
function document(path: string, title: string, age: number, body = "Plugin rollout plan"): IndexedDocument {
  return { path, title, folder: path.split("/")[0]!, headings: "Rollout sequence", body,
    added: now - age * day, modified: now - age * day, fingerprint: path };
}
function setup(rows: IndexedDocument[]) {
  const db = new Database(":memory:"); databases.push(db);
  const index = new SearchIndex(db); index.replace(rows, "source"); return index;
}
const input = { query: "", folder: "", sort: "smart" as const, offset: 0, limit: 50 };

describe("local full-text ranking", () => {
  it("opens newest-added first, distinguishes updated, and puts unknown dates last", () => {
    const index = setup([
      document("Plans/old.md", "Old", 20), document("Plans/new.md", "New", 1),
      { ...document("Reports/updated.md", "Updated", 10), modified: now },
      { ...document("Plans/unknown.md", "Unknown", 3), added: null },
    ]);
    expect(index.search(input, now).documents.map(d => d.title)).toEqual(["New", "Updated", "Old", "Unknown"]);
    expect(index.search({ ...input, sort: "updated" }, now).documents[0]?.title).toBe("Updated");
  });

  it("keeps exact older titles above recent weak matches and supports prefixes and phrases", () => {
    const index = setup([
      document("Plans/exact.md", "Plugin rollout", 100),
      document("Reports/new.md", "Plugin rollout verification", 0),
      document("Reports/body.md", "Other report", 0),
    ]);
    expect(index.search({ ...input, query: "Plugin rollout" }, now).documents[0]?.path).toBe("Plans/exact.md");
    expect(index.search({ ...input, query: "verif" }, now).documents[0]?.path).toBe("Reports/new.md");
    expect(index.search({ ...input, query: '"plugin rollout"' }, now).total).toBe(3);
    expect(index.search({ ...input, query: '"rollout plugin"' }, now).total).toBe(0);
    expect(index.search({ ...input, query: "unrelated" }, now).total).toBe(0);
  });

  it("finds filenames and work IDs even when the Markdown title is different", () => {
    const index = setup([document("Reports/UNIQUE-712-verification.md", "A different title", 0, "Nothing matching")]);
    expect(index.search({ ...input, query: "UNIQUE-712" }, now).documents[0]?.title).toBe("A different title");
  });

  it("uses bounded freshness for comparable matches and title weighting over body", () => {
    const index = setup([
      document("Plans/old.md", "Search ranking", 20, "Search search search ranking"),
      document("Plans/new.md", "Search ranking", 0, "Search search search ranking"),
      document("Plans/body.md", "Unrelated title", 0, "Search ranking"),
    ]);
    expect(index.search({ ...input, query: "search ranking" }, now).documents.map(d => d.path))
      .toEqual(["Plans/new.md", "Plans/old.md", "Plans/body.md"]);
  });

  it("offers a labelled typo fallback only when exact token search is empty", () => {
    const index = setup([document("Plans/rollout.md", "Plugin rollout", 0)]);
    const fuzzy = index.search({ ...input, query: "plguin rollout" }, now);
    expect(fuzzy.documents).toHaveLength(1);
    expect(fuzzy.correctedQuery).toBe("plugin rollout");
    expect(index.search({ ...input, query: "plugin" }, now).correctedQuery).toBeNull();
    expect(index.search({ ...input, query: '"plguin rollout"' }, now).documents).toHaveLength(0);
  });

  it("treats search syntax as text, filters before paginating, and removes stale entries", () => {
    const rows = Array.from({ length: 60 }, (_, i) => document(`Plans/${i}.md`, `Plan ${i}`, i));
    rows.push(document("Reports/one.md", "One report", 0));
    const index = setup(rows);
    expect(index.search({ ...input, folder: "Reports", limit: 1 }, now)).toMatchObject({ total: 1, hasMore: false });
    expect(index.search({ ...input, offset: 50 }, now).documents).toHaveLength(11);
    expect(() => index.search({ ...input, query: 'x OR * " - : ; DROP TABLE documents;' }, now)).not.toThrow();
    index.replace([rows[0]!], "source");
    expect(index.search(input, now).total).toBe(1);
    expect(index.search({ ...input, query: "report" }, now).total).toBe(0);
    expect(index.source()).toBe("source");
  });
});
