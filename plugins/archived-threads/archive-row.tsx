import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import type { ArchivedThread } from "./use-archived-threads";

export function ArchiveRow({ thread, project }: {
  thread: ArchivedThread;
  project: string;
}) {
  const navigate = useBbNavigate();
  const title = thread.title || thread.titleFallback || "Untitled thread";
  const archived = thread.archivedAt === null ? null : new Date(thread.archivedAt);
  return (
    <li>
      <button type="button" onClick={() => navigate.toThread(thread.id)}
        className="flex w-full items-start gap-3 rounded-md px-4 py-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
        <Icon name="Archive" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium">{title}</span>
          <span className="mt-1 block break-words text-xs text-muted-foreground">
            {project} · {thread.providerId}
            {archived && <> · Archived <time dateTime={archived.toISOString()}>
              {archived.toLocaleString()}
            </time></>}
          </span>
        </span>
        <Icon name="ArrowRight" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}
