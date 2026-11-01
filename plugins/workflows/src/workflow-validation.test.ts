import { describe, expect, it } from "vitest";
import {
  validateWorkflowSource,
  type WorkflowCatalogDependencies,
} from "./workflow-validation.js";

const SOURCE = `export const meta = {
  name: "catalog-test",
  description: "Validate a literal selection",
};
return agent("review", {
  provider: "codex",
  model: "gpt-test",
  reasoningLevel: "medium",
});`;

function catalog(
  overrides: Partial<WorkflowCatalogDependencies> = {},
): WorkflowCatalogDependencies {
  return {
    listProviders: async () => [
      {
        id: "codex",
        available: true,
        capabilities: { permissionModes: ["full"] },
      },
    ],
    originPermissionMode: async () => "full",
    loadModels: async () => ({
      modelLoadError: null,
      selectedOnlyModels: [],
      models: [
        {
          id: "gpt-test",
          model: "gpt-test",
          supportedReasoningEfforts: [{ reasoningEffort: "medium" }],
        },
      ],
    }),
    ...overrides,
  };
}

describe("workflow validation", () => {
  it("validates every safely discoverable literal tuple", async () => {
    await expect(
      validateWorkflowSource(SOURCE, "env-1", catalog()),
    ).resolves.toMatchObject({
      valid: true,
      metadata: { name: "catalog-test" },
      literalSelections: [
        {
          provider: "codex",
          model: "gpt-test",
          reasoningLevel: "medium",
        },
      ],
    });
  });

  it("returns canonical phase metadata and validates native display options", async () => {
    const source = `export const meta = {
      name: "phase-validation",
      description: "Validate phases",
      phases: [{ title: "Inspect", detail: "Read first" }, { title: "Verify" }],
    };
    return agent("review", {
      label: "Reader",
      phase: "Inspect",
      schema: { type: "object" },
    });`;

    await expect(
      validateWorkflowSource(source, "env-1", catalog()),
    ).resolves.toMatchObject({
      metadata: {
        phases: [
          { title: "Inspect", detail: "Read first" },
          { title: "Verify", detail: null },
        ],
      },
    });
  });

  describe("permission modes", () => {
    const withMode = (mode: string) =>
      SOURCE.replace(
        `reasoningLevel: "medium",`,
        `reasoningLevel: "medium",\n  permissionMode: "${mode}",`,
      );
    const autoOrigin = catalog({ originPermissionMode: async () => "auto" });

    it("rejects an inherited mode the provider lacks and names the fix", async () => {
      await expect(
        validateWorkflowSource(SOURCE, "env-1", autoOrigin),
      ).rejects.toThrow(
        'inherited permission mode "auto"; set permissionMode on this agent call to one of full',
      );
    });

    it("accepts a supported explicit mode over the inherited one", async () => {
      await expect(
        validateWorkflowSource(withMode("full"), "env-1", autoOrigin),
      ).resolves.toMatchObject({
        literalSelections: [{ permissionMode: "full" }],
      });
    });

    it("rejects an unsupported explicit mode", async () => {
      await expect(
        validateWorkflowSource(withMode("auto"), "env-1", catalog()),
      ).rejects.toThrow(
        'Provider codex does not support permission mode "auto"',
      );
    });

    it("defers the inherited check when there is no origin thread", async () => {
      await expect(
        validateWorkflowSource(
          SOURCE,
          "env-1",
          catalog({ originPermissionMode: async () => null }),
        ),
      ).resolves.toMatchObject({ valid: true });
    });
  });

  it("distinguishes provider, model-load, model, and reasoning failures", async () => {
    await expect(
      validateWorkflowSource(
        SOURCE,
        "env-1",
        catalog({ listProviders: async () => [] }),
      ),
    ).rejects.toThrow("Unavailable provider");
    await expect(
      validateWorkflowSource(
        SOURCE,
        "env-1",
        catalog({
          loadModels: async () => ({
            models: [],
            selectedOnlyModels: [],
            modelLoadError: { providerId: "codex", code: "auth_required" },
          }),
        }),
      ),
    ).rejects.toThrow("Model-load error");
    await expect(
      validateWorkflowSource(
        SOURCE,
        "env-1",
        catalog({
          loadModels: async () => {
            throw new Error("host disconnected");
          },
        }),
      ),
    ).rejects.toThrow("Model-load error for provider codex: host disconnected");
    await expect(
      validateWorkflowSource(
        SOURCE,
        "env-1",
        catalog({
          loadModels: async () => ({
            models: [],
            selectedOnlyModels: [],
            modelLoadError: null,
          }),
        }),
      ),
    ).rejects.toThrow("Model mismatch");
    await expect(
      validateWorkflowSource(
        SOURCE,
        "env-1",
        catalog({
          loadModels: async () => ({
            selectedOnlyModels: [],
            modelLoadError: null,
            models: [
              {
                id: "gpt-test",
                model: "gpt-test",
                supportedReasoningEfforts: [{ reasoningEffort: "high" }],
              },
            ],
          }),
        }),
      ),
    ).rejects.toThrow("Unsupported reasoning");
  });

  it("rejects selected-only models for explicit literal selections", async () => {
    await expect(
      validateWorkflowSource(
        SOURCE,
        "env-1",
        catalog({
          loadModels: async () => ({
            models: [],
            selectedOnlyModels: [
              {
                id: "gpt-test",
                model: "gpt-test",
                supportedReasoningEfforts: [{ reasoningEffort: "medium" }],
              },
            ],
            modelLoadError: null,
          }),
        }),
      ),
    ).rejects.toThrow("Model mismatch");
  });
});
