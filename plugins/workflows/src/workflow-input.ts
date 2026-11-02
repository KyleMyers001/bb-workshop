import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  resolveWorkflowSource,
  type ResolvedWorkflowSource,
  type WorkflowSourceContext,
  type WorkflowSourceInput,
  type WorkflowSourceResolverDependencies,
} from "./source-resolution.js";
import {
  validateWorkflowSource,
  type WorkflowValidationSummary,
} from "./workflow-validation.js";

interface PreparedWorkflowSource extends ResolvedWorkflowSource {
  validation: WorkflowValidationSummary;
}

export function workflowSourceDependencies(
  bb: BbPluginApi,
  sharedWorkflowDirectory: string | null = null,
): WorkflowSourceResolverDependencies {
  return {
    sharedWorkflowDirectory,
    async getThreadEnvironmentId(threadId) {
      const thread = await bb.sdk.threads.get({ threadId });
      return thread.environmentId;
    },
    async getEnvironment(environmentId) {
      const environment = await bb.sdk.environments.get({ environmentId });
      return {
        id: environment.id,
        projectId: environment.projectId,
        hostId: environment.hostId,
        path: environment.path,
      };
    },
    readFile(input) {
      return bb.sdk.files.read(input);
    },
  };
}

export async function prepareWorkflowSource(
  bb: BbPluginApi,
  context: WorkflowSourceContext,
  input: WorkflowSourceInput,
  sharedWorkflowDirectory: string | null = null,
): Promise<PreparedWorkflowSource> {
  const resolved = await resolveWorkflowSource(input, context,
    workflowSourceDependencies(bb, sharedWorkflowDirectory));
  const validation = await validateWorkflowSource(
    resolved.source,
    resolved.environmentId,
    {
      listProviders(environmentId) {
        return bb.sdk.providers.list({ environmentId });
      },
      loadModels(environmentId, providerId) {
        return bb.sdk.providers.models({ environmentId, providerId });
      },
      async originPermissionMode() {
        if (!("threadId" in context)) return null;
        const defaults = await bb.sdk.threads.defaultExecutionOptions({
          threadId: context.threadId,
        });
        return defaults?.permissionMode ?? null;
      },
    },
  );
  return { ...resolved, validation };
}
