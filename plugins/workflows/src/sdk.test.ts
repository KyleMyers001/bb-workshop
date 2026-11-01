import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createFakePluginHost,
  experimental_scanPublicSdkOnly,
  makePluginAgentConfigurationContext,
} from "@get-bb/plugin-sdk/testing";
import { expect, it } from "vitest";
import plugin from "./server.js";

it("uses only public SDK and package-local UI dependencies", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const packages = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
  const allow = packages.map((name) => new RegExp(
    `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|$)`,
  ));
  const scan = experimental_scanPublicSdkOnly(root, {
    allow: [...allow, /^@\/(?:components|lib)\//],
  });
  expect(scan.violations).toEqual([]);
  expect(scan.privateDependencies).toEqual([]);
});

it("keeps the familiar author and worker tools under the fork's plugin ID", async () => {
  const { bb, harness } = createFakePluginHost({
    pluginId: "workshop-workflows",
    agentSkillIds: ["workflows"],
  });
  try {
    await plugin(bb);
    const author = await harness.behavior.resolveAgentConfiguration(
      makePluginAgentConfigurationContext(),
    );
    expect(author.tools.map(tool => tool.name)).toEqual(["bb_workflow_run"]);
    expect(author.skills).toEqual(["workflows"]);
    const worker = await harness.behavior.resolveAgentConfiguration(
      makePluginAgentConfigurationContext({ origin: { pluginId: bb.pluginId } }),
    );
    expect(worker.tools.map(tool => tool.name)).toEqual(["bb_workflow_result"]);
    expect(worker.skills).toEqual([]);
    const cli = await harness.behavior.runCli(["--help"]);
    expect(cli.exitCode).toBe(0);
    expect(cli.stdout).toContain("bb workflows");
  } finally {
    await harness.lifecycle.dispose();
  }
});
