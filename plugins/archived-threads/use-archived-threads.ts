import { useEffect, useState } from "react";
import { useSdk } from "@get-bb/plugin-sdk/app";

export const PAGE_SIZE = 50;
type ThreadRow = Awaited<ReturnType<ReturnType<typeof useSdk>["threads"]["list"]>>[number];
export type ArchivedThread = Pick<ThreadRow,
  "id" | "title" | "titleFallback" | "projectId" | "providerId" | "archivedAt">;
type ArchivePage = {
  threads: ArchivedThread[];
  projects: Record<string, string>;
  matchCount: number | null;
  hasNext: boolean;
};
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; page: ArchivePage };

export function useArchivedThreads(query: string, offset: number, revision: number) {
  const sdk = useSdk();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setState({ status: "loading" });
    async function load() {
      try {
        const [result, projects] = await Promise.all([
          query
            ? sdk.threads.search({ query, limitPerGroup: String(PAGE_SIZE), signal })
            : sdk.threads.list({ archived: true, includeHidden: false,
                limit: PAGE_SIZE, offset, signal }),
          sdk.projects.list({ includePersonal: true, signal }),
        ]);
        const rows = Array.isArray(result)
          ? result : result.archived.results.map(({ thread }) => thread);
        if (signal.aborted) return;
        setState({ status: "ready", page: {
          threads: rows.filter((thread) => thread.archivedAt !== null
            && thread.deletedAt === null && thread.visibility !== "hidden"),
          projects: Object.fromEntries(projects.map(({ id, name }) => [id, name])),
          matchCount: Array.isArray(result) ? null : result.archived.total,
          hasNext: Array.isArray(result) && rows.length === PAGE_SIZE,
        } });
      } catch (cause) {
        if (!signal.aborted) setState({ status: "error",
          message: cause instanceof Error ? cause.message : "Unable to load archived threads." });
      }
    }
    void load();
    return () => controller.abort();
  }, [sdk, query, offset, revision]);
  return state;
}
