import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { backup } from "./backup.ts";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "bb-workshop-backup-test-"));
  const git = (...args: string[]) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  git("init", "-b", "test/backup");
  git("config", "user.name", "Backup Test");
  git("config", "user.email", "backup-test@example.invalid");
  writeFileSync(join(root, "README.md"), "source\n");
  git("add", "README.md");
  git("commit", "-m", "Test source snapshot");
  return { root, git, destination: mkdtempSync(join(tmpdir(), "bb-workshop-bundles-")) };
}

test("unique full bundles verify and clone with identical committed tree and HEAD", () => {
  const f = fixture();
  const first = backup(f.root, f.destination);
  const second = backup(f.root, f.destination);
  assert.notEqual(first, second);
  f.git("bundle", "verify", first);
  const restored = join(f.destination, "restored");
  f.git("clone", first, restored);
  const restoredGit = (...args: string[]) => execFileSync("git", args, {
    cwd: restored, encoding: "utf8",
  }).trim();
  assert.equal(restoredGit("rev-parse", "HEAD"), f.git("rev-parse", "HEAD"));
  assert.equal(restoredGit("rev-parse", "HEAD^{tree}"), f.git("rev-parse", "HEAD^{tree}"));
});

test("refuses dirty snapshots, including untracked files", () => {
  const f = fixture();
  writeFileSync(join(f.root, "untracked.txt"), "not backed up");
  assert.throws(() => backup(f.root, f.destination), /clean/);
});

test("refuses backup destinations inside the checkout, including its root", () => {
  const f = fixture();
  for (const destination of [f.root, join(f.root, "backups")]) {
    assert.throws(() => backup(f.root, destination), /outside/);
  }
});
