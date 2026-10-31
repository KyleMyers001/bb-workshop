import { posix } from "node:path";

export function resolveDocumentLink(paths: string[], from: string, href: string) {
  if (href.length > 4096 || /[\\\u0000-\u001f]/.test(href)) throw new Error("Invalid document link.");
  const wiki = href.startsWith("wiki:");
  const value = wiki ? decodeURIComponent(href.slice(5)) : href;
  const hash = value.indexOf("#");
  const target = wiki ? (hash < 0 ? value : value.slice(0, hash))
    : decodeURIComponent(hash < 0 ? value : value.slice(0, hash));
  const anchor = hash < 0 ? "" : wiki ? value.slice(hash + 1) : decodeURIComponent(value.slice(hash + 1));
  if (/[\\\u0000-\u001f]/.test(target)) throw new Error("Invalid document link.");
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/"))
    throw new Error("Only relative document links can be opened here.");
  let path = from;
  if (target) {
    const relative = posix.normalize(posix.join(posix.dirname(from), target));
    if (relative.startsWith("../") || relative === "..") throw new Error("Link leaves Workbench.");
    const extensions = (value: string) => /\.(md|markdown)$/i.test(value) ? [value] : [value + ".md", value + ".markdown"];
    const candidates = wiki ? [...extensions(relative), ...extensions(target)] : [relative];
    const direct = paths.filter(path => candidates.some(candidate => candidate.toLowerCase() === path.toLowerCase()));
    const matches = direct.length ? direct : wiki ? paths.filter(path =>
      extensions(target).some(candidate => path.toLowerCase().endsWith("/" + candidate.toLowerCase()))) : [];
    if (matches.length > 1) throw new Error("Document link is ambiguous; use a folder-qualified path.");
    if (!matches.length) throw new Error("Linked document was not found in approved folders.");
    path = matches[0]!;
  }
  if (!paths.includes(path)) throw new Error("Source document is not indexed.");
  return { path, anchor };
}
