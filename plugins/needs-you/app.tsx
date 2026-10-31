import { useEffect, useState } from "react";
import { definePluginApp, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./contract";
import { sourceLabel, viewInputSchema, type ViewInput } from "./model";
import { RequestDetail, age } from "./request-detail";
import { useInbox } from "./use-inbox";
import { useInboxBadge } from "./badge";
import "./app.css";

const FILTERS = [
  ["open", "Open"], ["question", "Questions"], ["permission", "Permissions"],
  ["blocker", "Blockers"], ["review", "Review"], ["snoozed", "Snoozed"], ["history", "History"],
] as const;

function InboxScope({ projectId }: { projectId?: string }) {
  const [filter, setFilter] = useState<ViewInput["filter"]>("open");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [threadLimit, setThreadLimit] = useState(2000);
  const [selected, setSelected] = useState<string | null>(null);
  const inbox = useInbox(viewInputSchema.parse({ ...(projectId ? { projectId } : {}), filter, search, offset, threadLimit }));
  const data = inbox.data;
  const item = data?.items.find(item => item.id === selected) ?? data?.items[0];
  const disabled = inbox.stale || inbox.refreshing || inbox.pending !== null;
  const allClear = data && !data.limited && !inbox.stale && data.open === 0 && filter === "open" && !search && offset === 0;
  function chooseFilter(value: ViewInput["filter"]) { setFilter(value); setOffset(0); }
  return <>
    <p className="needs-subtitle">{data ? `${data.loadedThreads} visible threads scanned · ${data.open}${data.limited ? "+" : ""} open · ${data.snoozed} snoozed`
      : "Loading attention requests…"}</p>
    <div className="needs-toolbar">
      <nav className="needs-tabs" aria-label="Request filters">{FILTERS.map(([id, label]) => <button key={id}
        aria-pressed={filter === id} onClick={() => chooseFilter(id)}>{label}</button>)}</nav>
      <button disabled={inbox.refreshing} onClick={() => void inbox.refresh(true)}>Refresh</button>
    </div>
    <div className="needs-search"><input type="search" maxLength={200} aria-label="Filter requests" placeholder="Filter requests…"
      value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} />
      <span>Blocking asks first · Oldest first</span></div>
    {inbox.stale && (data || inbox.error || inbox.connection !== "connected") && <div className="needs-notice" role="alert">
      {inbox.error ? "Could not refresh the inbox." : inbox.connection !== "connected" ? "Connection lost." : "Inbox data is stale."}
      {data ? " Showing last-known requests. Counts may be incomplete; status changes are unavailable." : " Inbox status is unknown, not all clear."} Use Refresh to retry.
    </div>}
    {data?.limited && <div className="needs-notice" role="status">Partial coverage: {data.loadedThreads} threads scanned. Counts are lower bounds, not a complete inbox.
      {threadLimit < 10_000 ? <button disabled={inbox.refreshing} onClick={() => { setThreadLimit(limit => limit + 2000); setOffset(0); }}>Scan more threads</button>
        : " Choose a project to narrow the scan (10,000-thread limit)."}</div>}
    {inbox.actionError && <p className="needs-notice" role="alert">{inbox.actionError}</p>}
    <div className="needs-content" aria-busy={inbox.refreshing}>
      {data && item ? <>
        <section className="needs-list" aria-label="Attention requests">
          <p className="needs-list-caption">{offset + 1}–{offset + data.items.length} of {data.matching} matching requests</p>
          <ul tabIndex={0} aria-label="Requests in this page">{data.items.map(request => <li key={request.id}><button className="needs-request"
            aria-pressed={item.id === request.id} aria-controls="needs-request-detail" onClick={() => setSelected(request.id)}>
            <span className="needs-request-top"><span className={`needs-kind needs-kind-${request.kind}`}>{request.kind}</span><span>{age(request.raisedAt)}</span></span>
            <span className="needs-request-title">{request.title}</span>
            <span className="needs-request-thread">{request.threadTitle}</span>
            <span className="needs-request-meta">{request.projectName} · {sourceLabel(request.source)}</span>
          </button></li>)}</ul>
        </section>
        <RequestDetail item={item} disabled={disabled} onChange={input => { void inbox.change(input); }} />
      </> : data && <div className="needs-empty">
        <h2>{allClear ? "Nothing needs you right now." : inbox.stale ? "Inbox status is unknown." : "No matching requests"}</h2>
        <p>{allClear ? "No open requests in this scope. Threads may still be working; this does not mean their work is complete."
          : data.limited ? "No matching requests among scanned threads. Scan more or choose a project before concluding all clear."
          : "Try another filter or project. Snoozed requests and handled history are separate from Open."}</p>
        {allClear && data.snoozed > 0 && <p>{data.snoozed} request(s) remain snoozed.</p>}
        {offset > 0 && <button onClick={() => setOffset(0)}>Back to first page</button>}
      </div>}
    </div>
    {data && (offset > 0 || data.hasMore) && <div className="needs-pagination">
      <button disabled={offset === 0 || inbox.refreshing} onClick={() => setOffset(value => Math.max(0, value - 100))}>Previous requests</button>
      <button disabled={!data.hasMore || inbox.refreshing} onClick={() => setOffset(value => value + 100)}>Next requests</button>
    </div>}
    <p className="needs-announcement" role="status" aria-live="polite">{inbox.message}</p>
    <p className="needs-footnote">Explicit asks, plus labeled Kanban Blocked / Review fallbacks. Counts are requests, not unread messages.
      {data && <> Last checked {new Date(data.checkedAt).toLocaleTimeString()}.</>}</p>
  </>;
}

export function NeedsYouPage() {
  const rpc = useRpc<typeof rpcContract>();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void rpc.call("projects_list", null).then(result => {
      if (active) { setProjects(result.projects); setError(false);
        setProjectId(current => result.projects.some(project => project.id === current) ? current : ""); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [rpc, retry]);
  return <div className="needs-page">
    <header className="needs-header"><h1>Needs you</h1><label>Project <select value={projectId}
      onChange={event => setProjectId(event.target.value)}><option value="">All projects</option>
      {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></header>
    {error && <div className="needs-notice" role="alert">Project choices unavailable. <button onClick={() => setRetry(value => value + 1)}>Retry projects</button></div>}
    <InboxScope key={projectId} projectId={projectId || undefined} />
  </div>;
}

export default definePluginApp(app => {
  app.slots.navPanel({ id: "inbox", title: "Needs you", icon: "needs-you/attention", path: "inbox",
    component: NeedsYouPage, experimental_useBadge: useInboxBadge });
});
