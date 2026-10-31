import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function requireOutside(root: string, destination: string): void {
  const path = relative(root, destination);
  if (!path || (path !== ".." && !path.startsWith(`..${sep}`))) {
    throw new Error("Backup destination must be outside the checkout");
  }
}

export function backup(root: string, destination: string): string {
  root = realpathSync(root);
  destination = resolve(destination);
  requireOutside(root, destination);
  const git = (...args: string[]) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  git("symbolic-ref", "--quiet", "HEAD");
  if (git("status", "--porcelain", "--untracked-files=all")) {
    throw new Error("Commit source changes first; a snapshot requires a clean checkout");
  }
  mkdirSync(destination, { recursive: true });
  destination = realpathSync(destination);
  requireOutside(root, destination);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshot = mkdtempSync(join(destination, `bb-workshop-${stamp}-`));
  chmodSync(snapshot, 0o700);
  const bundle = join(snapshot, `${basename(snapshot)}.bundle`);
  git("bundle", "create", bundle, "--all");
  chmodSync(bundle, 0o600);
  git("bundle", "verify", bundle);
  return bundle;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 3 || process.argv[2]?.startsWith("-")) {
      throw new Error("Usage: npm run backup -- [destination-directory]");
    }
    const bundle = backup(fileURLToPath(new URL("..", import.meta.url)),
      process.argv[2] ?? join(homedir(), "Backups", "bb-workshop"));
    console.log(`Verified local Git snapshot: ${bundle}`);
    console.log("Committed source only; not BB settings, automatic, or off-machine backup.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Backup failed");
    process.exitCode = 1;
  }
}
