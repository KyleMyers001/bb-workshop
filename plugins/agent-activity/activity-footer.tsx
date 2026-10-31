import { useRef, useState } from "react";
import {
  experimental_useSidebarThreads, useBbNavigate, useRealtimeConnectionState,
} from "@get-bb/plugin-sdk/app";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import { groupActivity, type ActivityGroup, type SidebarThread } from "./activity";

const groupLabels: Record<ActivityGroup, string> = {
  running: "Running", waiting: "Needs you", errors: "Errors",
};
const rowLabels: Record<ActivityGroup, string> = {
  running: "Running", waiting: "Question or approval", errors: "Open to inspect error",
};
const emptyLabels: Record<ActivityGroup, string> = {
  running: "No agents running right now.",
  waiting: "No agents waiting for your input.",
  errors: "No agent errors.",
};

function ActivityList({ rows, group, projects, dismiss, onNavigate }: {
  rows: readonly SidebarThread[];
  group: ActivityGroup;
  projects: ReadonlyMap<string, string>;
  dismiss: () => void;
  onNavigate?: () => void;
}) {
  const [limit, setLimit] = useState(30);
  const navigate = useBbNavigate();
  return <>
    <header className="aa-heading">
      <h2>{groupLabels[group]} <span>· All projects</span></h2>
      <button className="aa-close" aria-label="Close activity" onClick={dismiss}>×</button>
    </header>
    <div className="aa-list">
      {rows.length === 0 && <p className="aa-empty">{emptyLabels[group]}</p>}
      {rows.slice(0, limit).map(thread => <a key={thread.id} href={thread.href}
        className={`aa-row aa-${group}`} onClick={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          dismiss();
          navigate.toThread(thread.id);
          onNavigate?.();
        }}>
        <span className="aa-dot" aria-hidden="true" />
        <span className="aa-row-text">
          <span className="aa-title">{thread.displayTitle}</span>
          <span className="aa-meta">{projects.get(thread.projectId) ?? thread.projectId} · {rowLabels[group]}</span>
        </span>
        <span className="aa-arrow" aria-hidden="true">›</span>
      </a>)}
      {rows.length > limit && <button className="aa-more"
        onClick={() => setLimit(current => current + 30)}>Show more ({rows.length - limit})</button>}
    </div>
    <p className="aa-note">Open a thread to {group === "waiting" ? "answer or review" : "see its latest activity"}.</p>
  </>;
}

export function ActivityFooter({ onNavigate }: { onNavigate?: () => void }) {
  const state = experimental_useSidebarThreads();
  const connection = useRealtimeConnectionState();
  const [openGroup, setOpenGroup] = useState<ActivityGroup | null>(null);
  const triggers = useRef<Partial<Record<ActivityGroup, HTMLButtonElement>>>({});
  const groups = groupActivity(state.threads);
  const projects = new Map(state.projects.map(project => [project.id, project.name]));
  if (state.status !== "ready") return <span className="aa-unavailable" role="status">
    {state.status === "loading" ? "Loading activity…" : "Activity unavailable"}
  </span>;
  // A disconnected cache is not reliable evidence that agents are still running.
  if (connection !== "connected") return <span className="aa-unavailable" role="status">
    Activity reconnecting…
  </span>;
  const groupNames: ActivityGroup[] = ["running", "waiting", "errors"];
  return <div className="aa-bar" role="group" aria-label="Agent activity across all projects">
    {groupNames.map(group => {
      const count = groups[group].length;
      if (group !== "running" && count === 0) return null;
      const label = group === "waiting" ? `${count} ${count === 1 ? "needs" : "need"} you` : group === "errors"
        ? `${count} ${count === 1 ? "error" : "errors"}` : `${count} running`;
      return <Popover key={group} open={openGroup === group}
        onOpenChange={open => setOpenGroup(open ? group : null)}>
        <PopoverTrigger asChild>
          <button type="button" className={`aa-button aa-${group}`}
            ref={node => { triggers.current[group] = node ?? undefined; }}>
            <span className="aa-dot" aria-hidden="true" />{label}
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" sideOffset={10}
          mobileTitle={groupLabels[group]} className="aa-popover" aria-label={groupLabels[group]}
          onCloseAutoFocus={event => {
            event.preventDefault();
            triggers.current[group]?.focus();
          }}>
          <ActivityList group={group} rows={groups[group]} projects={projects}
            onNavigate={onNavigate} dismiss={() => setOpenGroup(null)} />
        </PopoverContent>
      </Popover>;
    })}
  </div>;
}
