import { cliCommand, defineCli, PluginCliError, type BbPluginApi, type PluginCliContext } from "@get-bb/plugin-sdk";
import { KINDS, raiseSchema, keySchema, viewInputSchema } from "./model";
import type { Inbox } from "./inbox";

const threadOptions = {
  thread: { type: "string" as const, description: "Thread ID; defaults to your thread" },
  project: { type: "string" as const, description: "Project ID; defaults to the chosen thread's project" },
  json: { type: "boolean" as const, description: "Output JSON" },
};

export function registerCli(bb: BbPluginApi, inbox: Inbox) {
  async function target(options: { thread?: string; project?: string }, context: PluginCliContext) {
    const threadId = options.thread ?? context.threadId;
    if (!threadId) throw new PluginCliError("Missing thread context.", {
      code: "missing_context", hint: "Pass --thread <thread-id> outside a BB thread.",
    });
    const projectId = options.project ?? (await bb.sdk.threads.get({ threadId })).projectId;
    return { threadId, projectId };
  }
  bb.cli.register(defineCli({
    name: "needs-you",
    summary: "Report specific asks for Kyle and read the attention inbox",
    commands: {
      raise: cliCommand({
        summary: "Create or update a specific ask (never include secrets)",
        positionals: [{ name: "key", required: true, description: "Stable ask key: 1–80 lowercase letters, digits, _ or -" }],
        options: {
          ...threadOptions,
          kind: { type: "enum", values: KINDS, required: true, description: "question | permission | blocker | review" },
          title: { type: "string", required: true, description: "Short title (max 160 characters)" },
          ask: { type: "string", required: true, description: "Specific ask (max 2000 characters)" },
          context: { type: "string", description: "Why Kyle is needed (max 2000 characters)" },
          recommendation: { type: "string", description: "Suggested next step (max 1000 characters)" },
        },
        async run({ positionals, options }, context) {
          const { threadId, projectId } = await target(options, context);
          const input = raiseSchema.safeParse({ key: positionals.key, kind: options.kind,
            title: options.title, ask: options.ask, context: options.context, recommendation: options.recommendation });
          if (!input.success) throw new PluginCliError("Invalid request fields or length.", { code: "invalid_input" });
          const result = await inbox.report(threadId, projectId, input.data, "cli");
          return { exitCode: 0, stdout: options.json ? JSON.stringify(result) : `${result.key}: ${result.status} (${result.id})` };
        },
      }),
      withdraw: cliCommand({
        summary: "Withdraw your thread's ask when it no longer needs attention",
        positionals: [{ name: "key", required: true, description: "Existing stable ask key" }],
        options: threadOptions,
        async run({ positionals, options }, context) {
          const key = keySchema.safeParse(positionals.key);
          if (!key.success) throw new PluginCliError("Invalid request key.", { code: "invalid_input" });
          const { threadId, projectId } = await target(options, context);
          const result = await inbox.withdraw(threadId, projectId, key.data, "cli");
          return { exitCode: 0, stdout: options.json ? JSON.stringify(result) : `${result.key}: withdrawn` };
        },
      }),
      list: cliCommand({
        summary: "List 100 inbox requests per page; counts cover scanned threads",
        options: {
          project: { type: "string", description: "Project ID; defaults to this thread's project" },
          all: { type: "boolean", description: "All projects instead of thread context" },
          filter: { type: "enum", values: ["open", ...KINDS, "snoozed", "history"], default: "open", description: "Request type or state" },
          offset: { type: "integer", min: 0, max: 20_000, default: 0, description: "Request pagination offset" },
          threads: { type: "integer", min: 200, max: 10_000, default: 2000, description: "Thread scan cap, in multiples of 200" },
          json: { type: "boolean", description: "Output JSON" },
        },
        async run({ options }, context) {
          if (options.all && options.project) throw new PluginCliError("Choose --all or --project, not both.", { code: "invalid_input" });
          const parsed = viewInputSchema.safeParse({
            projectId: options.all ? undefined : options.project ?? context.projectId,
            filter: options.filter, offset: options.offset, threadLimit: options.threads,
          });
          if (!parsed.success) throw new PluginCliError("Invalid list options; --threads must be a multiple of 200.", { code: "invalid_input" });
          const result = await inbox.view(parsed.data);
          const lines = result.items.map(item => `${item.kind.padEnd(10)} ${item.id}  ${item.title} — ${item.threadId}`);
          if (result.hasMore) lines.push(`More requests: --offset ${options.offset + 100}`);
          if (result.limited) lines.push(`Partial coverage: scanned ${result.loadedThreads} threads; counts are lower bounds. Increase --threads (max 10000) or filter by --project.`);
          return { exitCode: 0, stdout: options.json ? JSON.stringify(result)
            : lines.join("\n") || "No matching requests in the scanned scope." };
        },
      }),
    },
  }));
}
