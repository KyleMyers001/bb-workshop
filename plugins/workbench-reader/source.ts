import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";

export const DEFAULT_FOLDERS = "Reports\nPlans\nInvestigations\nDesigns\nHandoffs";
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const excluded = new Set(["node_modules", "dist", "build", "worktrees"]);
export type SourceConfig = { root: string; folders: string[] };

export function validRelative(path: string): boolean {
  return !!path && path.length <= 4096 && !isAbsolute(path) &&
    !/[\\\u0000-\u001f]/.test(path) && path.split("/").every(part =>
      !!part && !part.startsWith(".") && !excluded.has(part.toLowerCase()));
}

export function sourceConfig(root: string, folders: string): SourceConfig {
  root = root.trim();
  if (root === "~" || root.startsWith("~/")) root = join(homedir(), root.slice(2));
  if (!isAbsolute(root) || /[\u0000-\u001f]/.test(root))
    throw new Error("Set an absolute Workbench directory (or ~/Workbench).");
  const selected = folders.split("\n").map(folder => folder.trim()).filter(Boolean);
  if (!selected.length || selected.length > 30 || selected.some(folder => !validRelative(folder)))
    throw new Error("Choose 1–30 relative document folders; hidden/build/worktree paths are excluded.");
  if (selected.some((folder, i) => selected.some((other, j) =>
    i !== j && (folder.toLowerCase() === other.toLowerCase() || folder.toLowerCase().startsWith(other.toLowerCase() + "/")))))
    throw new Error("Document folders must not overlap.");
  return { root: resolve(root), folders: selected };
}

export function approved(config: SourceConfig, path: string): boolean {
  return validRelative(path) && config.folders.some(folder => path === folder || path.startsWith(folder + "/"));
}

export async function canonicalRoot(config: SourceConfig): Promise<string> {
  const info = await lstat(config.root);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("Workbench must be a directory, not a symbolic link.");
  return realpath(config.root);
}

// Refuse symlinks at every level, not just at the final file.
export async function checkedPath(config: SourceConfig, path: string): Promise<string> {
  if (!approved(config, path)) throw new Error("File is outside approved document folders.");
  const root = await canonicalRoot(config);
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error("Symbolic links are not read.");
  }
  const canonical = await realpath(current);
  if (!canonical.startsWith(root + sep)) throw new Error("File is outside Workbench.");
  return canonical;
}
