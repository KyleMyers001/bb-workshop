import { useEffect, useRef } from "react";
import type { ReadResult } from "./contract";
import { ReaderMarkdown } from "./reader-markdown";

export function dateLabel(value: number | null): string {
  if (value === null) return "date unknown";
  const days = Math.floor(Math.max(0, Date.now() - value) / 86_400_000);
  if (!days) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(value);
}

export function DocumentReader({ document, error, path, focus, anchor, onFocus, onBack, onLink, onRetry }: {
  document: ReadResult | null; error: string | null; path: string | null; focus: boolean;
  anchor: string; onFocus: () => void; onBack: () => void;
  onLink: (href: string) => void; onRetry: () => void;
}) {
  const scroll = useRef<HTMLDivElement>(null), previousPath = useRef<string | null>(null);
  function jump(id: string) {
    const normalized = id.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
    const target = Array.from(scroll.current?.querySelectorAll<HTMLElement>("[id]") ?? [])
      .find(node => node.id === "wb-heading-" + id || node.id === "wb-heading-" + normalized);
    if (target) { target.scrollIntoView({ block: "start" }); target.tabIndex = -1; target.focus({ preventScroll: true }); }
  }
  useEffect(() => {
    if (!document) return;
    if (previousPath.current !== document.path) {
      if (scroll.current) scroll.current.scrollTop = 0;
      previousPath.current = document.path;
    }
    if (anchor) jump(anchor);
  }, [document?.path, anchor]);
  return <section className={`wb-reader${focus ? " wb-focus-reader" : ""}`} aria-label="Document reader">
    <header className="wb-reader-toolbar">
      {focus && <button type="button" onClick={onBack}>← Back to library</button>}
      <span className="wb-filepath" title={path ?? ""}>{path ?? "Document preview"}</span>
      {!focus && document && <button type="button" onClick={onFocus}>Focus ↗</button>}
      {focus && document && <select className="wb-mobile-outline" aria-label="Jump to heading" value=""
        onChange={event => jump(event.target.value)}><option value="">On this page…</option>
        {document.outline.map(heading => <option key={heading.id} value={heading.id}>{heading.text}</option>)}
      </select>}
    </header>
    <div className="wb-reading-layout">
      <div className="wb-reader-scroll" ref={scroll} role="region" aria-label="Document content" tabIndex={0}>
        {error ? <div role="alert" className="wb-error">{error} <button type="button" onClick={onRetry}>Retry document</button></div>
          : !document ? <p className="wb-placeholder">{path ? "Loading document…" : "Choose a document to start reading."}</p>
          : <article className="wb-document">
            <p className="wb-document-meta">Added {dateLabel(document.added)} · Updated {dateLabel(document.modified)}</p>
            {!document.outline.some(heading => heading.depth === 1) && <h1>{document.title}</h1>}
            <ReaderMarkdown content={document.content} path={document.path} onLink={href => {
              if (href.startsWith("#")) { try { jump(decodeURIComponent(href.slice(1))); } catch { onLink(href); } }
              else onLink(href);
            }} />
          </article>}
      </div>
      {focus && document && document.outline.length > 0 && <nav className="wb-outline" aria-label="On this page">
        <p>On this page</p>{document.outline.map(heading => <button type="button" key={heading.id}
          data-depth={heading.depth} onClick={() => jump(heading.id)}>{heading.text}</button>)}
      </nav>}
    </div>
    <footer className="wb-reader-footer"><span>Read only · Rendered Markdown</span>{document &&
      <span>{Math.max(1, Math.ceil(document.content.split(/\s+/).length / 220))} min read</span>}</footer>
  </section>;
}
