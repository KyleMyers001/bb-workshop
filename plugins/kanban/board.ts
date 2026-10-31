import { experimental_PluginRpcRefusal, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { BOARD_CHANGED, COLUMN_IDS, type Card } from "./model";
import type { ListInput, MoveInput } from "./contract";

const columnSchema = z.enum(COLUMN_IDS);
const noteSchema = z.string().max(280);
const timeSchema = z.number().finite().nonnegative();
const actorSchema = z.enum(["agent", "user", "cli"]);

export function createBoard(bb: BbPluginApi) {
  async function list({ projectId, offset, limit }: ListInput) {
    const rows = await bb.sdk.threads.list({
      ...(projectId ? { projectId } : {}),
      archived: false, includeHidden: false, offset, limit: limit + 1,
    });
    const visible = rows.slice(0, limit);
    const metadata = visible.length === 0 ? [] : (
      await bb.sdk.threads.experimental_listPluginMetadata({ threadIds: visible.map(t => t.id) })
    ).threads;
    const states = new Map(metadata.map(row => [row.threadId, row.metadata]));
    const cards: Card[] = visible.map(thread => {
      const state = states.get(thread.id) ?? {};
      return {
        id: thread.id, projectId: thread.projectId,
        title: thread.title || thread.titleFallback || "Untitled thread",
        column: columnSchema.safeParse(state.column).data ?? "backlog",
        note: noteSchema.safeParse(state.note).data ?? "",
        movedAt: timeSchema.safeParse(state.movedAt).data ?? null,
        movedBy: actorSchema.safeParse(state.movedBy).data ?? null,
        runtimeStatus: thread.runtime.displayStatus,
        providerId: thread.providerId, updatedAt: thread.updatedAt,
      };
    });
    return { cards, hasMore: rows.length > limit };
  }

  async function move(input: MoveInput, movedBy: "agent" | "user" | "cli") {
    const thread = await bb.sdk.threads.get({ threadId: input.threadId });
    if (thread.projectId !== input.projectId || thread.archivedAt !== null ||
        thread.deletedAt !== null || thread.visibility === "hidden") {
      throw new experimental_PluginRpcRefusal({
        code: "invalid", message: "Choose a visible, unarchived thread in this project.",
      });
    }
    // A single patch keeps column, note and attribution together. Other metadata survives.
    await bb.sdk.threads.updatePluginMetadata({
      threadId: thread.id,
      set: { column: input.column, note: input.note, movedBy, movedAt: Date.now() },
    });
    bb.realtime.publish(BOARD_CHANGED, { projectId: thread.projectId });
    return { threadId: thread.id, column: input.column };
  }
  return { list, move };
}
export type Board = ReturnType<typeof createBoard>;
