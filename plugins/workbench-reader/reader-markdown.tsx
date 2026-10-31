import { isValidElement, memo, useCallback, useId, useState, type ComponentProps, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import {
  UrlLink, experimental_SourceCode as SourceCode, experimental_usePluginId,
} from "@get-bb/plugin-sdk/app";
import { readerRemark } from "./markdown-model";

function localImage(from: string, src: string): string | null {
  if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("/") || src.includes("\\")) return null;
  try {
    const base = "https://workbench.invalid/" + from.split("/").map(encodeURIComponent).join("/");
    return decodeURIComponent(new URL(src, base).pathname.slice(1));
  } catch { return null; }
}

function Image({ from, src, alt }: { from: string; src?: string; alt?: string }) {
  const pluginId = experimental_usePluginId(), path = localImage(from, src ?? "");
  return path ? <img src={`/api/v1/plugins/${encodeURIComponent(pluginId)}/http/image?path=${encodeURIComponent(path)}`}
    alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer" />
    : <span className="wb-blocked-image">Image not loaded: {alt || "remote or unsupported image"}</span>;
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const id = useId();
  const code = isValidElement<{ children?: ReactNode; className?: string }>(children) ? children.props : null;
  const text = typeof code?.children === "string" ? code.children.replace(/\n$/, "") : null;
  const [revision, setRevision] = useState({ text, number: 0 });
  if (revision.text !== text) setRevision({ text, number: revision.number + 1 });
  if (text === null) return <pre>{children}</pre>;
  const language = code?.className?.match(/language-([\w+-]+)/)?.[1] ?? "txt";
  // The host caches by path: isolate both separate fences and changed content.
  return <div className="wb-code"><SourceCode content={text}
    path={`workbench-${id}-${revision.number}.${language}`} overflow="scroll" /></div>;
}

// Outline updates should not rebuild the Markdown tree or disrupt keyboard focus.
export const ReaderMarkdown = memo(function ReaderMarkdown({ content, path, onLink, titleId, titleMetadata }: {
  content: string; path: string; onLink: (href: string) => void;
  titleId?: string; titleMetadata?: ReactNode;
}) {
  const Title = useCallback(({ id, children }: ComponentProps<"h1">) =>
    <><h1 id={id}>{children}</h1>{id === titleId && titleMetadata}</>, [titleId, titleMetadata]);
  return <ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkFrontmatter, readerRemark]}
    urlTransform={url => url} components={{
      h1: Title,
      a: ({ href, children }) => {
        if (!href) return <span>{children}</span>;
        if (/^https?:\/\//i.test(href)) return <UrlLink href={href} rel="noopener noreferrer" referrerPolicy="no-referrer">{children}</UrlLink>;
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("wiki:"))
          return <span title="Unsupported link scheme">{children}</span>;
        return <button type="button" className="wb-document-link" onClick={() => onLink(href)}>{children}</button>;
      },
      img: ({ src, alt }) => <Image from={path} src={src} alt={alt} />,
      input: ({ checked }) => <input type="checkbox" aria-label={checked ? "Completed task" : "Incomplete task"}
        checked={!!checked} disabled readOnly />,
      table: ({ children }) => <div className="wb-table"><table>{children}</table></div>,
      pre: CodeBlock,
    }}>{content}</ReactMarkdown>;
});
