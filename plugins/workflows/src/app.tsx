import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { WORKFLOW_FOCUS_CLASS } from "@/components/ui/chrome-style-tokens";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  PROMPT_STACK_DISCLOSURE_TRIGGER_CLASS,
  PromptStackCollapseRow,
  PromptStackCountSlot,
  PromptStackChevron,
  PromptStackPeekLayers,
  useDisclosureFocusHandoff,
} from "@/components/ui/prompt-stack-disclosure";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WorkflowPhaseStrip,
  WorkflowProgress,
  WorkflowStatusPill,
  type WorkflowProgressAgent,
  type WorkflowProgressAgentState,
  type WorkflowProgressSnapshot,
  type WorkflowStatusPillState,
  workflowCounts,
  workflowCountLabel,
} from "@/components/ui/workflow-progress";
import {
  experimental_useAppPanel,
  experimental_usePanelTabs,
  experimental_usePluginId,
  definePluginApp,
  useBbNavigate,
  useComposer,
  experimental_useRpcMutation,
  experimental_useRpcQuery,
  type PluginMessageDirectiveProps,
  type ExperimentalThreadActionTabProps,
} from "@get-bb/plugin-sdk/app";
import {
  workflowUiRpcContract,
  type WorkflowCallView,
  type WorkflowRunView,
} from "./ui-contract.js";

type RunLoadState =
  | { status: "loading" }
  | {
      status: "ready";
      run: WorkflowRunView | null;
      refreshError: string | null;
    }
  | { status: "error"; message: string };

interface SharedWorkflowView {
  callsById: ReadonlyMap<string, WorkflowCallView>;
  currentPhaseIndex?: number;
  progress: WorkflowProgressSnapshot;
}

const WORKFLOW_PANEL_ACTION_ID = "workflow-run";
const WORKFLOW_CARD_ROW_HEIGHT = 32;
const WORKFLOW_HEADER_BUTTON_CLASS =
  "flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-none bg-transparent px-3 py-2 text-xs text-foreground transition-colors hover:bg-state-hover";
const WORKFLOW_OPEN_BUTTON_CLASS =
  "flex min-h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-none border-l border-border/35 bg-transparent text-muted-foreground transition-colors hover:text-foreground";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRunId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const runId = value.trim();
  return /^wfr_[0-9a-f-]+$/i.test(runId) ? runId : null;
}

function directiveRunId(
  attributes: Readonly<Record<string, string>>,
): string | null {
  if (Object.keys(attributes).some((key) => key !== "run")) return null;
  return requireRunId(attributes.run);
}

function panelRunId(params: unknown): string | null | undefined {
  if (params === null) return null;
  if (!isRecord(params) || Object.keys(params).some((key) => key !== "runId")) {
    return undefined;
  }
  return requireRunId(params.runId) ?? undefined;
}

function isRunActive(run: WorkflowRunView): boolean {
  return run.status === "queued" || run.status === "running";
}

function runPillState(
  status: WorkflowRunView["status"],
): WorkflowStatusPillState {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}

function runActivity(run: WorkflowRunView, shared: SharedWorkflowView): string {
  if (run.status === "succeeded") return "Completed";
  if (run.status === "failed") return "Failed";
  if (run.status === "cancelled") return "Stopped";
  if (run.status === "queued") return "Waiting to start";
  const active = shared.progress.phases.filter((phase) =>
    shared.progress.agents.some(
      (agent) => agent.phaseIndex === phase.index && agent.state === "running",
    ),
  );
  return (
    active.map((phase) => phase.title).join(" · ") ||
    run.currentPhase ||
    "Starting"
  );
}

function RunActivity({
  run,
  shared,
}: {
  run: WorkflowRunView;
  shared: SharedWorkflowView;
}) {
  const settled = !isRunActive(run);
  const counts = workflowCounts(shared.progress.agents, settled);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-2xs text-muted-foreground">
      <span className="min-w-0 break-words font-medium text-foreground [overflow-wrap:anywhere]">
        {runActivity(run, shared)}
      </span>
      <span aria-hidden>·</span>
      <span>
        {!settled
          ? `${counts.running} ${counts.running === 1 ? "agent" : "agents"} running`
          : workflowCountLabel(shared.progress.agents, settled)}
      </span>
      {run.startedAt === null ? null : (
        <span className="ml-auto whitespace-nowrap tabular-nums text-subtle-foreground">
          {settled && run.finishedAt === null ? (
            "Duration unavailable"
          ) : (
            <>
              <span>
                <RunDuration
                  startedAt={run.startedAt}
                  finishedAt={run.finishedAt}
                />
              </span>
              {settled ? " total" : " elapsed"}
            </>
          )}
        </span>
      )}
    </div>
  );
}

