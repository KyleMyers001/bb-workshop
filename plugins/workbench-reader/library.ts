import { readDocument, scanFiles } from "./files";
import { parseDocument } from "./parse-document";
import { resolveDocumentLink } from "./links";
import { SearchIndex, type IndexedDocument, type SearchInput } from "./search-index";
import type { SourceConfig } from "./source";

type Status = {
  root: string; folders: Array<{ name: string; count: number }>;
  indexedAt: number; warnings: string[];
};
export function addedDate(created: number | null, existing: { added: number | null } | undefined,
  initial: boolean, now: number): number | null {
  return existing ? existing.added : created ?? (initial ? null : now);
}

export function createLibrary(index: SearchIndex, getConfig: () => Promise<SourceConfig>, signal: AbortSignal) {
  let pending: Promise<Status> | null = null;
  let status: Status | null = null, activeKey = "";
  const keyOf = (config: SourceConfig) => JSON.stringify([config.root, [...config.folders].sort()]);
  async function refresh(force = false): Promise<Status> {
    signal.throwIfAborted();
    if (pending) return pending;
    // Acquire the single-flight promise before the first asynchronous settings read.
    pending = (async () => {
      const config = await getConfig(), key = keyOf(config);
      if (!force && status && key === activeKey && Date.now() - status.indexedAt < 30_000) return status;
      const scanned = await scanFiles(config, signal), warnings = [...scanned.warnings];
      const previous = new Map((index.source() === key ? index.snapshot() : []).map(doc => [doc.path, doc]));
      const initial = !index.hasSource(key), rows: IndexedDocument[] = [];
      for (const file of scanned.files) {
        signal.throwIfAborted();
        const prior = previous.get(file.path), fingerprint = "markdown-v2:" + file.fingerprint;
        if (prior?.fingerprint === fingerprint) { rows.push(prior); continue; }
        try {
          const document = await readDocument(config, file.path);
          const parsed = parseDocument(file.path, document.content);
          rows.push({ path: file.path, folder: file.folder, title: parsed.title,
            headings: parsed.headings, body: parsed.body, fingerprint,
            added: addedDate(file.created, index.dateFor(key, file.path), initial, Date.now()),
            modified: document.modified });
        } catch {
          warnings.push(`Could not index ${file.path}; it may have moved, changed, or exceeded reading limits.`);
        }
      }
      signal.throwIfAborted();
      if (keyOf(await getConfig()) !== key) throw new Error("Document folders changed during indexing; refresh again.");
      index.replace(rows, key); activeKey = key;
      const counts = new Map(index.folders().map(folder => [folder.name, folder.count]));
      status = { root: config.root, folders: config.folders.map(name => ({ name, count: counts.get(name) ?? 0 })),
        indexedAt: Date.now(), warnings: [...new Set(warnings)].slice(0, 20) };
      return status;
    })();
    try { return await pending; }
    catch (error) {
      if (status) status = { ...status, warnings: [...new Set([
        "Index refresh failed; showing the last complete index. Use Refresh to retry.", ...status.warnings,
      ])].slice(0, 20) };
      throw error;
    } finally { pending = null; }
  }
  async function ensureCurrent(): Promise<Status> {
    signal.throwIfAborted();
    const config = await getConfig();
    // Background rescans must not stall interactive search on a large evidence tree.
    // Source-setting changes still require a complete scan before exposing results.
    if (status && keyOf(config) === activeKey) return status;
    return refresh();
  }
  return {
    refresh,
    async search(input: SearchInput) {
      const current = await ensureCurrent();
      return { ...current, ...index.search(input) };
    },
    async read(path: string) {
      await ensureCurrent();
      const config = await getConfig();
      if (keyOf(config) !== activeKey) throw new Error("Document folders changed; refresh again.");
      const metadata = index.get(path);
      if (!metadata) throw new Error("Document is no longer indexed; refresh the library.");
      const document = await readDocument(config, path), parsed = parseDocument(path, document.content);
      return { path, title: parsed.title, added: metadata.added, modified: document.modified,
        content: document.content, outline: parsed.outline };
    },
    async resolve(from: string, href: string) {
      await ensureCurrent();
      return resolveDocumentLink(index.paths(), from, href);
    },
    async settle() { await pending?.catch(() => {}); },
  };
}
