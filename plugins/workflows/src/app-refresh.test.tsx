// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { ExperimentalPanelTabs } from "@get-bb/plugin-sdk/app";
import { makeCall, overlappingRun as run } from "./ui-fixtures.test-support.js";
import type { WorkflowRunView } from "./ui-contract.js";

const app = await loadPluginApp(() => import("./app"));
const panelProps = {
  threadId: "thr_origin",
  environment: null,
  params: { runId: run.id },
};
const previewProps = {
  attributes: { run: run.id },
  source: `::workflow-preview{run="${run.id}"}`,
  message: {
    id: "msg_1",
    threadId: "thr_origin",
    turnId: "turn_1",
    projectId: "proj_1",
  },
  openWorkspaceFile: null,
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("workflow refresh regression coverage", () => {
  it("preserves long names and lets phase labels shrink instead of overflowing their flex row", async () => {
    const phaseTitle = "UnbrokenPhaseTitle".repeat(12);
    const taskTitle = "UnbrokenTaskLabel".repeat(15);
    const workflowTitle = "LongWorkflowTitle".repeat(12);
    const current = {
      ...run,
      name: workflowTitle,
      currentPhase: phaseTitle,
      phases: [
        {
          title: phaseTitle,
          detail: null,
          calls: [makeCall({ phase: phaseTitle, label: taskTitle })],
        },
      ],
      unphasedCalls: [],
    };
    const preview = renderSlot(app.messageDirectives[0]!, previewProps, {
      rpc: { workflowRunView: () => ({ run: current }) },
    });
    const heading = await preview.findByRole("heading", {
      name: workflowTitle,
    });
    const phases = preview.getByRole("list", { name: "Phase progression" });
    const phase = within(phases).getByText(phaseTitle);
    expect(phase.className).toContain("min-w-0");
    expect(heading.className).not.toContain("truncate");
    expect(preview.getByText(taskTitle).className).not.toContain("truncate");
    expect(preview.getByText(taskTitle).className).toContain("break-words");
  });

  it("shows all overlapping work, actual counts, unphased calls, and empty upcoming phases", async () => {
    const panel = renderSlot(app.threadPanelActions[0]!, panelProps, {
      rpc: { workflowRunView: () => ({ run }) },
    });
    await panel.findByRole("heading", { name: run.name });
    expect(panel.getByText("2 agents running")).toBeTruthy();
    for (const label of [
      "Runtime & lifecycle",
      "Verify contracts & boundaries",
      "Unphased compatibility check",
    ]) {
      expect(panel.getByText(label)).toBeTruthy();
    }
    const phases = panel.container.querySelectorAll(
      '[data-workflow-phase="running"]',
    );
    expect(phases).toHaveLength(2);
    expect(
      panel
        .getByRole("button", { name: /Review.*1 completed · 1 running/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      panel
        .getByRole("button", { name: /Verify.*1 running/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    const upcoming = panel.getByRole("button", {
      name: /Summarize.*Not started/,
    });
    expect(upcoming.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(upcoming);
    expect(panel.getByText("Collect the available results.")).toBeTruthy();
    expect(panel.getByText("No agent calls started.")).toBeTruthy();
    fireEvent.click(panel.getByText("Run details"));
    expect(panel.getByText("1 of 4 recorded")).toBeTruthy();
    expect(panel.queryByText(/percent|%|of 6/)).toBeNull();

    cleanup();
    const preview = renderSlot(app.messageDirectives[0]!, previewProps, {
      rpc: { workflowRunView: () => ({ run }) },
    });
    await preview.findByRole("heading", { name: run.name });
    expect(preview.getByLabelText("Review: Running")).toBeTruthy();
    expect(preview.getByLabelText("Verify: Running")).toBeTruthy();
    expect(preview.getByLabelText("Summarize: Waiting")).toBeTruthy();
    expect(preview.getByLabelText("Other work: Waiting")).toBeTruthy();
    expect(
      preview.getByText("1 completed · 2 running · 1 queued"),
    ).toBeTruthy();
    expect(preview.getByText("Unphased compatibility check")).toBeTruthy();
    expect(preview.queryByText(/gpt-6/)).toBeNull();
  });

  it("preserves disclosure choices while refreshes reveal new active work and recover from errors", async () => {
    let current = run;
    let failing = false;
    const panel = renderSlot(app.threadPanelActions[0]!, panelProps, {
      rpc: {
        workflowRunView: () => {
          if (failing) throw new Error("connection lost");
          return { run: current };
        },
      },
    });
    const review = await panel.findByRole("button", {
      name: /Review.*1 running/,
    });
    fireEvent.click(review);
    fireEvent.click(panel.getByText("Run details"));
    failing = true;
    await panel.experimental_invalidateRpc(["runs:thr_origin"]);
    expect((await panel.findByRole("status")).textContent).toMatch(
      /Could not refresh: connection lost/,
    );
    expect(panel.getByText("Run details").closest("details")?.open).toBe(true);
    expect(review.getAttribute("aria-expanded")).toBe("false");
    failing = false;
    current = {
      ...run,
      currentPhase: "Summarize",
      phases: run.phases.map((phase) =>
        phase.title === "Summarize"
          ? {
              ...phase,
              calls: [
                makeCall({
                  id: "wfc_summary",
                  index: 4,
                  phase: "Summarize",
                  label: "Summarize results",
                }),
              ],
            }
          : phase,
      ),
    };
    await panel.experimental_invalidateRpc(["runs:thr_origin"]);
    expect(await panel.findByText("3 agents running")).toBeTruthy();
    expect(
      panel
        .getByRole("button", { name: /Summarize.*1 running/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(review.getAttribute("aria-expanded")).toBe("false");
    expect(panel.queryByRole("status")).toBeNull();
  });

  it("disables Stop while pending, reports failure, and permits a successful retry", async () => {
    let rejectStop: (error: Error) => void = () => undefined;
    let attempt = 0;
    let current = run;
    const panel = renderSlot(app.threadPanelActions[0]!, panelProps, {
      rpc: {
        workflowRunView: () => ({ run: current }),
        workflowStopRun: (input) => {
          expect(input).toEqual({ threadId: "thr_origin", runId: run.id });
          attempt += 1;
          if (attempt === 1)
            return new Promise((_resolve, reject) => {
              rejectStop = reject;
            });
          current = { ...run, status: "cancelled", finishedAt: 45_000 };
          return { stopped: true, run: current };
        },
      },
    });
    const stop = await panel.findByRole("button", { name: "Stop workflow" });
    fireEvent.click(stop);
    await waitFor(() =>
      expect((stop as HTMLButtonElement).disabled).toBe(true),
    );
    expect(stop.textContent).toMatch(/Stopping/);
    await act(async () => rejectStop(new Error("Stop unavailable")));
    expect((await panel.findByRole("alert")).textContent).toBe(
      "Stop unavailable",
    );
    expect((stop as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(stop);
    await waitFor(() =>
      expect(panel.queryByRole("button", { name: "Stop workflow" })).toBeNull(),
    );
    expect(panel.queryByRole("alert")).toBeNull();
    expect(panel.getAllByText("Stopped").length).toBeGreaterThan(0);
    expect(panel.container.querySelector('[data-icon="Spinner"]')).toBeNull();
    expect(attempt).toBe(2);
  });

  it("ticks run and running task durations without RPC polling and freezes terminal timestamps", async () => {
    vi.useFakeTimers({
      now: 27_000,
      toFake: ["Date", "setInterval", "clearInterval"],
    });
    let current = run;
    const panel = renderSlot(app.threadPanelActions[0]!, panelProps, {
      rpc: { workflowRunView: () => ({ run: current }) },
    });
    const task = await panel.findByRole("button", {
      name: /Runtime & lifecycle/,
    });
    expect(within(task).getByText("26s")).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(within(task).getByText("31s")).toBeTruthy();
    expect(panel.rpcCalls).toHaveLength(1);
    current = {
      ...run,
      status: "failed",
      finishedAt: 32_000,
      error: "Verification failed",
      phases: run.phases.map((phase) => ({
        ...phase,
        calls: phase.calls.map((call) => ({
          ...call,
          status: call.status === "running" ? ("failed" as const) : call.status,
          error: call.status === "running" ? "Agent request failed" : null,
          finishedAt: 32_000,
        })),
      })),
    };
    await panel.experimental_invalidateRpc(["runs:thr_origin"]);
    expect(await panel.findByText("Verification failed")).toBeTruthy();
    expect(panel.getAllByText("Agent request failed")).toHaveLength(2);
    expect(panel.getByText("1 completed · 1 failed")).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(within(task).getByText("31s")).toBeTruthy();
    expect(panel.rpcCalls).toHaveLength(2);
    expect(panel.container.querySelector('[data-icon="Spinner"]')).toBeNull();
  });

  it.each(["queued", "succeeded", "failed", "cancelled"] as const)(
    "renders %s with truthful counts and stop availability",
    async (status) => {
      const current: WorkflowRunView = {
        ...run,
        status,
        phases: [{ title: "Empty phase", detail: null, calls: [] }],
        unphasedCalls: [],
        currentPhase: "Empty phase",
        startedAt: status === "queued" ? null : 1_000,
        finishedAt: status === "queued" ? null : 27_000,
        error:
          status === "failed" ? "Script failed before any agent calls" : null,
        resultAvailable: status === "succeeded",
      };
      const panel = renderSlot(app.threadPanelActions[0]!, panelProps, {
        rpc: { workflowRunView: () => ({ run: current }) },
      });
      await panel.findByRole("heading", { name: run.name });
      expect(
        Boolean(panel.queryByRole("button", { name: "Stop workflow" })),
      ).toBe(status === "queued");
      expect(panel.getByText("Run details").closest("details")?.open).toBe(
        false,
      );
      fireEvent.click(panel.getByText("Run details"));
      expect(panel.getByText("0 of 0 recorded")).toBeTruthy();
      expect(
        panel.getByRole("button", { name: /Empty phase/ }).textContent,
      ).toMatch(/Not started|Active · no calls/);
      expect(panel.container.querySelector('[data-icon="Spinner"]')).toBeNull();
      if (status === "failed")
        expect(panel.getByRole("alert").textContent).toBe(current.error);
      if (status === "succeeded")
        expect(panel.getByText("Available")).toBeTruthy();
    },
  );
});

describe("composer / inspector coordination", () => {
  const tabs: ExperimentalPanelTabs = {
    open: true,
    selectedKey: "workflow-inspector",
    tabs: [
      {
        key: "workflow-inspector",
        title: run.name,
        status: null,
        closable: true,
        detail: {
          kind: "plugin",
          pluginId: "test-plugin",
          tab: {
            id: "workflow-run",
            context: { kind: "thread" },
            availability: "action",
          },
          params: { runId: run.id },
        },
      },
    ],
  };
  it.each([true, false])(
    "omits only the inspected run when the panel is open=%s",
    async (open) => {
      const other = {
        ...run,
        id: "wfr_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        name: "Other active workflow",
      };
      const slot = renderSlot(
        app.composerCustomizations[0]!.banners![0]!,
        {},
        {
          composer: { scope: { kind: "thread", threadId: "thr_origin" } },
          experimental_panelTabs: { ...tabs, open },
          rpc: { workflowActiveRuns: () => ({ runs: [run, other] }) },
        },
      );
      await waitFor(() => expect(slot.rpcCalls).toHaveLength(1));
      if (open) {
        expect(
          await slot.findByRole("button", {
            name: "Workflow: Other active workflow",
          }),
        ).toBeTruthy();
        expect(slot.queryByText(run.name)).toBeNull();
      } else {
        fireEvent.click(
          await slot.findByRole("button", {
            name: "2 workflows running. Show all",
          }),
        );
        expect(
          slot.getByRole("button", { name: `Workflow: ${run.name}` }),
        ).toBeTruthy();
      }
      expect(
        slot.getAllByRole("list", { name: "Phase progression" }),
      ).toHaveLength(open ? 1 : 2);
    },
  );
  it("does not hide a run for another plugin's same-named tab", async () => {
    const foreignTabs = structuredClone(tabs);
    const detail = foreignTabs.tabs[0]!.detail;
    if (detail.kind === "plugin") detail.pluginId = "another-plugin";
    const slot = renderSlot(
      app.composerCustomizations[0]!.banners![0]!,
      {},
      {
        composer: { scope: { kind: "thread", threadId: "thr_origin" } },
        experimental_panelTabs: foreignTabs,
        rpc: { workflowActiveRuns: () => ({ runs: [run] }) },
      },
    );
    expect(
      await slot.findByRole("button", { name: `Workflow: ${run.name}` }),
    ).toBeTruthy();
  });
});
