import type { WorkflowCallView, WorkflowRunView } from "./ui-contract.js";

// Deterministic UI fixtures, not workflow totals or dependencies. The two
// independent lanes deliberately overlap the Review and Verify phases.
export function makeCall(
  overrides: Partial<WorkflowCallView> = {},
): WorkflowCallView {
  return {
    id: "wfc_review",
    index: 0,
    label: "Runtime & lifecycle",
    phase: "Review",
    status: "running",
    provider: "pi",
    model: "openai-codex/gpt-6.1-sol",
    reasoningLevel: "high",
    cached: false,
    childThreadId: "thr_runtime",
    providerRetryAttempts: 0,
    repairAttempts: 0,
    error: null,
    createdAt: 1_000,
    startedAt: 1_000,
    finishedAt: null,
    ...overrides,
  };
}

export const overlappingRun: WorkflowRunView = {
  id: "wfr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Workflow review & verification",
  description:
    "Independent reviews of runtime behavior and contract boundaries, followed by verification.",
  status: "running",
  currentPhase: "Verify",
  phases: [
    {
      title: "Review",
      detail: null,
      calls: [
        makeCall(),
        makeCall({
          id: "wfc_contracts",
          index: 1,
          label: "Contracts & boundaries",
          status: "succeeded",
          finishedAt: 21_000,
          cached: true,
          childThreadId: "thr_contracts",
        }),
      ],
    },
    {
      title: "Verify",
      detail: null,
      calls: [
        makeCall({
          id: "wfc_verify",
          index: 2,
          label: "Verify contracts & boundaries",
          phase: "Verify",
          startedAt: 22_000,
          childThreadId: "thr_verify",
        }),
      ],
    },
    { title: "Summarize", detail: "Collect the available results.", calls: [] },
  ],
  unphasedCalls: [
    makeCall({
      id: "wfc_unphased",
      index: 3,
      phase: null,
      label: "Unphased compatibility check",
      status: "queued",
      childThreadId: null,
      startedAt: null,
    }),
  ],
  resultAvailable: false,
  error: null,
  createdAt: 900,
  startedAt: 1_000,
  finishedAt: null,
};