function formatDuration(startedAt: number | null, finishedAt: number | null) {
  if (startedAt === null) return null;
  const durationMs = Math.max(0, (finishedAt ?? Date.now()) - startedAt);
  const totalSeconds = Math.round(durationMs / 1_000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
    seconds > 0 ? `${seconds}s` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
}

function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [ticking]);
  return now;
}

function RunDuration({
  startedAt,
  finishedAt,
}: {
  startedAt: number;
  finishedAt: number | null;
}) {
  const now = useNow(finishedAt === null);
  return <>{formatDuration(startedAt, finishedAt ?? now)}</>;
}

function WorkflowDetailScroll({
  currentPhaseIndex,
  progress,
}: {
  currentPhaseIndex?: number;
  progress: WorkflowProgressSnapshot;
}) {
  return (
    <div
      data-detail-scroll-area="base"
      className="max-h-72 min-w-0 overflow-y-auto px-3 py-2"
    >
      <WorkflowProgress
        progress={progress}
        settled={false}
        compact
        currentPhaseIndex={currentPhaseIndex}
      />
    </div>
  );
}

function shortModelName(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

function workflowAgentState(
  status: WorkflowCallView["status"],
): WorkflowProgressAgentState {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "done";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}

function buildSharedWorkflowView(run: WorkflowRunView): SharedWorkflowView {
  const phases = run.phases.map((phase, index) => ({
    index: index + 1,
    title: phase.title,
    detail: phase.detail,
  }));
  const otherWorkIndex =
    run.unphasedCalls.length === 0 ? null : phases.length + 1;
  const phaseIndexByTitle = new Map(
    phases.map((phase) => [phase.title, phase.index] as const),
  );
  if (otherWorkIndex !== null) {
    phases.push({ index: otherWorkIndex, title: "Other work", detail: null });
  }
  const calls = [
    ...run.phases.flatMap((phase) => phase.calls),
    ...run.unphasedCalls,
  ].sort((left, right) => left.index - right.index);
  const callsById = new Map(calls.map((call) => [call.id, call] as const));
  const agents: WorkflowProgressAgent[] = calls.map((call) => ({
    id: call.id,
    actionable: call.childThreadId !== null,
    index: call.index + 1,
    label: call.label,
    state: workflowAgentState(call.status),
    model: call.model,
    attempt: call.providerRetryAttempts + call.repairAttempts + 1,
    cached: call.cached,
    lastProgressAt: call.finishedAt ?? call.startedAt ?? call.createdAt,
    phaseIndex:
      call.phase === null
        ? (otherWorkIndex ?? undefined)
        : phaseIndexByTitle.get(call.phase),
    error: call.error ?? undefined,
    startedAt: call.startedAt ?? undefined,
    durationMs:
      call.startedAt !== null && call.finishedAt !== null
        ? Math.max(0, call.finishedAt - call.startedAt)
        : undefined,
    metadata: [call.provider, shortModelName(call.model), call.reasoningLevel],
  }));
  return {
    callsById,
    currentPhaseIndex:
      run.currentPhase === null
        ? undefined
        : phaseIndexByTitle.get(run.currentPhase),
    progress: { phases, agents },
  };
}

function activateWorkflowAgent(
  agent: WorkflowProgressAgent,
  callsById: ReadonlyMap<string, WorkflowCallView>,
  toThread: (threadId: string) => void,
): void {
  const childThreadId =
    agent.id === undefined
      ? null
      : (callsById.get(agent.id)?.childThreadId ?? null);
  if (childThreadId !== null) toThread(childThreadId);
}

function useWorkflowRun(
  threadId: string,
  runId: string | null,
): { state: RunLoadState; refresh: () => Promise<void> } {
  const query = experimental_useRpcQuery({
    contract: workflowUiRpcContract,
    method: "workflowRunView",
    input: { threadId, runId },
  });
  const state: RunLoadState =
    query.data === undefined ||
    (query.error !== null && query.data.run === null)
      ? query.error === null
        ? { status: "loading" }
        : { status: "error", message: query.error.message }
      : {
          status: "ready",
          run: query.data.run,
          refreshError: query.error?.message ?? null,
        };
  return { state, refresh: query.refetch };
}

function useActiveWorkflowRuns(threadId: string): WorkflowRunView[] {
  const query = experimental_useRpcQuery({
    contract: workflowUiRpcContract,
    method: "workflowActiveRuns",
    input: { threadId },
  });
  return query.data?.runs ?? [];
}

export function EmptyOrError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]"
    >
      {children}
    </div>
  );
}

