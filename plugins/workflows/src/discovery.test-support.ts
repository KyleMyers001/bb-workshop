import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";

export const discoverySource = (value: string) => `export const meta = { name: "meta-${value}", description: "Discovery fixture", phases: [] }; return ${JSON.stringify(value)};`;
export const missingDiscoveryFile = () => Object.assign(new Error("missing file"), { status: 404, code: "ENOENT" });

export async function discoveryHost() {
  const files = new Map<string, string | Error>();
  const host = createFakePluginHost({
    pluginId: "workflows",
    agentSkillIds: ["workflows"],
    settings: { sharedWorkflowDirectory: "/shared" },
    sdk: {
      threads: {
        get: async ({ threadId }) => ({ id: threadId, environmentId: "env-request", providerId: "codex", status: "idle" }) as never,
        defaultExecutionOptions: async () => ({ model: "model-test", reasoningLevel: "medium", permissionMode: "full", serviceTier: "default", source: "default" }),
        spawn: async () => ({ id: "worker-test" }) as never,
        send: async () => ({ ok: true }),
        stop: async () => ({ ok: true }),
      },
      environments: { get: async () => ({ id: "env-request", projectId: "project-test", hostId: "host-request", path: "/request" }) as never },
      hosts: { directory: async ({ path }) => ({ directory: path!, parent: null, roots: [],
        entries: [...files.keys()].filter((name) => name.startsWith(`${path}/`) && !name.slice(path!.length + 1).includes("/")).map((name) => ({ kind: "file" as const, name: name.split("/").at(-1)!, path: name })),
      }) },
      files: {
        read: async ({ path }) => {
          const value = files.get(path);
          if (value === undefined) throw missingDiscoveryFile();
          if (value instanceof Error) throw value;
          return { content: value, contentEncoding: "utf8", sizeBytes: Buffer.byteLength(value), sha256: "fixture" };
        },
      },
      providers: {
        list: async () => [{ id: "codex", displayName: "Codex", logoUrl: null, available: true, capabilities: { supportsThreadArchive: true, supportsThreadRename: true, supportsServiceTier: true, supportsNativeUserQuestion: false, supportsFork: true, permissionModes: ["full"] }, composerActions: [] }],
        models: async () => ({ providers: [], selectedOnlyModels: [], modelLoadError: null, models: [{ id: "model-test", model: "model-test", displayName: "Test", description: "Test", supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Test" }], defaultReasoningEffort: "medium", isDefault: true }] }),
      },
    },
  });
  await plugin(host.bb);
  return { ...host, files };
}
