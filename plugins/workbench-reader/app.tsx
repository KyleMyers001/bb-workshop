import { useEffect, useId, useRef, useState } from "react";
import { definePluginApp, useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./contract";
import { dateLabel, DocumentReader } from "./document-reader";
import { errorMessage, useDocument, useLibrary } from "./use-library";
import { queryWords } from "./search-query";
import "./app.css";

type Location = { path: string | null; focus: boolean; anchor: string };
function locationFrom(subPath: string): Location {
  if (!subPath) return { path: null, focus: false, anchor: "" };
  const [mode, ...segments] = subPath.split("/");
  if (!["file", "read"].includes(mode!)) throw new Error("Invalid Workbench document route.");
  return { path: segments.map(decodeURIComponent).join("/"), focus: mode === "read", anchor: "" };
}
function Highlight({ text, query, markers = false }: { text: string; query: string; markers?: boolean }) {
  const words = queryWords(query).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (markers) return text.split(/(\u0001[^\u0002]*\u0002)/g).map((part, i) => part.startsWith("\u0001")
    ? <mark key={i}>{part.slice(1, -1)}</mark> : part);
  if (!words.length) return text;
  return text.split(new RegExp(`(${words.join("|")})`, "ig")).map((part, i) =>
    words.some(word => new RegExp(`^${word}$`, "i").test(part)) ? <mark key={i}>{part}</mark> : part);
}

export function WorkbenchPage({ subPath }: { subPath: string }) {
  const library = useLibrary(), rpc = useRpc<typeof rpcContract>(), navigate = useBbNavigate();
  const [location, setLocation] = useState<Location>({ path: null, focus: false, anchor: "" });
  const [linkError, setLinkError] = useState<string | null>(null);
  const controlId = useId(), linkRequest = useRef(0);
  const reader = useDocument(location.path, library.revision);
  useEffect(() => {
    linkRequest.current++;
    try {
      const next = locationFrom(subPath);
      setLocation(current => current.path === next.path && current.focus === next.focus ? current : next);
      setLinkError(null);
    }
    catch { setLinkError("This document link is invalid. Choose a document from the library."); }
  }, [subPath]);
  function open(path: string, focus = location.focus, anchor = "", replace = false) {
    linkRequest.current++; setLocation({ path, focus, anchor }); setLinkError(null);
    navigate.toPluginPanel("library", { subPath: `${focus ? "read" : "file"}/${path}`, replace });
  }
  useEffect(() => {
    if (!location.path && library.data?.documents[0]) open(library.data.documents[0].path, false, "", true);
  }, [library.data, location.path]);
  async function follow(href: string) {
    if (!location.path) return;
    const request = ++linkRequest.current;
    try {
      const target = await rpc.call("resolve", { from: location.path, href });
      if (request === linkRequest.current) open(target.path, location.focus, target.anchor);
    } catch (cause) { if (request === linkRequest.current) setLinkError(errorMessage(cause)); }
  }
  const documents = library.data?.documents ?? [];
  const folders = library.data?.folders ?? [];
  const isFiltered = !!library.query.trim() || !!library.folder;
  const folderPicker = <><option value="">All documents</option>{folders.map(folder =>
    <option key={folder.name} value={folder.name}>{folder.name} ({folder.count})</option>)}</>;
  const refreshControl = <button type="button" disabled={library.refreshing || library.loading}
    onClick={() => void library.refresh()}>{library.refreshing ? "Indexing…" : "Refresh"}</button>;
  return <div className={`wb-page${location.focus ? " wb-is-focused" : ""}`}>
    {!location.focus && <header className="wb-source-bar"><span className="wb-source-path" title={library.data?.root}>Server · {library.data?.root ?? "Workbench"}</span>
      <span className="wb-read-only">Read only</span>{refreshControl}</header>}
    {library.connection !== "connected" && <p className="wb-notice" role="status">Reconnecting to BB. Results may be out of date.</p>}
    {(library.error || linkError) && <div className="wb-error" role="alert">{linkError ?? library.error} <button type="button"
      onClick={() => { if (linkError) setLinkError(null); else library.retry(); }}>{linkError ? "Dismiss" : "Retry"}</button></div>}
    {!!library.data?.warnings.length && <details className="wb-warnings"><summary>Some documents were not indexed ({library.data.warnings.length})</summary>
      <ul>{library.data.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
    <div className="wb-workspace">
      <aside className="wb-folders" aria-label="Document folders"><p>Browse</p>
        <button type="button" aria-pressed={!library.folder} onClick={() => library.setFolder("")}>All documents</button>
        {folders.map(folder => <button type="button" key={folder.name}
          aria-label={`${folder.name}, ${folder.count} ${folder.count === 1 ? "document" : "documents"}`} aria-pressed={library.folder === folder.name}
          onClick={() => library.setFolder(folder.name)}><span>{folder.name}</span><small>{folder.count}</small></button>)}
        <p className="wb-folder-note">Markdown only<br />No file changes</p></aside>
      <section className="wb-results" aria-label="Search Workbench">
        <div className="wb-search-controls"><label className="wb-sr-only" htmlFor={`${controlId}-query`}>Search titles and contents</label>
          <input id={`${controlId}-query`} type="search" maxLength={300} placeholder="Search titles and contents…" value={library.query}
            onChange={event => library.setQuery(event.target.value)} />
          <select className="wb-compact-folder" aria-label="Document folder" value={library.folder}
            onChange={event => library.setFolder(event.target.value)}>{folderPicker}</select>
          <div className="wb-sort"><label htmlFor={`${controlId}-sort`}>Sort by</label><select id={`${controlId}-sort`} value={library.sort}
            onChange={event => library.setSort(event.target.value as typeof library.sort)}>
            <option value="smart">Smart · recent boost</option><option value="added">Recently added</option><option value="updated">Recently updated</option>
          </select></div></div>
        <div className="wb-results-status" role="status" aria-live="polite"><span>{library.loading ? "Searching…" : `${library.data?.total ?? 0} ${library.data?.total === 1 ? "document" : "documents"}`}</span>
          <span>{library.sort === "updated" ? "Latest updates" : library.sort === "added" || !library.query.trim() ? "Newest added first" : "Relevance + recency"}</span></div>
        {library.data?.correctedQuery && <p className="wb-correction">No exact matches. Showing results for <strong>{library.data.correctedQuery}</strong>.</p>}
        <div className="wb-result-list" aria-busy={library.loading}>
          {documents.map(document => <button type="button" className="wb-result" key={document.path}
            aria-current={document.path === location.path ? "true" : undefined} onClick={() => open(document.path, false)}>
            <span className="wb-result-meta"><span>{document.folder}</span><span>{library.sort === "updated" ? "Updated " + dateLabel(document.modified) : "Added " + dateLabel(document.added)}</span></span>
            <strong><Highlight text={document.title} query={library.data?.correctedQuery ?? library.query} /></strong>
            <span className="wb-result-snippet"><Highlight text={document.snippet} query={library.query} markers /></span>
          </button>)}
          {!library.loading && !library.error && !documents.length && <p className="wb-placeholder">{isFiltered
            ? "No matching documents. Try a broader term or another folder."
            : "No Markdown documents found. Check your document folders in the Workbench plugin settings."}</p>}
          {library.data?.hasMore && <button className="wb-load-more" type="button" disabled={library.loading} onClick={library.loadMore}>Load more documents</button>}
        </div>
      </section>
      <DocumentReader document={reader.document} error={reader.error} path={location.path} focus={location.focus} anchor={location.anchor}
        toolbarActions={location.focus ? refreshControl : undefined}
        onFocus={() => location.path && open(location.path, true)} onBack={() => location.path && open(location.path, false)}
        onLink={href => void follow(href)} onRetry={reader.retry} />
    </div>
  </div>;
}

export default definePluginApp(app => {
  app.slots.navPanel({ id: "library", title: "Workbench", icon: "BookOpen", path: "library", component: WorkbenchPage });
});