export function LoadingPreview() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-3.5 w-44 rounded-sm" />
      <Skeleton className="h-3 w-2/3 rounded-sm" />
      <Skeleton className="h-3 w-1/2 rounded-sm" />
    </div>
  );
}

export function WorkflowRunPanelState({ children }: { children: ReactNode }) {
  return <div className="p-4">{children}</div>;
}

function RefreshWarning({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="break-words rounded-md border border-warning/20 bg-warning/5 px-2.5 py-1.5 text-xs text-warning-text [overflow-wrap:anywhere]"
    >
      Could not refresh: {message}.
    </div>
  );
}

function WorkflowStatusBanner() {
  const { scope } = useComposer();
  if (scope.kind !== "thread") return null;
  return (
    <WorkflowStatusBannerLoaded
      key={scope.threadId}
      threadId={scope.threadId}
    />
  );
}

function WorkflowComposerSummary({ run }: { run: WorkflowRunView }) {
  const shared = buildSharedWorkflowView(run);
  const counts = workflowCounts(shared.progress.agents);
  return (
    <>
      <Icon
        name="Workflow"
        className="size-3.5 shrink-0 text-primary"
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-1.5 text-left">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className="min-w-0 flex-1 truncate font-medium text-foreground"
            title={run.name}
          >
            {run.name}
          </span>
          <span className="text-2xs text-subtle-foreground">
            {counts.running} running
          </span>
          {run.startedAt === null ? (
            <span className="text-2xs text-subtle-foreground">Queued</span>
          ) : (
            <span className="whitespace-nowrap text-2xs tabular-nums text-subtle-foreground">
              <RunDuration startedAt={run.startedAt} finishedAt={null} />
            </span>
          )}
        </div>
        <WorkflowPhaseStrip
          progress={shared.progress}
          currentPhaseIndex={shared.currentPhaseIndex}
          settled={false}
        />
      </div>
    </>
  );
}

function WorkflowComposerCard({ run }: { run: WorkflowRunView }) {
  const panel = experimental_useAppPanel();
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const toggleId = useId();
  const shared = buildSharedWorkflowView(run);
  const focus = useDisclosureFocusHandoff(expanded, () =>
    setExpanded((value) => !value),
  );

  return (
    <section
      aria-label="Workflow"
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface-raised-solid"
      style={{ minHeight: WORKFLOW_CARD_ROW_HEIGHT }}
    >
      <div
        role="group"
        aria-label={`Workflow controls: ${run.name}`}
        className="flex w-full items-stretch"
      >
        <button
          ref={focus.triggerRef}
          type="button"
          id={toggleId}
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={`Workflow: ${run.name}`}
          onClick={focus.onTriggerClick}
          className={cn(
            WORKFLOW_HEADER_BUTTON_CLASS,
            PROMPT_STACK_DISCLOSURE_TRIGGER_CLASS,
            WORKFLOW_FOCUS_CLASS,
          )}
        >
          <WorkflowComposerSummary run={run} />
          <PromptStackChevron isExpanded={expanded} />
        </button>
        <button
          type="button"
          aria-label={`Open workflow ${run.name} in side panel`}
          onClick={() =>
            panel.openTab({
              tab: {
                id: WORKFLOW_PANEL_ACTION_ID,
                context: { kind: "thread" },
                availability: "action",
              },
              title: run.name,
              params: { runId: run.id },
            })
          }
          className={cn(WORKFLOW_OPEN_BUTTON_CLASS, WORKFLOW_FOCUS_CLASS)}
        >
          <Icon name="ArrowRight" className="size-3.5" aria-hidden />
        </button>
      </div>
      <section
        id={bodyId}
        role="region"
        aria-labelledby={toggleId}
        aria-hidden={!expanded}
        inert={!expanded}
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows,opacity,border-color] duration-200 ease-out",
          expanded
            ? "grid-rows-[1fr] border-t border-border opacity-100"
            : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden bg-popover">
          <WorkflowDetailScroll
            progress={shared.progress}
            currentPhaseIndex={shared.currentPhaseIndex}
          />
          <div className="px-1 pb-1">
            <PromptStackCollapseRow
              buttonRef={focus.collapseRef}
              className={WORKFLOW_FOCUS_CLASS}
              controlsId={bodyId}
              label={`Collapse workflow ${run.name}`}
              onCollapse={focus.onCollapseClick}
            />
          </div>
        </div>
      </section>
    </section>
  );
}

