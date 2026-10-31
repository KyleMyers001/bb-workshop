import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { effectiveStatus, requestSchema, sameCategory, type Body, type Change, type Request } from "./model";

type Row = { request_json: string; fingerprint: string };

export function createStore(bb: BbPluginApi, now = Date.now) {
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    `CREATE TABLE requests (
      id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, request_key TEXT NOT NULL,
      origin TEXT NOT NULL, request_json TEXT NOT NULL, fingerprint TEXT NOT NULL,
      UNIQUE(thread_id, origin, request_key)
    )`,
    "CREATE INDEX requests_by_thread ON requests(thread_id)",
  ]);
  const byKey = db.prepare("SELECT request_json, fingerprint FROM requests WHERE thread_id = ? AND origin = ? AND request_key = ?");
  const byId = db.prepare("SELECT request_json, fingerprint FROM requests WHERE id = ?");
  const allRows = db.prepare("SELECT request_json, fingerprint FROM requests");
  const threadRows = db.prepare("SELECT request_json, fingerprint FROM requests WHERE thread_id = ?");
  const count = db.prepare("SELECT COUNT(*) AS count FROM requests");
  const insert = db.prepare("INSERT INTO requests VALUES (?, ?, ?, ?, ?, ?)");
  const update = db.prepare("UPDATE requests SET request_json = ?, fingerprint = ? WHERE id = ?");
  const parse = (row: Row) => requestSchema.parse(JSON.parse(row.request_json));
  const origin = (source: Request["source"]) => source === "kanban" ? "kanban" : "reported";
  const write = (request: Request, fingerprint: string) => update.run(JSON.stringify(request), fingerprint, request.id);
  const forThread = (threadId: string) => (threadRows.all(threadId) as Row[]).map(parse);

  const report = db.transaction((threadId: string, key: string, body: Body,
    source: Request["source"], fingerprint = JSON.stringify(body)): Request => {
    const row = byKey.get(threadId, origin(source), key) as Row | undefined;
    const previous = row ? parse(row) : null;
    // A repeated tool call must not unsnooze or resurrect an already handled ask.
    if (row?.fingerprint === fingerprint && previous?.status !== "withdrawn") return previous!;
    if (!previous && ((source !== "kanban" &&
        forThread(threadId).filter(request => request.source !== "kanban").length >= 100) ||
        (count.get() as { count: number }).count >= 20_000)) {
      throw new Error("Request history limit reached. Reuse an existing request key.");
    }
    const timestamp = now();
    const request: Request = {
      ...body, id: previous?.id ?? randomUUID(), threadId, key, source,
      status: "open", snoozedUntil: null, version: (previous?.version ?? 0) + 1,
      raisedAt: timestamp, updatedAt: timestamp,
    };
    if (previous) write(request, fingerprint);
    else insert.run(request.id, threadId, key, origin(source), JSON.stringify(request), fingerprint);
    return request;
  });

  function withdraw(threadId: string, key: string, source: Request["source"]): Request | null {
    const row = byKey.get(threadId, origin(source), key) as Row | undefined;
    if (!row) return null;
    const request = parse(row);
    if (request.status === "withdrawn") return request;
    const next = { ...request, status: "withdrawn" as const, snoozedUntil: null,
      updatedAt: now(), version: request.version + 1 };
    write(next, row.fingerprint);
    return next;
  }

  const change = db.transaction(({ id, version, action }: Change): Request => {
    const row = byId.get(id) as Row | undefined;
    if (!row) throw new Error("Request no longer exists. Refresh the inbox.");
    const request = parse(row);
    if (request.version !== version) throw new Error("Request changed elsewhere. Refresh before acting.");
    const status = effectiveStatus(request, now());
    const allowed = action === "reopen" ? status === "handled"
      : action === "unsnooze" ? status === "snoozed"
      : action === "snooze" ? status === "open"
      : status === "open" || status === "snoozed";
    if (!allowed) throw new Error("Request state changed. Refresh before acting.");
    const next: Request = {
      ...request, status: action === "handle" ? "handled" : action === "snooze" ? "snoozed" : "open",
      snoozedUntil: action === "snooze" ? now() + 3_600_000 : null,
      updatedAt: now(), version: request.version + 1,
    };
    write(next, row.fingerprint);
    if (action === "handle" && request.source !== "kanban") {
      // The generic board signal is the fallback for this class of explicit ask.
      // Record it handled too; a later board move has a new fingerprint and reopens.
      for (const fallback of forThread(request.threadId)) {
        if (fallback.source !== "kanban" || !sameCategory(fallback, request) ||
            !["open", "snoozed"].includes(fallback.status)) continue;
        const fallbackRow = byId.get(fallback.id) as Row;
        write({ ...fallback, status: "handled", snoozedUntil: null,
          updatedAt: now(), version: fallback.version + 1 }, fallbackRow.fingerprint);
      }
    }
    return next;
  });
  return { report, withdraw, change, forThread,
    all: () => (allRows.all() as Row[]).map(parse),
    get: (id: string) => { const row = byId.get(id) as Row | undefined; return row ? parse(row) : null; },
  };
}
export type Store = ReturnType<typeof createStore>;
