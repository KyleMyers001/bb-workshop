import { constants } from "node:fs";
import { lstat, open, opendir } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  approved, canonicalRoot, checkedPath, MAX_FILE_BYTES, validRelative,
  type SourceConfig,
} from "./source";
export { sourceConfig } from "./source";

export type SourceFile = {
  path: string; folder: string; modified: number; created: number | null;
  fingerprint: string; size: number;
};
export const isMarkdown = (path: string) => /\.(md|markdown)$/i.test(path);

async function readBytes(config: SourceConfig, path: string) {
  const target = await checkedPath(config, path);
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error("Only regular files can be read.");
    if (info.size > MAX_FILE_BYTES) throw new Error("File is too large (2 MiB maximum).");
    // Recheck ancestry and inode after opening; do not trust a stale scan entry.
    if (await checkedPath(config, path) !== target) throw new Error("File moved while opening.");
    const current = await lstat(target);
    if (current.ino !== info.ino || current.dev !== info.dev) throw new Error("File changed while opening.");
    const data = Buffer.alloc(Math.min(info.size + 1, MAX_FILE_BYTES + 1));
    let bytesRead = 0;
    while (bytesRead < data.length) {
      const next = await file.read(data, bytesRead, data.length - bytesRead, bytesRead);
      if (!next.bytesRead) break;
      bytesRead += next.bytesRead;
    }
    if (bytesRead > MAX_FILE_BYTES || bytesRead > info.size) throw new Error("File grew while reading.");
    const after = await file.stat();
    if (after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs || after.size !== info.size ||
        await checkedPath(config, path) !== target) throw new Error("File changed while reading; retry.");
    return { data: data.subarray(0, bytesRead), info };
  } finally { await file.close(); }
}

export async function readDocument(config: SourceConfig, path: string) {
  if (!isMarkdown(path)) throw new Error("Only Markdown documents can be opened.");
  const { data, info } = await readBytes(config, path);
  const content = new TextDecoder("utf-8", { fatal: true }).decode(data);
  if (content.includes("\0")) throw new Error("Binary files are not Markdown documents.");
  return { content, modified: info.mtimeMs };
}

export async function readImage(config: SourceConfig, path: string) {
  const extension = extname(path).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extension))
    throw new Error("Only PNG, JPEG, GIF and WebP images are supported.");
  const { data } = await readBytes(config, path);
  let mime: string | null = null;
  if (data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) mime = "image/png";
  else if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) mime = "image/jpeg";
  else if (["GIF87a", "GIF89a"].includes(data.subarray(0, 6).toString())) mime = "image/gif";
  else if (data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP") mime = "image/webp";
  if (!mime) throw new Error("Image format could not be verified.");
  return { data, mime };
}

export async function scanFiles(config: SourceConfig, signal?: AbortSignal) {
  await canonicalRoot(config);
  const files: SourceFile[] = [], warnings: string[] = [];
  let visited = 0, bytes = 0;
  async function walk(path: string, folder: string, depth: number) {
    signal?.throwIfAborted();
    if (++visited > 1_000_000 || files.length >= 20_000 || bytes > 128 * 1024 * 1024)
      throw new Error("Workbench scan limit reached; choose narrower document folders.");
    if (depth > 30) { warnings.push("Skipped a directory deeper than 30 levels."); return; }
    try {
      const target = await checkedPath(config, path);
      const entries = await opendir(target);
      for await (const entry of entries) {
        signal?.throwIfAborted();
        if (++visited > 1_000_000 || files.length >= 20_000 || bytes > 128 * 1024 * 1024)
          throw new Error("Workbench scan limit reached; choose narrower document folders.");
        const child = path + "/" + entry.name;
        if (!validRelative(child) || entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) await walk(child, folder, depth + 1);
        else if (entry.isFile() && isMarkdown(child) && approved(config, child)) {
          const info = await lstat(join(target, entry.name));
          if (!info.isFile() || info.size > MAX_FILE_BYTES) {
            warnings.push("Skipped an oversized or non-regular document."); continue;
          }
          bytes += info.size;
          if (bytes > 128 * 1024 * 1024) throw new Error("Workbench scan limit reached; choose narrower document folders.");
          files.push({ path: child, folder, modified: info.mtimeMs,
            created: info.birthtimeMs > 0 && info.birthtimeMs <= Date.now() ? info.birthtimeMs : null,
            fingerprint: `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`,
            size: info.size });
        }
      }
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.message.includes("scan limit"))) throw error;
      warnings.push(`Could not scan ${path}; check access and symbolic links.`);
    }
  }
  for (const folder of config.folders) await walk(folder, folder, 0);
  return { files, warnings: [...new Set(warnings)].slice(0, 20) };
}
