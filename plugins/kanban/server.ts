import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createBoard } from "./board";
import { rpcContract, moveSchema } from "./contract";
import { registerCli } from "./cli";
import { BOARD_CHANGED } from "./model";

export default function plugin(bb: BbPluginApi) {
  const board = createBoard(bb);
  bb.rpc.register(rpcContract, {
    projects_list: async () => ({
      projects: (await bb.sdk.projects.list({ includePersonal: true }))
        .map(({ id, name }) => ({ id, name })),
    }),
    board_list: input => board.list(input),
    card_move: input => board.move(input, "user"),
  });
  registerCli(bb, board);
  bb.agents.registerTool({
    name: "kanban_move",
    description: "Move your thread's Kanban card as work progresses. Columns: backlog, in-progress, blocked, review, done. Add an optional short progress or blocker note.",
    parameters: moveSchema,
    presentation: { label: { pending: "Updating Kanban card", completed: "Updated Kanban card" } },
    async execute(input, { threadId, projectId }) {
      const result = await board.move({ ...input, threadId, projectId }, "agent");
      return JSON.stringify(result);
    },
  });
  bb.agents.configure(() => ({
    tools: ["kanban_move"],
    skills: ["kanban-board"],
    instructions: "When doing task work, use the kanban-board skill to keep your thread's card current: in-progress when starting, blocked for a blocker, review when awaiting review, done only when the requested work is complete. Use kanban_move or bb kanban move. Skip hidden or archived threads.",
  }));
  for (const event of ["thread.created", "thread.active", "thread.idle", "thread.failed",
    "thread.archived", "thread.unarchived", "thread.deleted"] as const) {
    // Runtime events refresh the board but do not decide whether a task is finished.
    bb.events.on(event, ({ thread }) => {
      bb.realtime.publish(BOARD_CHANGED, { projectId: thread.projectId });
    });
  }
}
