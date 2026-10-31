import { z } from "zod";
import type { Store } from "./store";

const metadataSchema = z.object({
  column: z.enum(["backlog", "in-progress", "blocked", "review", "done"]),
  note: z.string().max(280).catch(""),
  movedAt: z.number().finite().nonnegative().nullable().catch(null),
});

export function reconcileKanban(store: Store, threadId: string, metadata: unknown) {
  const state = metadataSchema.safeParse(metadata).data;
  if (!state || !["blocked", "review"].includes(state.column)) {
    store.withdraw(threadId, "board", "kanban");
    return;
  }
  const review = state.column === "review";
  store.report(threadId, "board", {
    kind: review ? "review" : "blocker",
    title: review ? "Thread is marked Review in Kanban" : "Thread is marked Blocked in Kanban",
    ask: state.note || (review ? "This thread has moved into Review."
      : "This thread is marked Blocked. This does not establish that you are the blocker."),
    context: "Derived from Kanban metadata, not a structured request. The column is not verification evidence or permission to act.",
    recommendation: "Open the thread to inspect what is actually needed.",
  }, "kanban", JSON.stringify(state));
}
