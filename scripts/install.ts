import { execFileSync } from "node:child_process";
import {
  constants, copyFileSync, existsSync, lstatSync, mkdirSync,
  readFileSync, readdirSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

export type Runner = (file: string, args: string[], cwd: string) => string;
const command: Runner = (file, args, cwd) => execFileSync(file, args, {
  cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  stdio: ["ignore", "pipe", "inherit"],
});

type InstalledPlugin = {
  id: string; source: string; rootDir: string; enabled: boolean; status: string;
};

export function parseMode(args: string[]): boolean {
  if (args.length !== 1 || !["--dry-run", "--apply"].includes(args[0]!)) {
    throw new Error("Usage: npm run install:local -- --dry-run | --apply");
  }
  return args[0] === "--dry-run";
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Theme symlink refused: ${path}`);
    if (entry.isDirectory()) return filesUnder(path);
    if (!entry.isFile()) throw new Error(`Not a theme file: ${path}`);
    return [path];
  });
}

function checkThemeDestination(target: string, themeDir: string): void {
  for (let path = target; ; path = dirname(path)) {
    // lstat also detects dangling symlinks (existsSync alone does not).
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`Theme symlink refused: ${path}`);
      if (path !== target && !stat.isDirectory()) {
        throw new Error(`Theme directory expected: ${path}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (path === themeDir) break;
  }
}

export function install(root: string, dryRun: boolean, run: Runner = command): void {
  root = resolve(root);
  const bb = (...args: string[]) => run("bb", args, root);
  const json = (...args: string[]) => JSON.parse(bb(...args, "--json"));
  const collection = JSON.parse(readFileSync(join(root, ".bb/plugins.json"), "utf8"));
  const plugins: { id: string; path: string }[] = collection.plugins.map(
    (entry: { name: string; source: string }) => {
      const path = resolve(root, entry.source);
      const subdir = relative(join(root, "plugins"), path);
      if (!entry.source.startsWith("./plugins/") || !subdir ||
          subdir.startsWith(`..${sep}`) || subdir === "..") {
        throw new Error("Plugin source must be inside plugins/");
      }
      const pkg = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
      const id = pkg.name.split("/").at(-1).replace(/^bb-plugin-/, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (id !== entry.name) throw new Error(`Collection/package identity mismatch: ${entry.name}`);
      return { id, path };
    },
  );
  const themeDir: string = json("theme", "dir").dir;
  if (typeof themeDir !== "string" || !themeDir.startsWith(sep)) {
    throw new Error("bb theme dir did not return an absolute directory");
  }
  const themeSource = join(root, "themes");
  const themes = filesUnder(themeSource).map(source => {
    const target = join(themeDir, relative(themeSource, source));
    checkThemeDestination(target, themeDir);
    if (existsSync(target) && (!lstatSync(target).isFile() ||
        !readFileSync(target).equals(readFileSync(source)))) {
      throw new Error(`Theme conflict (no overwrite): ${target}`);
    }
    return { source, target, copy: !existsSync(target) };
  });

  console.log(`Permanent source: ${root}`);
  console.log("Run: npm run verify (required before any installation)");
  for (const plugin of plugins) console.log(`Register ${plugin.id}: ${plugin.path}`);
  for (const theme of themes) console.log(`${theme.copy ? "Copy" : "Keep"}: ${theme.target}`);
  console.log("No plugin removal, settings writes, or theme selection changes.");
  if (dryRun) return;

  const before: InstalledPlugin[] = json("plugin", "list").plugins;
  for (const plugin of plugins) {
    const existing = before.find(p => p.id === plugin.id);
    if (existing && (!existing.source.startsWith("path:") || !existing.enabled)) {
      throw new Error(`Refusing to replace a managed or disabled plugin: ${plugin.id}`);
    }
  }
  const settings = new Map(plugins.filter(p => before.some(b => b.id === p.id))
    .map(p => [p.id, json("plugin", "config", p.id)]));
  const appearance = json("theme", "show");
  console.log(run("npm", ["run", "verify"], root));
  for (const plugin of plugins) {
    console.log(bb("plugin", "install", `path:${plugin.path}`, "--yes"));
    const current: InstalledPlugin | undefined = json("plugin", "list").plugins
      .find((p: InstalledPlugin) => p.id === plugin.id);
    if (!current || current.status !== "running" || current.rootDir !== plugin.path) {
      throw new Error(`Plugin not running from expected path: ${plugin.id}`);
    }
    if (settings.has(plugin.id) && !isDeepStrictEqual(
      settings.get(plugin.id), json("plugin", "config", plugin.id),
    )) throw new Error(`Settings changed for ${plugin.id}; stop and inspect locally`);
  }
  for (const theme of themes) {
    checkThemeDestination(theme.target, themeDir);
    if (theme.copy) {
      mkdirSync(dirname(theme.target), { recursive: true });
      copyFileSync(theme.source, theme.target, constants.COPYFILE_EXCL);
    }
  }
  if (!isDeepStrictEqual(appearance, json("theme", "show"))) {
    throw new Error("Appearance changed during installation; inspect locally");
  }
  console.log("Installed; existing settings and active appearance are unchanged.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    install(fileURLToPath(new URL("..", import.meta.url)), parseMode(process.argv.slice(2)));
  } catch (error) {
    // Do not print captured command stdout: it can include local configuration.
    console.error(error instanceof Error ? error.message : "Installation failed");
    process.exitCode = 1;
  }
}
