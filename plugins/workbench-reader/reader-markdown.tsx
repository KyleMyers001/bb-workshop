import { isValidElement, type ReactNode } from "react";
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

export function ReaderMarkdown({ content, path, onLink }: {
  content: string; path: string; onLink: (href: string) => void;
}) {
  return <ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkFrontmatter, readerRemark]}
    urlTransform={url => url} components={{
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
      pre: ({ children }) => {
        if (!isValidElement<{ children?: ReactNode; className?: string }>(children)) return <pre>{children}</pre>;
        const language = children.props.className?.match(/language-([\w+-]+)/)?.[1] ?? "txt";
        const text = typeof children.props.children === "string" ? children.props.children.replace(/\n$/, "") : null;
        return text === null ? <pre>{children}</pre> : <div className="wb-code"><SourceCode
          content={text} path={`snippet.${language}`} overflow="scroll" /></div>;
      },
    }}>{content}</ReactMarkdown>;
}
