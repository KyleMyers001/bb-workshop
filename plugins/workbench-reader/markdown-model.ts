import type { Root, Heading, Link, Text } from "mdast";
import { toString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";

export type OutlineHeading = { id: string; text: string; depth: number };
export function decorateMarkdown(tree: Root): OutlineHeading[] {
  const outline: OutlineHeading[] = [], used = new Set<string>();
  tree.children = tree.children.filter(node => node.type !== "yaml");
  visit(tree, "heading", (node: Heading) => {
    const text = toString(node), base = text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim().replace(/\s+/g, "-") || "section";
    let id = base, n = 1; while (used.has(id)) id = `${base}-${++n}`;
    used.add(id); node.data = { ...node.data, hProperties: { id: "wb-heading-" + id } };
    outline.push({ id, text, depth: node.depth });
  });
  visit(tree, "text", (node: Text, index, parent) => {
    if (!parent || index === undefined || parent.type === "link" || !node.value.includes("[[")) return;
    const parts: Array<Text | Link> = []; let cursor = 0;
    for (const match of node.value.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
      if (match.index > cursor) parts.push({ type: "text", value: node.value.slice(cursor, match.index) });
      const [target, ...label] = match[1]!.split("|");
      parts.push({ type: "link", url: "wiki:" + encodeURIComponent(target!),
        children: [{ type: "text", value: label.join("|") || target! }] });
      cursor = match.index + match[0].length;
    }
    if (!parts.length) return;
    if (cursor < node.value.length) parts.push({ type: "text", value: node.value.slice(cursor) });
    parent.children.splice(index, 1, ...parts as Text[]);
    return index + parts.length;
  });
  return outline;
}

export function readerRemark() {
  return (tree: Root) => { decorateMarkdown(tree); };
}
