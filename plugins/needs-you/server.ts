import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { rpcContract } from "./contract";
import { createInbox } from "./inbox";
import { registerCli } from "./cli";
import { keySchema, raiseSchema, viewInputSchema } from "./model";

export default function plugin(bb: BbPluginApi) {
  const inbox = createInbox(bb);
  bb.rpc.register(rpcContract, {
    projects_list: async () => ({ projects: (await bb.sdk.projects.list({ includePersonal: true }))
      .map(({ id, name }) => ({ id, name })) }),
    inbox_view: input => inbox.view(input),
    inbox_summary: async () => {
      const { items: _items, matching: _matching, hasMore: _hasMore, ...summary } =
        await inbox.view(viewInputSchema.parse({}));
      return summary;
    },
    request_change: input => inbox.change(input),
  });
  registerCli(bb, inbox);
  bb.agents.registerTool({
    name: "needs_you_raise",
    description: "Create or update a specific question, permission request, blocker, or review handoff for Kyle in your own thread. Reuse a stable key for the same ask. Never include secrets. This does not message Kyle or grant permission.",
    parameters: raiseSchema,
    presentation: { label: { pending: "Reporting an attention request", completed: "Reported an attention request" } },
    async execute(input, { threadId, projectId }) {
      return JSON.stringify(await inbox.report(threadId, projectId, input, "agent"));
    },
  });
  bb.agents.registerTool({
    name: "needs_you_withdraw",
    description: "Withdraw an obsolete ask from your own thread's Needs You inbox. Only use when that specific ask no longer needs Kyle. Never treat handled or withdrawn as approval.",
    parameters: z.object({ key: keySchema }).strict(),
    presentation: { label: { pending: "Withdrawing an attention request", completed: "Withdrew an attention request" } },
    async execute({ key }, { threadId, projectId }) {
      return JSON.stringify(await inbox.withdraw(threadId, projectId, key, "agent"));
    },
  });
  bb.agents.configure(() => ({
    tools: ["needs_you_raise", "needs_you_withdraw"], skills: ["needs-you-inbox"],
    instructions: "Use the needs-you-inbox skill when Kyle must answer a specific question, grant permission, intervene on a blocker, or review a handoff. Do not report routine progress or agent-to-agent waits. Skip hidden and archived threads. Inbox status is never permission to act.",
  }));
  for (const event of ["thread.created", "thread.active", "thread.idle", "thread.failed",
    "thread.archived", "thread.unarchived", "thread.deleted"] as const) {
    bb.events.on(event, () => inbox.invalidate());
  }
}
