import type Database from "better-sqlite3";
import { ftsQuery, normalizeTitle, oneTypo, queryWords } from "./search-query";

export type IndexedDocument = {
  path: string; title: string; folder: string; headings: string; body: string;
  added: number | null; modified: number; fingerprint: string;
};
export type SearchInput = {
  query: string; folder: string; sort: "smart" | "added" | "updated"; offset: number; limit: number;
};
export type SearchDocument = Pick<IndexedDocument, "path" | "title" | "folder" | "added" | "modified"> & { snippet: string };

export class SearchIndex {
  constructor(private db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        path TEXT PRIMARY KEY, title TEXT NOT NULL, folder TEXT NOT NULL,
        headings TEXT NOT NULL, body TEXT NOT NULL, added REAL, modified REAL NOT NULL,
        fingerprint TEXT NOT NULL, normalizedTitle TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS document_fts USING fts5(title, headings, body, tokenize='unicode61 remove_diacritics 2');
      CREATE VIRTUAL TABLE IF NOT EXISTS document_vocab USING fts5vocab(document_fts, 'row');
      CREATE TABLE IF NOT EXISTS index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS document_dates (source TEXT, path TEXT, added REAL, PRIMARY KEY(source,path));
    `);
  }

  source(): string | null {
    return (this.db.prepare("SELECT value FROM index_meta WHERE key='source'").get() as { value: string } | undefined)?.value ?? null;
  }
  hasSource(source: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM index_meta WHERE key=?").get("seen:" + source);
  }
  dateFor(source: string, path: string): { added: number | null } | undefined {
    return this.db.prepare("SELECT added FROM document_dates WHERE source=? AND path=?").get(source, path) as { added: number | null } | undefined;
  }
  snapshot(): IndexedDocument[] {
    return this.db.prepare("SELECT path,title,folder,headings,body,added,modified,fingerprint FROM documents").all() as IndexedDocument[];
  }
  get(path: string): IndexedDocument | undefined {
    return this.db.prepare("SELECT * FROM documents WHERE path=?").get(path) as IndexedDocument | undefined;
  }
  paths(): string[] {
    return (this.db.prepare("SELECT path FROM documents ORDER BY path").all() as Array<{ path: string }>).map(row => row.path);
  }
  folders(): Array<{ name: string; count: number }> {
    return this.db.prepare("SELECT folder AS name, COUNT(*) AS count FROM documents GROUP BY folder ORDER BY folder").all() as Array<{ name: string; count: number }>;
  }
  replace(rows: IndexedDocument[], source: string): void {
    this.db.transaction(() => {
      const existing = new Map((this.db.prepare("SELECT rowid,path,fingerprint FROM documents").all() as Array<{ rowid: number; path: string; fingerprint: string }>).map(row => [row.path, row]));
      const retained = new Set(rows.map(row => row.path)), sourceChanged = this.source() !== source;
      const remove = this.db.prepare("DELETE FROM documents WHERE rowid=?");
      const removeFts = this.db.prepare("DELETE FROM document_fts WHERE rowid=?");
      const insert = this.db.prepare(`INSERT INTO documents (path,title,folder,headings,body,added,modified,fingerprint,normalizedTitle)
        VALUES (@path,@title,@folder,@headings,@body,@added,@modified,@fingerprint,@normalizedTitle)`);
      const dates = this.db.prepare("INSERT INTO document_dates VALUES (?,?,?) ON CONFLICT DO NOTHING");
      for (const old of existing.values()) if (!retained.has(old.path) || sourceChanged) {
        removeFts.run(old.rowid); remove.run(old.rowid); existing.delete(old.path);
      }
      for (const row of rows) {
        const old = existing.get(row.path);
        if (old?.fingerprint !== row.fingerprint) {
          if (old) { removeFts.run(old.rowid); remove.run(old.rowid); }
          const result = insert.run({ ...row, normalizedTitle: normalizeTitle(row.title) });
          this.db.prepare("INSERT INTO document_fts (rowid,title,headings,body) VALUES (?,?,?,?)")
            .run(result.lastInsertRowid, row.title, row.headings + "\n" + row.path, row.body);
        }
        dates.run(source, row.path, row.added);
      }
      const meta = this.db.prepare("INSERT INTO index_meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
      meta.run("source", source); meta.run("seen:" + source, "1");
    })();
  }

  private correction(query: string): string | null {
    if (query.includes('"')) return null; // Never silently loosen an explicit phrase.
    let changed = false;
    const words = queryWords(query).map(word => {
      if (word.length < 4 || this.db.prepare("SELECT 1 FROM document_vocab WHERE term=?").get(word)) return word;
      // Bound the vocabulary work per token; large corpora never trigger an unbounded edit-distance scan.
      const candidates = this.db.prepare("SELECT term FROM document_vocab WHERE length(term) BETWEEN ? AND ? ORDER BY doc DESC LIMIT 2000")
        .all(word.length - 1, word.length + 1) as Array<{ term: string }>;
      const match = candidates.find(({ term }) => oneTypo(word, term));
      if (match) { changed = true; return match.term; }
      return word;
    });
    return changed ? words.join(" ") : null;
  }

  search(input: SearchInput, now = Date.now()) {
    let match = ftsQuery(input.query), correctedQuery: string | null = null;
    const folderWhere = input.folder ? " AND d.folder=@folder" : "";
    const params = { folder: input.folder, limit: input.limit, offset: input.offset,
      now, title: normalizeTitle(input.query), match };
    const from = () => match
      ? `FROM documents d JOIN document_fts ON d.rowid=document_fts.rowid WHERE document_fts MATCH @match${folderWhere}`
      : `FROM documents d WHERE 1=1${folderWhere}`;
    const count = () => (this.db.prepare(`SELECT COUNT(*) AS total ${from()}`).get(params) as { total: number }).total;
    // Punctuation-only input is a literal empty result, not a surprising all-documents search.
    if (input.query.trim() && !match) return { documents: [], total: 0, hasMore: false, correctedQuery };
    let total = count();
    if (match && !total && (correctedQuery = this.correction(input.query))) {
      match = ftsQuery(correctedQuery); params.match = match; total = count();
    }
    const order = input.sort === "updated" ? "d.modified DESC" : input.sort === "added" || !match
      ? "d.added DESC" : `CASE WHEN d.normalizedTitle=@title THEN 1 ELSE 0 END DESC,
        (-bm25(document_fts,10,4,1)) * (1 + CASE WHEN d.added IS NULL THEN 0 ELSE
          0.08 / (1 + max(0,@now-d.added) / 604800000.0) END) DESC, d.added DESC`;
    const snippet = match ? "snippet(document_fts,2,char(1),char(2),'…',32)" : "substr(d.body,1,220)";
    const documents = this.db.prepare(`SELECT d.path,d.title,d.folder,d.added,d.modified,${snippet} AS snippet ${from()}
      ORDER BY ${order}, d.path ASC LIMIT @limit OFFSET @offset`).all(params) as SearchDocument[];
    return { documents, total, hasMore: input.offset + documents.length < total, correctedQuery };
  }
}
