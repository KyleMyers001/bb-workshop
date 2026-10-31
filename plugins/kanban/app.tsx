import { useEffect, useState } from "react";
import {
  definePluginApp, experimental_useProviders, useBbNavigate, useRpc,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./contract";
import { COLUMNS } from "./model";
import { BoardCard } from "./board-card";
import { useBoard } from "./use-board";
import "./app.css";

function ProjectBoard({ projectId, projects }: {
  projectId?: string;
  projects: Array<{ id: string; name: string }>;
}) {
  const board = useBoard(projectId);
  const navigate = useBbNavigate();
  const { providers } = experimental_useProviders();
  const [search, setSearch] = useState("");
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const filtered = board.cards?.filter(card =>
    `${card.title} ${card.note}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <>
    <div className="kanban-toolbar">
      <input type="search" aria-label="Filter threads" placeholder="Filter threads…"
        value={search} onChange={event => setSearch(event.target.value)} />
      <span className="kanban-summary" role="status">
        {board.cards === null ? "Loading threads…" : `${filtered?.length} of ${board.cards.length} threads`}
        {board.connection !== "connected" && " · Reconnecting…"}
      </span>
      <button type="button" disabled={board.refreshing} onClick={() => void board.refresh()}>Refresh</button>
      <button type="button" className="kanban-new" onClick={() => navigate.toCompose({ ...(projectId ? { projectId } : {}), focusPrompt: true })}>New thread</button>
    </div>
    {board.error && <div role="alert" className="kanban-error">{board.error}{" "}
      <button type="button" onClick={() => void board.refresh()}>Retry</button></div>}
    <p className="kanban-hint">Agents update cards as they work. Drag a card or choose its column.</p>
    <div className="kanban-columns" role="region" aria-label="Thread board" tabIndex={0} aria-busy={board.refreshing}>
      {COLUMNS.map(column => {
        const cards = filtered?.filter(card => card.column === column.id) ?? [];
        return <section key={column.id} className="kanban-column" data-column={column.id}
          data-over={over === column.id || undefined} aria-labelledby={`column-${column.id}`}
          onDragOver={event => {
            if (!dragged || board.pending !== null) return;
            event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOver(column.id);
          }}
          onDragLeave={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
          }}
          onDrop={event => {
            event.preventDefault(); setOver(null); setDragged(null);
            const card = board.cards?.find(item => item.id === dragged);
            if (card) void board.move(card, column.id);
          }}>
          <header className="kanban-column-header">
            <span className="kanban-column-dot" aria-hidden="true" />
            <h2 id={`column-${column.id}`}>{column.label}</h2>
            <span className="kanban-count">{cards.length}<span className="kanban-sr-only"> threads</span></span>
          </header>
          <div className="kanban-column-cards">
            {cards.map(card => <BoardCard key={card.id} card={card}
              disabled={board.pending !== null}
              projectName={!projectId ? projects.find(project => project.id === card.projectId)?.name ?? card.projectId : undefined}
              providerName={providers.find(provider => provider.id === card.providerId)?.displayName ?? card.providerId}
              onOpen={() => navigate.toThread(card.id, { split: true })}
              onMove={next => void board.move(card, next)}
              onDrag={setDragged} onDragEnd={() => { setDragged(null); setOver(null); }} />)}
            {board.cards !== null && cards.length === 0 && <p className="kanban-empty">
              {search ? "No matching threads" : "No threads here"}
            </p>}
          </div>
        </section>;
      })}
    </div>
    {board.hasMore && <div className="kanban-load"><button type="button" disabled={board.refreshing}
      onClick={board.loadMore}>Load more threads</button></div>}
    <span className="kanban-sr-only" role="status" aria-live="polite">{board.announcement}</span>
  </>;
}

export function KanbanPage() {
  const rpc = useRpc<typeof rpcContract>();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }> | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    rpc.call("projects_list").then(result => {
      if (cancelled) return;
      setProjects(result.projects); setError(null);
      setSelected(current => result.projects.some(project => project.id === current) ? current : "");
    }, cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; };
  }, [rpc, retry]);
  return <div className="kanban-page">
    <div className="kanban-project-bar">
      <label htmlFor="kanban-project">Project</label>
      <select id="kanban-project" value={selected} onChange={event => setSelected(event.target.value)}>
        {projects === null && <option value="">Loading projects…</option>}
        {projects?.length === 0 && <option value="">No projects</option>}
        {!!projects?.length && <option value="">All projects</option>}
        {projects?.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <span className="kanban-project-caption">One thread. One card.</span>
    </div>
    {error && <div role="alert" className="kanban-error">{error}{" "}
      <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
    {projects && projects.length > 0 ? <ProjectBoard key={selected} projectId={selected || undefined} projects={projects} />
      : <p className="kanban-hint">{projects === null ? "Loading board…" : "Create a project to start tracking threads."}</p>}
  </div>;
}

export default definePluginApp(app => {
  app.slots.navPanel({
    id: "board", title: "Kanban", icon: "ListTodo", path: "board", component: KanbanPage,
  });
});
