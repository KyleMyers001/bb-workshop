import { afterEach, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { createInbox } from "../inbox";
import { viewInputSchema } from "../model";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map(fn => fn())); });

it("derives a clearly labeled fallback from Kanban without moving the thread", async () => {
  const thread = makeThreadResponse({ id: "thr_one", projectId: "proj_one" });
  const { bb, harness } = createFakePluginHost({ pluginId: "needs-you", sdk: {
    projects: { list: async () => [{ id: "proj_one", name: "Workshop" }] as any },
    threads: {
      list: async () => [thread],
      experimental_listPluginMetadata: async () => ({ threads: [{ threadId: thread.id, metadata: { column: "blocked", note: "Need a scope decision", movedAt: 100 } }] }),
    },
  } });
  cleanups.push(() => harness.lifecycle.dispose());
  const inbox = createInbox(bb);
  const result = await inbox.view(viewInputSchema.parse({}));
  expect(result.items).toMatchObject([{ threadId: thread.id, projectName: "Workshop", kind: "blocker", source: "kanban", ask: "Need a scope decision" }]);
  expect(result.open).toBe(1);
  expect(harness.inspection.sdk.callsTo("threads.experimental_listPluginMetadata")[0]?.[0]).toMatchObject({ pluginId: "kanban", threadIds: [thread.id] });
  expect(harness.inspection.sdk.callsTo("threads.updatePluginMetadata")).toHaveLength(0);
});
