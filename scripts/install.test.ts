import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { install, parseMode, type Runner } from "./install.ts";

function fixture(id = "example") {
  const root = mkdtempSync(join(tmpdir(), "bb-workshop-install-test-"));
  const themeDir = join(root, "installed-themes");
  for (const dir of [".bb", "plugins/example", "themes/example"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(join(root, ".bb/plugins.json"), JSON.stringify({
    plugins: [{ name: id, source: "./plugins/example" }],
  }));
  writeFileSync(join(root, "plugins/example/package.json"), JSON.stringify({
    name: `bb-plugin-${id}`,
  }));
  writeFileSync(join(root, "themes/example/theme.css"), ":root { --ink: red; }");
  const calls: string[] = [];
  let moved = false;
  let verificationFails = false;
  let configChanges = false;
  let failedActivation = false;
  let managed = false;
  let enabled = true;
  let builtinEnabled: boolean | undefined;
  const run: Runner = (file, args, cwd) => {
    assert.equal(cwd, root);
    const command = [file, ...args].join(" ");
    calls.push(command);
    if (command === "bb theme dir --json") return JSON.stringify({ dir: themeDir });
    if (command === "bb theme show --json") return JSON.stringify({ themeId: "unchanged" });
    if (command === "bb plugin list --json") return JSON.stringify({ plugins: [{
      id, source: managed ? "git:example.invalid/plugin" : "path:/permanent/original", enabled,
      rootDir: moved ? join(root, "plugins/example") : "/permanent/original",
      status: moved && failedActivation ? "failed" : "running",
    }, ...(builtinEnabled === undefined ? [] : [{
      id: "workflows", source: "builtin:workflows", enabled: builtinEnabled,
      rootDir: "/bundled/workflows", status: builtinEnabled ? "running" : "disabled",
    }])] });
    if (command === `bb plugin config ${id} --json`) return JSON.stringify({
      values: { greeting: moved && configChanges ? "changed" : "preserved" },
    });
    if (command === "npm run verify") {
      if (verificationFails) throw new Error("Verification failed");
      return "Passed";
    }
    if (command === `bb plugin install path:${join(root, "plugins/example")} --yes`) {
      moved = true;
      return "Installed";
    }
    throw new Error(`Unexpected command: ${command}`);
  };
  return { root, themeDir, calls, run,
    failVerification() { verificationFails = true; },
    changeConfig() { configChanges = true; },
    failActivation() { failedActivation = true; },
    makeManaged() { managed = true; },
    disable() { enabled = false; },
    withBuiltinWorkflows(enabled: boolean) { builtinEnabled = enabled; },
  };
}

test("requires exactly one explicit mode", () => {
  assert.equal(parseMode(["--dry-run"]), true);
  assert.equal(parseMode(["--apply"]), false);
  for (const args of [[], ["--yes"], ["--apply", "--dry-run"]]) {
    assert.throws(() => parseMode(args), /Usage/);
  }
});

test("dry-run only queries theme directory and writes nothing", () => {
  const f = fixture();
  install(f.root, true, f.run);
  assert.deepEqual(f.calls, ["bb theme dir --json"]);
  assert.throws(() => readFileSync(join(f.themeDir, "example/theme.css")), /ENOENT/);
});

test("verification precedes same-ID path reinstall; settings and theme stay intact", () => {
  const f = fixture();
  install(f.root, false, f.run);
  const verifyIndex = f.calls.indexOf("npm run verify");
  assert.ok(verifyIndex >= 0);
  assert.ok(f.calls.findIndex(c => c.startsWith("bb plugin install")) > verifyIndex);
  assert.ok(!f.calls.some(c => /remove|theme set|config .* set/.test(c)));
  assert.equal(readFileSync(join(f.themeDir, "example/theme.css"), "utf8"),
    ":root { --ink: red; }");
});

test("failed verification never changes plugin paths or themes", () => {
  const f = fixture();
  f.failVerification();
  assert.throws(() => install(f.root, false, f.run), /Verification failed/);
  assert.ok(!f.calls.some(c => c.startsWith("bb plugin install")));
  assert.throws(() => readFileSync(join(f.themeDir, "example/theme.css")), /ENOENT/);
});

test("conflicting theme files fail preflight without overwriting or installing", () => {
  const f = fixture();
  mkdirSync(join(f.themeDir, "example"), { recursive: true });
  const target = join(f.themeDir, "example/theme.css");
  writeFileSync(target, "user customization");
  assert.throws(() => install(f.root, false, f.run), /Theme conflict/);
  assert.equal(readFileSync(target, "utf8"), "user customization");
  assert.deepEqual(f.calls, ["bb theme dir --json"]);
});

test("identical themes are left untouched and repeated installs are safe", () => {
  const f = fixture();
  install(f.root, false, f.run);
  install(f.root, false, f.run);
  assert.equal(f.calls.filter(c => c.startsWith("bb plugin install")).length, 2);
});

test("settings changes and failed activations are detected", () => {
  const settings = fixture();
  settings.changeConfig();
  assert.throws(() => install(settings.root, false, settings.run), /Settings changed/);
  const activation = fixture();
  activation.failActivation();
  assert.throws(() => install(activation.root, false, activation.run), /not running/);
});

test("refuses managed and disabled replacements before verification or installation", () => {
  for (const configure of ["makeManaged", "disable"] as const) {
    const f = fixture();
    f[configure]();
    assert.throws(() => install(f.root, false, f.run), /managed or disabled/);
    assert.ok(!f.calls.some(c => c === "npm run verify" || c.startsWith("bb plugin install")));
  }
});

test("workshop workflows refuses an enabled builtin before any installation", () => {
  const f = fixture("workshop-workflows");
  f.withBuiltinWorkflows(true);
  assert.throws(() => install(f.root, false, f.run), /Disable builtin Workflows/);
  assert.ok(!f.calls.some(c => c === "npm run verify" || c.startsWith("bb plugin install")));
  assert.ok(!f.calls.some(c => /plugin (disable|remove)|config .* set/.test(c)));
});

test("workshop workflows can install with the builtin disabled and untouched", () => {
  const f = fixture("workshop-workflows");
  f.withBuiltinWorkflows(false);
  install(f.root, false, f.run);
  assert.ok(f.calls.some(c => c.startsWith("bb plugin install")));
  assert.ok(!f.calls.some(c => /plugin (disable|enable|remove)|config workflows/.test(c)));
});

test("rejects escaped collection paths and package identity mismatches", () => {
  const f = fixture();
  writeFileSync(join(f.root, ".bb/plugins.json"), JSON.stringify({
    plugins: [{ name: "example", source: "./plugins/../../outside" }],
  }));
  assert.throws(() => install(f.root, false, f.run), /inside plugins/);
  writeFileSync(join(f.root, ".bb/plugins.json"), JSON.stringify({
    plugins: [{ name: "different", source: "./plugins/example" }],
  }));
  assert.throws(() => install(f.root, false, f.run), /identity mismatch/);
  assert.deepEqual(f.calls, []);
});

test("rejects symlink theme destinations rather than following them", () => {
  const f = fixture();
  mkdirSync(f.themeDir);
  symlinkSync(join(f.root, "themes/example"), join(f.themeDir, "example"));
  assert.throws(() => install(f.root, false, f.run), /symlink/i);
});
