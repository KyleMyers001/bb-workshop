import { useState } from "react";
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArchiveRow } from "./archive-row";
import { PAGE_SIZE, useArchivedThreads } from "./use-archived-threads";

function ArchivedPage() {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const state = useArchivedThreads(query, offset, revision);
  function search(next: string) {
    setQuery(next.trim());
    setOffset(0);
    setRevision((current) => current + 1);
  }
  return (
    <div role="region" aria-label="Archived thread browser" className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-5">
        <p className="text-sm text-muted-foreground">
          Browse archived conversations across your projects. Opening a thread
          does not unarchive it or start an agent.
        </p>
        <form role="search" className="flex flex-wrap gap-2" onSubmit={(event) => {
          event.preventDefault(); search(draft);
        }}>
          <Input type="search" aria-label="Search archived threads"
            placeholder="Search titles and messages…" className="min-w-40 flex-1"
            value={draft} onChange={(event) => setDraft(event.target.value)} />
          <Button type="submit">Search</Button>
          {(query || draft) && <Button type="button" variant="outline"
            onClick={() => { setDraft(""); search(""); }}>Clear search</Button>}
          <Button type="button" variant="outline"
            onClick={() => setRevision((current) => current + 1)}>Refresh</Button>
        </form>
        {state.status === "loading" && <p role="status" className="text-sm text-muted-foreground">
          Loading archived threads…
        </p>}
        {state.status === "error" && <p role="alert" className="text-sm text-destructive">
          {state.message} Use Refresh to retry.
        </p>}
        {state.status === "ready" && <>
          {state.page.matchCount !== null && <p role="status" className="text-xs text-muted-foreground">
            {state.page.matchCount} matches in archived history; showing {state.page.threads.length} visible results.
            {state.page.matchCount > PAGE_SIZE && " Search returns up to 50 results; refine your query for more specific matches."}
          </p>}
          {state.page.threads.length === 0 ? <p role="status"
            className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {query ? "No matching archived threads." : "No archived threads yet."}
          </p> : <ul aria-label="Archived threads"
            className="divide-y divide-border rounded-lg border border-border bg-card">
            {state.page.threads.map((thread) => <ArchiveRow key={thread.id} thread={thread}
              project={state.page.projects[thread.projectId] ?? thread.projectId} />)}
          </ul>}
          {!query && <nav aria-label="Archive pagination" className="flex items-center justify-between gap-2">
            <Button variant="outline" disabled={offset === 0}
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}>Previous page</Button>
            <span className="text-xs text-muted-foreground">Page {offset / PAGE_SIZE + 1}</span>
            <Button variant="outline" disabled={!state.page.hasNext}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}>Next page</Button>
          </nav>}
        </>}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({ id: "archived", title: "Archived", icon: "Archive",
    path: "archived", component: ArchivedPage });
});
