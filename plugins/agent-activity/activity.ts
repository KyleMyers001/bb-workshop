import type { experimental_useSidebarThreads } from "@get-bb/plugin-sdk/app";

export type SidebarThread = ReturnType<typeof experimental_useSidebarThreads>["threads"][number];
export type ActivityGroup = "running" | "waiting" | "errors";

export function groupActivity(threads: readonly SidebarThread[]) {
  const groups: Record<ActivityGroup, SidebarThread[]> = {
    running: [], waiting: [], errors: [],
  };
  for (const thread of threads) {
    if (thread.isHidden || thread.isArchived) continue;
    if (thread.hasPendingInteraction) {
      groups.waiting.push(thread);
    } else if (thread.status === "error") {
      groups.errors.push(thread);
    } else if (thread.runtimeStatus === "active" || (
      thread.runtimeStatus === "idle" && (
        thread.activity.backgroundAgents > 0 ||
        thread.activity.backgroundCommands > 0 ||
        thread.activity.workflows > 0
      )
    )) {
      groups.running.push(thread);
    }
  }
  for (const rows of Object.values(groups)) {
    rows.sort((a, b) => b.latestAttentionAt - a.latestAttentionAt ||
      a.displayTitle.localeCompare(b.displayTitle) || a.id.localeCompare(b.id));
  }
  return groups;
}
