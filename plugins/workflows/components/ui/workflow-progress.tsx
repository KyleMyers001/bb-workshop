import { useEffect, useId, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { WORKFLOW_FOCUS_CLASS } from "./chrome-style-tokens";
import { cn } from "../../lib/utils";

export type WorkflowProgressAgentState =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "skipped"
  | "cancelled";

export interface WorkflowProgressAgent {
  id?: string;
  actionable?: boolean;
  index: number;
  label: string;
  state: WorkflowProgressAgentState;
  model: string;
  attempt: number;
  cached: boolean;
  lastProgressAt: number;
  phaseIndex?: number;
  error?: string;
  durationMs?: number;
  startedAt?: number;
  metadata?: readonly string[];
}

export interface WorkflowProgressPhase {
  index: number;
  title: string;
  detail?: string | null;
}

export interface WorkflowProgressSnapshot {
  phases: readonly WorkflowProgressPhase[];
  agents: readonly WorkflowProgressAgent[];
}

type DisplayState =
  | "running"
  | "done"
  | "failed"
  | "stopped"
  | "waiting"
  | "active";
interface PhaseGroup {
  phase: WorkflowProgressPhase;
  agents: WorkflowProgressAgent[];
}

const STATE: Record<
  DisplayState,
  { label: string; icon: IconName; tone: string }
> = {
  running: { label: "Running", icon: "Spinner", tone: "text-primary" },
  active: { label: "Active", icon: "Circle", tone: "text-primary" },
  done: { label: "Completed", icon: "CircleCheck", tone: "text-success" },
  failed: {
    label: "Failed",
    icon: "AlertCircle",
    tone: "text-destructive-text",
  },
  stopped: { label: "Stopped", icon: "Square", tone: "text-muted-foreground" },
  waiting: { label: "Waiting", icon: "Circle", tone: "text-subtle-foreground" },
};

function StateIcon({
  state,
  className,
}: {
  state: DisplayState;
  className?: string;
}) {
  return (
    <Icon
      name={STATE[state].icon}
      className={cn(
        "size-3.5 shrink-0",
        STATE[state].tone,
        state === "running" && "motion-safe:animate-spin",
        className,
      )}
      aria-hidden="true"
    />
  );
}

function agentState(
  agent: WorkflowProgressAgent,
  settled: boolean,
): DisplayState {
  switch (agent.state) {
    case "done":
    case "skipped":
      return "done";
    case "failed":
      return "failed";
    case "cancelled":
      return "stopped";
    case "running":
      return settled ? "stopped" : "running";
    case "queued":
      return settled ? "stopped" : "waiting";
  }
}

export function workflowCounts(
  agents: readonly WorkflowProgressAgent[],
  settled = false,
) {
  return {
    completed: agents.filter((agent) => agent.state === "done").length,
    running: agents.filter((agent) => agentState(agent, settled) === "running")
      .length,
    failed: agents.filter((agent) => agent.state === "failed").length,
    stopped: agents.filter((agent) => agentState(agent, settled) === "stopped")
      .length,
    waiting: agents.filter((agent) => agentState(agent, settled) === "waiting")
      .length,
  };
}

export function workflowCountLabel(
  agents: readonly WorkflowProgressAgent[],
  settled = false,
): string {
  const counts = workflowCounts(agents, settled);
  const parts = [
    counts.completed > 0 ? `${counts.completed} completed` : null,
    counts.running > 0 ? `${counts.running} running` : null,
    counts.failed > 0 ? `${counts.failed} failed` : null,
    counts.stopped > 0 ? `${counts.stopped} stopped` : null,
    counts.waiting > 0 ? `${counts.waiting} queued` : null,
  ].filter(Boolean);
  return parts.length === 0 ? "No agent calls started" : parts.join(" · ");
}

function phaseGroups(progress: WorkflowProgressSnapshot): PhaseGroup[] {
  const groups = progress.phases.map((phase) => ({
    phase,
    agents: progress.agents.filter((agent) => agent.phaseIndex === phase.index),
  }));
  const unphased = progress.agents.filter(
    (agent) =>
      !progress.phases.some((phase) => phase.index === agent.phaseIndex),
  );
  if (unphased.length > 0) {
    groups.push({
      phase: { index: -1, title: "Other work" },
      agents: unphased,
    });
  }
  return groups;
}

function phaseState(
  group: PhaseGroup,
  settled: boolean,
  currentPhaseIndex?: number,
): DisplayState {
  const states = group.agents.map((agent) => agentState(agent, settled));
  // Independent lanes may overlap phases. Actual running work takes precedence
  // over the last phase() marker and remains visible in every active group.
  if (states.includes("running")) return "running";
  if (states.includes("failed")) return "failed";
  if (states.includes("stopped")) return "stopped";
  if (states.length > 0 && states.every((state) => state === "done"))
    return "done";
  if (!settled && group.phase.index === currentPhaseIndex) return "active";
  return "waiting";
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${seconds % 60 === 0 ? "" : ` ${seconds % 60}s`}`;
}

function AgentLine({
  agent,
  compact,
  settled,
  now,
  onActivate,
}: {
  agent: WorkflowProgressAgent;
  compact: boolean;
  settled: boolean;
  now: number;
  onActivate?: () => void;
}) {
  const state = agentState(agent, settled);
  const metadata = [
    ...(agent.metadata ?? [agent.model]),
    agent.attempt > 1 ? `attempt ${agent.attempt}` : null,
    agent.cached ? "cached" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const duration =
    agent.durationMs ??
    (state === "running" && agent.startedAt !== undefined
      ? Math.max(0, now - agent.startedAt)
      : undefined);
  const content = (
    <>
      <StateIcon state={state} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block break-words text-xs leading-relaxed text-foreground [overflow-wrap:anywhere]">
          {agent.label}
        </span>
        {compact ? null : (
          <span className="mt-0.5 block break-words text-2xs leading-relaxed text-subtle-foreground [overflow-wrap:anywhere]">
            {metadata}
          </span>
        )}
        {agent.error ? (
          <span className="mt-1 block break-words text-xs text-destructive-text [overflow-wrap:anywhere]">
            {agent.error}
          </span>
        ) : null}
      </span>
      <span className="text-right text-2xs leading-relaxed text-subtle-foreground">
        <span className={cn("block", state === "failed" && STATE.failed.tone)}>
          {agent.state === "skipped" ? "Skipped" : STATE[state].label}
        </span>
        {compact || duration === undefined ? null : (
          <span className="mt-0.5 block whitespace-nowrap tabular-nums">
            {formatDuration(duration)}
          </span>
        )}
      </span>
    </>
  );
  const className = cn(
    "grid w-full min-w-0 grid-cols-[14px_minmax(0,1fr)_auto] items-start gap-2 text-left",
    compact ? "py-1" : "rounded-md px-2 py-2.5",
    onActivate && "cursor-pointer hover:bg-state-hover",
    WORKFLOW_FOCUS_CLASS,
  );
  return onActivate ? (
    <button
      type="button"
      className={className}
      onClick={onActivate}
      title="Open agent thread"
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function PhaseSection({
  group,
  settled,
  currentPhaseIndex,
  children,
}: {
  group: PhaseGroup;
  settled: boolean;
  currentPhaseIndex?: number;
  children: ReactNode;
}) {
  const state = phaseState(group, settled, currentPhaseIndex);
  const [override, setOverride] = useState<boolean | null>(null);
  const bodyId = useId();
  const defaultExpanded =
    state === "active" ||
    group.agents.some((agent) => agentState(agent, settled) !== "done");
  const expanded = override ?? defaultExpanded;
  const summary =
    group.agents.length === 0
      ? state === "active"
        ? "Active · no calls"
        : "Not started"
      : workflowCountLabel(group.agents, settled);
  return (
    <section
      data-workflow-phase={state}
      className="relative min-w-0 pb-6 pl-7 last:pb-0 before:absolute before:bottom-1 before:left-2 before:top-6 before:w-px before:bg-border last:before:hidden"
    >
      <StateIcon state={state} className="absolute left-0.5 top-1" />
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setOverride(!expanded)}
        className={cn(
          "flex min-h-6 w-full min-w-0 items-start gap-2 rounded text-left hover:bg-state-hover",
          WORKFLOW_FOCUS_CLASS,
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 break-words text-xs font-medium leading-6 [overflow-wrap:anywhere]",
            state === "running" || state === "active"
              ? "text-foreground"
              : "text-muted-foreground",
          )}
        >
          {group.phase.title}
        </span>
        <span className="max-w-[45%] pt-1 text-right text-2xs leading-relaxed text-subtle-foreground">
          {summary}
        </span>
        <Icon
          name="ChevronRight"
          className={cn(
            "mt-1.5 size-3 shrink-0 text-subtle-foreground",
            expanded && "rotate-90",
          )}
          aria-hidden
        />
      </button>
      <div id={bodyId} hidden={!expanded} className="mt-2 min-w-0">
        {group.phase.detail ? (
          <p className="mb-1 break-words text-xs leading-relaxed text-subtle-foreground [overflow-wrap:anywhere]">
            {group.phase.detail}
          </p>
        ) : null}
        {group.agents.length === 0 ? (
          <p className="text-xs text-subtle-foreground">
            No agent calls started.
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export function WorkflowProgress({
  currentPhaseIndex,
  error,
  onAgentActivate,
  progress,
  settled,
  compact = false,
}: {
  currentPhaseIndex?: number;
  error?: string | null;
  onAgentActivate?: (agent: WorkflowProgressAgent) => void;
  progress: WorkflowProgressSnapshot;
  settled: boolean;
  compact?: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  const ticking =
    !compact &&
    !settled &&
    progress.agents.some((agent) => agent.state === "running");
  useEffect(() => {
    if (!ticking) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [ticking]);
  const agentLine = (agent: WorkflowProgressAgent) => (
    <AgentLine
      key={agent.id ?? agent.index}
      agent={agent}
      compact={compact}
      settled={settled}
      now={now}
      onActivate={
        onAgentActivate && agent.actionable
          ? () => onAgentActivate(agent)
          : undefined
      }
    />
  );
  return (
    <div className="min-w-0">
      {compact ? (
        <div className="grid gap-1">{progress.agents.map(agentLine)}</div>
      ) : (
        phaseGroups(progress).map((group) => (
          <PhaseSection
            key={group.phase.index}
            group={group}
            settled={settled}
            currentPhaseIndex={currentPhaseIndex}
          >
            {group.agents.map(agentLine)}
          </PhaseSection>
        ))
      )}
      {error ? (
        <div
          role="alert"
          className="mt-3 break-words text-xs text-destructive-text [overflow-wrap:anywhere]"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

export type WorkflowStatusPillState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
const PILL: Record<WorkflowStatusPillState, { label: string; tone: string }> = {
  queued: { label: "Queued", tone: "bg-secondary text-muted-foreground" },
  running: { label: "Running", tone: "bg-primary/10 text-primary" },
  completed: { label: "Completed", tone: "bg-success/10 text-success" },
  failed: { label: "Failed", tone: "bg-destructive/10 text-destructive-text" },
  cancelled: { label: "Stopped", tone: "bg-secondary text-muted-foreground" },
};
export function WorkflowStatusPill({
  state,
  className,
}: {
  state: WorkflowStatusPillState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-2xs font-medium",
        PILL[state].tone,
        className,
      )}
    >
      <span className="size-1 shrink-0 rounded-full bg-current" aria-hidden />
      {PILL[state].label}
    </span>
  );
}

export function WorkflowPhaseStrip({
  progress,
  currentPhaseIndex,
  settled,
  className,
}: {
  progress: WorkflowProgressSnapshot;
  currentPhaseIndex?: number;
  settled: boolean;
  className?: string;
}) {
  const groups = phaseGroups(progress);
  if (groups.length === 0) return null;
  return (
    // Explicit roles avoid inheriting the enclosing message's Markdown list
    // typography. This sequence also lives inside the composer toggle.
    <div
      role="list"
      aria-label="Phase progression"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 text-2xs",
        className,
      )}
    >
      {groups.map((group, index) => {
        const state = phaseState(group, settled, currentPhaseIndex);
        return (
          <div
            role="listitem"
            key={group.phase.index}
            aria-label={`${group.phase.title}: ${STATE[state].label}`}
            className="flex min-w-0 max-w-full items-center gap-2"
          >
            {index === 0 ? null : (
              <span aria-hidden className="h-px w-4 shrink-0 bg-border" />
            )}
            <span
              className={cn(
                "flex min-w-0 items-start gap-1.5",
                STATE[state].tone,
              )}
            >
              <StateIcon state={state} className="mt-0.5 size-3" />
              <span className="min-w-0 break-words leading-relaxed [overflow-wrap:anywhere]">
                {group.phase.title}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
