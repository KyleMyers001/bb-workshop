import type { experimental_useSidebarThreads } from "@get-bb/plugin-sdk/app";

export type SidebarThread = ReturnType<typeof experimental_useSidebarThreads>["threads"][number];
export function thread(overrides: Partial<SidebarThread> = {}): SidebarThread {
  return {
    id: "thr_test", projectId: "proj_test", title: "Test thread",
    titleFallback: null, displayTitle: "Test thread", parentThreadId: null,
    lifecycleOwnerThreadId: null, parentNotifications: "auto", sourceThreadId: null,
    sectionId: null, originKind: null, originPluginId: null, providerId: "pi",
    status: "active", runtimeStatus: "active", queuedWork: "none",
    hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: "runtime", indicatorLabel: "Thread working", isUnread: false,
    isPinned: false, pinnedAt: null, pinSortKey: null, isArchived: false,
    archivedAt: null, href: "/projects/proj_test/threads/thr_test", isHidden: false,
    environment: null, host: null, createdAt: 0, updatedAt: 0,
    lastReadAt: null, latestAttentionAt: 0, ...overrides,
  };
}
