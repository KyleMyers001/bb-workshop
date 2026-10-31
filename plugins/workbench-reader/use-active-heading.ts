import { useEffect, useState, type RefObject } from "react";

export function useActiveHeading(scroll: RefObject<HTMLDivElement | null>, path?: string, content?: string) {
  const [active, setActive] = useState("");
  useEffect(() => {
    const root = scroll.current;
    if (!root) return;
    let frame: number | null = null, disposed = false;
    const update = () => {
      frame = null;
      const headings = Array.from(root.querySelectorAll<HTMLElement>(
        ":is(h1,h2,h3,h4,h5,h6)[id^='wb-heading-']",
      ));
      const readingEdge = root.getBoundingClientRect().top + 48;
      let current: HTMLElement | undefined = headings[0];
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top > readingEdge) break;
        current = heading;
      }
      // Short final sections cannot always reach the top of a scrolling reader.
      if (root.scrollHeight > root.clientHeight && root.scrollTop + root.clientHeight >= root.scrollHeight - 2)
        current = headings.at(-1);
      setActive(current?.id.replace(/^wb-heading-/, "") ?? "");
    };
    const schedule = () => { if (!disposed && frame === null) frame = requestAnimationFrame(update); };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(root);
    const article = root.querySelector(".wb-document");
    if (article) observer?.observe(article);
    root.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      disposed = true;
      root.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [scroll, path, content]);
  return active;
}
