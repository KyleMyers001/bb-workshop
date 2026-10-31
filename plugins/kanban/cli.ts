import { cliCommand, defineCli, PluginCliError, type BbPluginApi } from "@get-bb/plugin-sdk";
import { cardMoveSchema, listSchema } from "./contract";
import type { Board } from "./board";

function required(value: string | undefined, flag: string) {
  if (value) return value;
  throw new PluginCliError(`Missing context. Add ${flag}.`, {
    code: "missing_context", hint: `Pass ${flag} when running outside a BB thread.`,
  });
}

export function registerCli(bb: BbPluginApi, board: Board) {
  bb.cli.register(defineCli({
    name: "kanban",
    summary: "Read the thread board and move thread cards as work progresses",
    commands: {
      list: cliCommand({
        summary: "List a project's thread cards (100 per page)",
        options: {
          project: { type: "string", description: "Project ID; defaults to this thread's project" },
          offset: { type: "integer", min: 0, max: 1_000_000, default: 0, description: "Pagination offset" },
          json: { type: "boolean", description: "Output JSON" },
        },
        async run({ options }, context) {
          const result = await board.list(listSchema.parse({
            projectId: required(options.project ?? context.projectId, "--project <project-id>"),
            offset: options.offset,
          }));
          const lines = result.cards.map(card => `${card.column.padEnd(12)} ${card.id}  ${card.title}${card.note ? ` — ${card.note}` : ""}`);
          if (result.hasMore) lines.push(`More threads: use --offset ${options.offset + 100}`);
          return { exitCode: 0, stdout: options.json ? JSON.stringify(result) : lines.join("\n") || "No threads in this project." };
        },
      }),
      move: cliCommand({
        summary: "Move a thread to backlog, in-progress, blocked, review, or done",
        positionals: [{ name: "column", required: true, description: "backlog | in-progress | blocked | review | done" }],
        options: {
          thread: { type: "string", description: "Thread ID; defaults to the current thread" },
          project: { type: "string", description: "Project ID; defaults to the selected thread's project" },
          note: { type: "string", description: "Progress or blocker note (max 280 characters); omitted clears old note" },
          json: { type: "boolean", description: "Output JSON" },
        },
        async run({ positionals, options }, context) {
          const threadId = required(options.thread ?? context.threadId, "--thread <thread-id>");
          const projectId = options.project ?? (options.thread
            ? (await bb.sdk.threads.get({ threadId })).projectId
            : context.projectId ?? (await bb.sdk.threads.get({ threadId })).projectId);
          const parsed = cardMoveSchema.safeParse({ threadId, projectId, column: positionals.column, note: options.note });
          if (!parsed.success) throw new PluginCliError(parsed.error.issues.map(issue => issue.message).join("; "), { code: "invalid_input" });
          const result = await board.move(parsed.data, "cli");
          return { exitCode: 0, stdout: options.json ? JSON.stringify(result) : `${threadId} → ${result.column}` };
        },
      }),
    },
  }));
}