function WorkflowStackFront({
  runs,
  onExpand,
  buttonRef,
}: {
  runs: readonly WorkflowRunView[];
  onExpand: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  const front = runs[0]!;
  return (
    <PromptStackPeekLayers hiddenCount={runs.length - 1}>
      <section
        aria-label="Workflows"
        className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface-raised-solid"
        style={{ minHeight: WORKFLOW_CARD_ROW_HEIGHT }}
      >
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={false}
          aria-label={`${runs.length} workflows running. Show all`}
          onClick={onExpand}
          className={cn(
            WORKFLOW_HEADER_BUTTON_CLASS,
            PROMPT_STACK_DISCLOSURE_TRIGGER_CLASS,
            WORKFLOW_FOCUS_CLASS,
            "w-full",
          )}
        >
          <WorkflowComposerSummary run={front} />
          <PromptStackCountSlot count={runs.length} />
        </button>
      </section>
    </PromptStackPeekLayers>
  );
}

function WorkflowStatusBannerLoaded({ threadId }: { threadId: string }) {
  const activeRuns = useActiveWorkflowRuns(threadId);
  const pluginId = experimental_usePluginId();
  const tabs = experimental_usePanelTabs();
  const selected = tabs.tabs.find(
    (tab) => tab.key === tabs.selectedKey,
  )?.detail;
  const inspectingRunId =
    tabs.open &&
    selected?.kind === "plugin" &&
    selected.pluginId === pluginId &&
    selected.tab.id === WORKFLOW_PANEL_ACTION_ID &&
    selected.tab.context.kind === "thread" &&
    selected.tab.availability === "action"
      ? panelRunId(selected.params)
      : undefined;
  // The expanded chat card stays intact; only the duplicate composer banner
  // for the inspected run is omitted. Other active runs retain their stack.
  const runs = activeRuns.filter((run) => run.id !== inspectingRunId);
  const [stackExpanded, setStackExpanded] = useState(false);
  const listId = useId();
  const focus = useDisclosureFocusHandoff(stackExpanded, () =>
    setStackExpanded((value) => !value),
  );

  if (stackExpanded && runs.length < 2) {
    setStackExpanded(false);
  }
  if (runs.length === 0) return null;

  const collapsed = runs.length > 1 && !stackExpanded;
  return (
    <section
      aria-label="Active workflows"
      className="flex min-w-0 flex-col gap-2"
    >
      {collapsed ? (
        <WorkflowStackFront
          runs={runs}
          buttonRef={focus.triggerRef}
          onExpand={focus.onTriggerClick}
        />
      ) : null}
      <div hidden={collapsed} className="flex min-w-0 flex-col gap-1">
        <div id={listId} className="flex min-w-0 flex-col gap-2">
          {runs.map((run) => (
            <WorkflowComposerCard key={run.id} run={run} />
          ))}
        </div>
        {runs.length > 1 && stackExpanded ? (
          <PromptStackCollapseRow
            buttonRef={focus.collapseRef}
            className={WORKFLOW_FOCUS_CLASS}
            controlsId={listId}
            label={`Collapse ${runs.length} workflows`}
            onCollapse={focus.onCollapseClick}
          />
        ) : null}
      </div>
    </section>
  );
}

function WorkflowPreviewDirective({
  attributes,
  source,
  message,
}: PluginMessageDirectiveProps) {
  const runId = directiveRunId(attributes);
  if (runId === null) {
    return (
      <EmptyOrError>
        workflow-preview requires exactly one valid run attribute, e.g.{" "}
        <code>::workflow-preview{'{run="wfr_…"}'}</code>
      </EmptyOrError>
    );
  }
  return (
    <WorkflowPreviewLoaded
      runId={runId}
      threadId={message.threadId}
      source={source}
    />
  );
}

function WorkflowPreviewLoaded({
  runId,
  threadId,
  source,
}: {
  runId: string;
  threadId: string;
  source: string;
}) {
  const navigate = useBbNavigate();
  const panel = experimental_useAppPanel();
  const { state } = useWorkflowRun(threadId, runId);

  if (state.status === "loading") return <LoadingPreview />;
  if (state.status === "error") {
    return <EmptyOrError>{state.message}</EmptyOrError>;
  }
  if (state.run === null) {
    return <EmptyOrError>Workflow run not found.</EmptyOrError>;
  }
  const run = state.run;
  const shared = buildSharedWorkflowView(run);
  const settled = !isRunActive(run);
  return (
    <section
      className="my-2 min-w-0 overflow-hidden rounded-lg border border-border bg-surface-raised-solid"
      title={source}
      aria-label="Workflow"
    >
      <div className="min-w-0 px-4 pb-3 pt-4">
        <header className="flex min-w-0 items-start gap-2.5">
          <Icon
            name="Workflow"
            className="mt-0.5 size-4 shrink-0 text-primary"
            aria-hidden
          />
          <div
            role="heading"
            aria-level={3}
            className="min-w-0 flex-1 break-words text-sm font-medium leading-relaxed text-foreground [overflow-wrap:anywhere]"
          >
            {run.name}
          </div>
          <WorkflowStatusPill state={runPillState(run.status)} />
        </header>
        <div className="mt-2.5">
          <RunActivity run={run} shared={shared} />
        </div>
        <WorkflowPhaseStrip
          progress={shared.progress}
          currentPhaseIndex={shared.currentPhaseIndex}
          settled={settled}
          className="mb-3 mt-4"
        />
        <div
          data-detail-scroll-area="base"
          className="max-h-72 min-w-0 overflow-y-auto"
        >
          <WorkflowProgress
            progress={shared.progress}
            settled={settled}
            compact
            error={run.error}
            onAgentActivate={(agent) =>
              activateWorkflowAgent(agent, shared.callsById, (id) =>
                navigate.toThread(id),
              )
            }
          />
        </div>
      </div>
      {state.refreshError === null ? null : (
        <div className="border-t border-border-seam bg-popover px-3 py-2">
          <RefreshWarning message={state.refreshError} />
        </div>
      )}
      <footer className="flex min-h-10 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border-hairline px-4 py-1.5">
        <span className="min-w-0 text-2xs text-subtle-foreground">
          {workflowCountLabel(shared.progress.agents, settled)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7 px-2 text-xs"
          onClick={() =>
            panel.openTab({
              tab: {
                id: WORKFLOW_PANEL_ACTION_ID,
                context: { kind: "thread" },
                availability: "action",
              },
              title: run.name,
              params: { runId: run.id },
            })
          }
        >
          Inspect run
          <Icon name="ArrowRight" className="size-3" aria-hidden />
        </Button>
      </footer>
    </section>
  );
}

function WorkflowRunPanel({
  threadId,
  params,
}: ExperimentalThreadActionTabProps) {
  const runId = panelRunId(params);
  return (
    <div className="h-full min-h-0 flex-1 bg-background">
      {runId === undefined ? (
        <WorkflowRunPanelState>
          <EmptyOrError>
            This workflow panel has invalid run parameters.
          </EmptyOrError>
        </WorkflowRunPanelState>
      ) : (
        <WorkflowRunPanelLoaded threadId={threadId} runId={runId} />
      )}
    </div>
  );
}

function WorkflowRunPanelLoaded({
  threadId,
  runId,
}: {
  threadId: string;
  runId: string | null;
}) {
  const navigate = useBbNavigate();
  const stopRun = experimental_useRpcMutation({
    contract: workflowUiRpcContract,
    method: "workflowStopRun",
  });
  const { state, refresh } = useWorkflowRun(threadId, runId);
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const run = state.status === "ready" ? state.run : null;
  const shared = useMemo(
    () => (run === null ? null : buildSharedWorkflowView(run)),
    [run],
  );
  if (state.status === "loading") {
    return (
      <WorkflowRunPanelState>
        <LoadingPreview />
      </WorkflowRunPanelState>
    );
  }
  if (state.status === "error") {
    return (
      <WorkflowRunPanelState>
        <EmptyOrError>{state.message}</EmptyOrError>
      </WorkflowRunPanelState>
    );
  }
  if (run === null || shared === null) {
    return (
      <WorkflowRunPanelState>
        <EmptyOrError>
          No workflow runs were found for this thread.
        </EmptyOrError>
      </WorkflowRunPanelState>
    );
  }
  const settled = !isRunActive(run);
  const completedCalls = workflowCounts(
    shared.progress.agents,
    settled,
  ).completed;
  const cachedCalls = shared.progress.agents.filter(
    (agent) => agent.cached,
  ).length;
  const stop = async () => {
    setStopping(true);
    setStopError(null);
    try {
      await stopRun.mutate({ threadId, runId: run.id });
      await refresh();
    } catch (error) {
      setStopError(error instanceof Error ? error.message : String(error));
    } finally {
      setStopping(false);
    }
  };
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <div
        data-detail-scroll-area="workflow-panel"
        className="min-h-0 min-w-0 flex-1 overflow-y-auto p-6"
      >
        <header className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-base font-semibold leading-relaxed text-foreground [overflow-wrap:anywhere]">
              {run.name}
            </h2>
            {run.description ? (
              <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                {run.description}
              </p>
            ) : null}
          </div>
          {settled ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2 text-2xs text-muted-foreground hover:text-destructive-text"
              aria-label="Stop workflow"
              disabled={stopping}
              onClick={() => void stop()}
            >
              <Icon name="Square" className="size-2.5" aria-hidden />
              {stopping ? "Stopping…" : "Stop"}
            </Button>
          )}
        </header>
        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
          <WorkflowStatusPill state={runPillState(run.status)} />
          <div className="min-w-0 flex-1">
            <RunActivity run={run} shared={shared} />
          </div>
        </div>
        {stopError === null ? null : (
          <div
            role="alert"
            className="mt-3 break-words rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive-text [overflow-wrap:anywhere]"
          >
            {stopError}
          </div>
        )}
        {state.refreshError === null ? null : (
          <div className="mt-3">
            <RefreshWarning message={state.refreshError} />
          </div>
        )}
        <div className="my-5 h-px bg-border-hairline" />
        <h3 className="mb-4 text-xs font-normal text-subtle-foreground">
          {settled ? "Run activity" : "Current activity"}
        </h3>
        <div className="min-w-0">
          <WorkflowProgress
            progress={shared.progress}
            settled={!isRunActive(run)}
            error={run.error}
            currentPhaseIndex={shared.currentPhaseIndex}
            onAgentActivate={(agent) =>
              activateWorkflowAgent(agent, shared.callsById, (threadId) =>
                navigate.toThread(threadId),
              )
            }
          />
        </div>
        <details className="group mt-6 border-t border-border-hairline pt-4">
          <summary
            className={cn(
              "flex w-fit max-w-full cursor-pointer list-none items-center gap-2 rounded text-xs text-subtle-foreground [&::-webkit-details-marker]:hidden",
              WORKFLOW_FOCUS_CLASS,
            )}
          >
            <Icon
              name="ChevronRight"
              className="size-3 shrink-0 group-open:rotate-90"
              aria-hidden
            />
            Run details
          </summary>
          <dl className="mt-4 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-xs">
            {[
              ["Run ID", run.id],
              [
                "Completed calls",
                `${completedCalls} of ${shared.progress.agents.length} recorded`,
              ],
              ["Cache hits", cachedCalls],
              ["Created", new Date(run.createdAt).toLocaleString()],
              [
                "Started",
                run.startedAt === null
                  ? "—"
                  : new Date(run.startedAt).toLocaleString(),
              ],
              [
                "Finished",
                run.finishedAt === null
                  ? "—"
                  : new Date(run.finishedAt).toLocaleString(),
              ],
              ["Result", run.resultAvailable ? "Available" : "Not available"],
            ].map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-subtle-foreground">{label}</dt>
                <dd className="min-w-0 break-words text-right text-muted-foreground [overflow-wrap:anywhere]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
      <footer className="border-t border-border-hairline px-6 py-3 text-2xs text-subtle-foreground">
        {settled
          ? "Run finished · expand a phase to inspect its agents"
          : "Live status · active work expanded"}
      </footer>
    </div>
  );
}

export default definePluginApp((app) => {
  app.composer.customize({
    id: "workflow-status",
    scopes: ["thread"],
    banners: [
      { id: "active-runs", chrome: "bare", component: WorkflowStatusBanner },
    ],
  });
  app.slots.messageDirective({
    id: "workflow-preview",
    component: WorkflowPreviewDirective,
  });
  app.slots.experimental_tab({
    context: { kind: "thread" },
    availability: "action",
    id: WORKFLOW_PANEL_ACTION_ID,
    title: "Workflow run",
    icon: "Workflow",
    component: WorkflowRunPanel,
    layout: "flush",
  });
});
