import type { ExperimentalBadge } from "@get-bb/plugin-sdk/app";
import type { Summary } from "./model";
import { useSummary } from "./use-inbox";

export function badgeFor(summary: Summary | null, stale: boolean): ExperimentalBadge | null {
  if (!summary || stale) return { text: "?", label: "Needs you: inbox status unknown", tone: "warning" };
  if (summary.limited) return { text: `${summary.open}+`,
    label: `Needs you: at least ${summary.open} open requests; partial thread coverage`, tone: "warning" };
  return summary.open ? { count: summary.open, label: `${summary.open} open attention requests`, tone: "warning" } : null;
}
export function useInboxBadge() {
  const { data, stale } = useSummary();
  return badgeFor(data, stale);
}
