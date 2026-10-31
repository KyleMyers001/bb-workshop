import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { rpcContract } from "./contract";
import { createLibrary } from "./library";
import { SearchIndex } from "./search-index";
import { DEFAULT_FOLDERS, sourceConfig } from "./source";
import { readImage } from "./files";

export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    root: { type: "string", label: "Workbench directory on the BB server", default: "~/Workbench",
      experimental_schema: z.string().max(4096).refine(value => {
        try { sourceConfig(value, DEFAULT_FOLDERS); return true; } catch { return false; }
      }, "Use an absolute directory or ~/Workbench.") },
    folders: { type: "string", label: "Document folders (one relative folder per line)",
      default: DEFAULT_FOLDERS, experimental_multiline: true,
      experimental_schema: z.string().max(8192).refine(value => {
        try { sourceConfig("/workbench", value); return true; } catch { return false; }
      }, "Choose non-overlapping relative document folders; hidden/build/worktree paths are excluded.") },
  });
  const config = async () => { const current = await settings.get(); return sourceConfig(current.root, current.folders); };
  const controller = new AbortController();
  const library = createLibrary(new SearchIndex(bb.storage.database()), config, controller.signal);
  bb.rpc.register(rpcContract, {
    search: input => library.search(input), read: ({ path }) => library.read(path),
    resolve: ({ from, href }) => library.resolve(from, href),
    refresh: async () => { const status = await library.refresh(true); bb.realtime.publish("library-changed", null); return status; },
  });
  settings.onChange(() => { bb.realtime.publish("library-changed", null); });
  bb.http.route("GET", "/image", async context => {
    try {
      const image = await readImage(await config(), context.req.query("path") ?? "");
      return new Response(new Uint8Array(image.data), { headers: {
        "Content-Type": image.mime, "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
      } });
    } catch { return new Response("Image unavailable or outside approved folders.", { status: 404 }); }
  });
  bb.background.service("index-documents", {
    async start(signal) {
      const abort = () => controller.abort();
      if (signal.aborted) return;
      signal.addEventListener("abort", abort, { once: true });
      try {
        while (!signal.aborted && !controller.signal.aborted) {
          try {
            await library.refresh();
            bb.realtime.publish("library-changed", null);
          } catch {
            if (!signal.aborted) {
              bb.log.warn("Workbench indexing failed; check the configured directory and folder permissions.");
              bb.realtime.publish("library-changed", null);
            }
          }
          try {
            await sleep(30_000, undefined, { signal: AbortSignal.any([signal, controller.signal]) });
          } catch { break; }
        }
      } finally { signal.removeEventListener("abort", abort); }
    },
  });
  bb.onDispose(async () => { controller.abort(); await library.settle(); });
}
