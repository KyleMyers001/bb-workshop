import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { parseWorkflowSource } from "./parser.js";
import {
  getWorkflowSourceEnvironment,
  isMissingWorkflowFile,
  pathFlavor,
  readWorkflowFile,
  resolveConfinedWorkflowPath,
  workflowNamePath,
  type WorkflowSourceContext,
} from "./source-resolution.js";
import { workflowSourceDependencies } from "./workflow-input.js";
import { utf8Prefix } from "./utf8.js";

export const CATALOG_LIMITS = Object.freeze({
  defaultEntries: 20,
  maxEntries: 50,
  scanPathsPerRoot: 1_000,
  inspectNames: 100,
  metadataBytes: 8_192,
  outputBytes: 65_536,
});

export interface WorkflowCatalogOptions {
  limit?: number;
  name?: string;
}

interface CatalogEntry {
  lookupName: string;
  scope: "local" | "shared";
  path: string;
  selected: boolean;
  shadowedBy: string | null;
  metadata: ReturnType<typeof parseWorkflowSource>["metadata"] | null;
  metadataOmitted: boolean;
  diagnostic: string | null;
}

function diagnostic(error: unknown): string {
  return utf8Prefix(error instanceof Error ? error.message : String(error), 1_024);
}

/** Discovery parses literals only: no VM, model catalog, or provider calls. */
export async function catalogWorkflows(
  bb: BbPluginApi,
  context: WorkflowSourceContext,
  sharedWorkflowDirectory: string | null = null,
  options: WorkflowCatalogOptions = {},
) {
  const limit = options.limit ?? CATALOG_LIMITS.defaultEntries;
  if (!Number.isInteger(limit) || limit < 1 || limit > CATALOG_LIMITS.maxEntries) {
    throw new Error(`Catalog limit must be from 1 through ${CATALOG_LIMITS.maxEntries}`);
  }
  const dependencies = workflowSourceDependencies(bb, sharedWorkflowDirectory);
  const environment = await getWorkflowSourceEnvironment(context, dependencies);
  const localRoot = pathFlavor(environment.path).join(environment.path, ".bb", "workflows");
  if (options.name !== undefined) workflowNamePath(environment.path, options.name);
  const diagnostics: string[] = [];
  let scanIncomplete = false;
  let outputTruncated = false;
  const names = new Set<string>();

  async function scan(root: string, scope: "local" | "shared") {
    try {
      // Directory browsing is top-level and includes file symlinks. Recursive
      // listPaths silently omits symlinks and even returns [] for missing roots.
      // Content is still read separately with files.read root confinement.
      const listing = await bb.sdk.hosts.directory({ hostId: environment.hostId, path: root });
      const confinementRoot = scope === "local" ? environment.path : root;
      resolveConfinedWorkflowPath(confinementRoot, listing.directory);
      if (scope === "shared" && pathFlavor(root).relative(root, listing.directory) !== "") {
        throw new Error("Shared directory resolves through a symlink; source read confinement forbids symlink roots");
      }
      if (listing.entries.length > CATALOG_LIMITS.scanPathsPerRoot) {
        scanIncomplete = true;
        diagnostics.push(`${scope} scan incomplete: host path listing reached its limit`);
      }
      for (const entry of listing.entries.slice(0, CATALOG_LIMITS.scanPathsPerRoot)) {
        if (entry.kind !== "file" || !/^[a-z][a-z0-9-]{0,63}\.js$/.test(entry.name)) continue;
        // Never trust paths supplied by directory browsing for content reads.
        names.add(entry.name.slice(0, -3));
      }
    } catch (error) {
      if (scope === "local" && isMissingWorkflowFile(error)) return;
      scanIncomplete = true;
      diagnostics.push(`${scope} directory ${root} on host ${environment.hostId}: ${diagnostic(error)}`);
    }
  }

  if (options.name !== undefined) {
    names.add(options.name);
  } else {
    await scan(localRoot, "local");
    if (sharedWorkflowDirectory !== null) await scan(sharedWorkflowDirectory, "shared");
  }
  const sortedNames = [...names].sort();
  if (sortedNames.length > CATALOG_LIMITS.inspectNames) {
    scanIncomplete = true;
    diagnostics.push(`Inspection limited to ${CATALOG_LIMITS.inspectNames} lookup names`);
  }
  const entries: CatalogEntry[] = [];
  let omittedEntries = 0;

  function append(entry: CatalogEntry) {
    if (entries.length >= limit || Buffer.byteLength(JSON.stringify([...entries, entry])) > CATALOG_LIMITS.outputBytes - 8_192) {
      outputTruncated = true;
      omittedEntries += 1;
    } else {
      entries.push(entry);
    }
  }

  async function inspect(name: string, scope: "local" | "shared", shadowedBy: string | null) {
    const root = scope === "local" ? environment.path : sharedWorkflowDirectory!;
    const filePath = workflowNamePath(root, name, scope === "shared");
    let source: string;
    let metadata: CatalogEntry["metadata"] = null;
    let errorText: string | null = null;
    let metadataOmitted = false;
    try {
      source = await readWorkflowFile(dependencies, environment, filePath, root);
    } catch (error) {
      if (error instanceof Error && isMissingWorkflowFile(error.cause)) return false;
      errorText = diagnostic(error);
    }
    if (errorText === null) {
      try {
        metadata = parseWorkflowSource(source!).metadata;
        if (Buffer.byteLength(JSON.stringify(metadata)) > CATALOG_LIMITS.metadataBytes) {
          metadata = null;
          metadataOmitted = true;
          outputTruncated = true;
          errorText = `Metadata omitted: exceeds ${CATALOG_LIMITS.metadataBytes} bytes; inspect source`;
        }
      } catch (error) { errorText = diagnostic(error); }
    }
    append({ lookupName: name, scope, path: filePath, selected: shadowedBy === null,
      shadowedBy, metadata, metadataOmitted, diagnostic: errorText });
    return true;
  }

  for (const name of sortedNames.slice(0, CATALOG_LIMITS.inspectNames)) {
    // Probe local even if the bounded scanner did not see it (e.g. symlinks).
    // An invalid local override still shadows shared; discovery never substitutes.
    const localExists = await inspect(name, "local", null);
    if (sharedWorkflowDirectory !== null) {
      await inspect(name, "shared", localExists ? workflowNamePath(environment.path, name) : null);
    }
  }
  if (options.name !== undefined && entries.length === 0 && omittedEntries === 0) {
    diagnostics.push(`No workflow found for lookup name ${options.name}`);
  }
  return {
    environmentId: environment.id,
    hostId: environment.hostId,
    entries,
    diagnostics: diagnostics.map((text) => utf8Prefix(text, 1_024)),
    scanIncomplete,
    outputTruncated,
    omittedEntries,
    limits: CATALOG_LIMITS,
    scanPolicy: "Top-level kebab-case .js file names only. Host directory browsing omits dangling symlinks; use name to inspect a known candidate. Truncated results are not exhaustive.",
  };
}
