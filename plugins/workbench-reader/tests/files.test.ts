import { mkdtemp, mkdir, writeFile, symlink, rename, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sourceConfig, scanFiles, readDocument, readImage } from "../files";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "workbench-reader-"));
  await mkdir(join(root, "Plans"));
  await mkdir(join(root, "Reports"));
  return { root, config: sourceConfig(root, "Plans\nReports") };
}

describe("read-only source boundary", () => {
  it("reads only configured Markdown folders without changing source timestamps", async () => {
    const { root, config } = await fixture();
    const path = join(root, "Plans", "one.md");
    await writeFile(path, "# One\nA useful plan.");
    await mkdir(join(root, "Plans", "node_modules"));
    await writeFile(join(root, "Plans", "node_modules", "hidden.md"), "Hidden");
    await writeFile(join(root, "Reports", "notes.txt"), "Not Markdown");
    await mkdir(join(root, "Private"));
    await writeFile(join(root, "Private", "secret.md"), "Not approved");
    const before = await stat(path);
    const result = await scanFiles(config);
    expect(result.files.map(file => file.path)).toEqual(["Plans/one.md"]);
    expect((await readDocument(config, "Plans/one.md")).content).toContain("# One");
    expect(await readFile(path, "utf8")).toBe("# One\nA useful plan.");
    expect((await stat(path)).mtimeMs).toBe(before.mtimeMs);
  });

  it("rejects traversal, absolute paths, excluded folders and unapproved roots", async () => {
    const { config } = await fixture();
    for (const path of ["../outside.md", "/etc/passwd", "Plans/../../file.md",
      "Plans\\file.md", "Private/no.md", "Plans/.git/no.md", "Plans/Worktrees/no.md"])
      await expect(readDocument(config, path)).rejects.toThrow();
    expect(() => sourceConfig("/tmp", "../outside")).toThrow();
    expect(() => sourceConfig("/tmp", "Plans\nPlans/Subfolder")).toThrow();
  });

  it("refuses file, directory, root and configured-folder symlinks", async () => {
    const { root, config } = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "workbench-outside-"));
    await writeFile(join(outside, "outside.md"), "Outside");
    await symlink(join(outside, "outside.md"), join(root, "Plans", "link.md"));
    await symlink(outside, join(root, "Plans", "linked"));
    expect((await scanFiles(config)).files).toEqual([]);
    await expect(readDocument(config, "Plans/link.md")).rejects.toThrow();
    await expect(readDocument(config, "Plans/linked/outside.md")).rejects.toThrow();
    await symlink(root, join(outside, "root-link"));
    await expect(scanFiles(sourceConfig(join(outside, "root-link"), "Plans"))).rejects.toThrow();
    await rename(join(root, "Reports"), join(root, "OriginalReports"));
    await symlink(outside, join(root, "Reports"));
    const result = await scanFiles(config);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.files).toEqual([]);
  });

  it("bounds document size and serves only validated raster images", async () => {
    const { root, config } = await fixture();
    await writeFile(join(root, "Plans", "large.md"), "a".repeat(2 * 1024 * 1024 + 1));
    await expect(readDocument(config, "Plans/large.md")).rejects.toThrow(/large/i);
    await writeFile(join(root, "Plans", "image.svg"), '<svg onload="alert(1)"/>');
    await expect(readImage(config, "Plans/image.svg")).rejects.toThrow();
    await writeFile(join(root, "Plans", "fake.png"), "Not an image");
    await expect(readImage(config, "Plans/fake.png")).rejects.toThrow();
    await writeFile(join(root, "Plans", "image.png"), Buffer.from("89504e470d0a1a0a00000000", "hex"));
    expect((await readImage(config, "Plans/image.png")).mime).toBe("image/png");
  });
});
