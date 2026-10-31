import { posix } from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import { toString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";
import { decorateMarkdown } from "./markdown-model";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter);
export function parseDocument(path: string, content: string) {
  const tree = parser.parse(content);
  const outline = decorateMarkdown(tree);
  const blocks: string[] = [];
  visit(tree, node => {
    if (["paragraph", "heading", "code", "tableCell"].includes(node.type)) blocks.push(toString(node));
  });
  return {
    title: outline.find(heading => heading.depth === 1)?.text ||
      posix.basename(path).replace(/\.(md|markdown)$/i, "").replace(/[-_]+/g, " "),
    headings: outline.map(heading => heading.text).join("\n"),
    body: blocks.join("\n"), outline,
  };
}
