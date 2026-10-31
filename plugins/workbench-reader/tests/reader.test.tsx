// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { DocumentReader } from "../document-reader";
import type { ReadResult } from "../contract";

let offset = 0;
const positions = new Map<string, number>();
const document: ReadResult = {
  path: "Plans/reading.md", title: "Reading", added: null, modified: 0,
  content: "# Reading\n\n## First section\nText.\n\n## Final section\nMore text.",
  outline: [{ id: "reading", text: "Reading", depth: 1 },
    { id: "first-section", text: "First section", depth: 2 },
    { id: "final-section", text: "Final section", depth: 2 }],
};
const props = { document, path: document.path, error: null, focus: true, anchor: "",
  onFocus: () => {}, onBack: () => {}, onLink: () => {}, onRetry: () => {} };
const rectangle = (top: number) => ({ top, bottom: top + 25, height: 25, left: 0, right: 500, width: 500, x: 0, y: top, toJSON: () => ({}) });
let resize: ResizeObserverCallback, disconnect: ReturnType<typeof vi.fn>;
beforeEach(() => {
  offset = 0; positions.clear();
  positions.set("wb-heading-reading", 130);
  positions.set("wb-heading-first-section", 350);
  positions.set("wb-heading-final-section", 850);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return rectangle(this.classList.contains("wb-reader-scroll") ? 100 : (positions.get(this.id) ?? 0) - offset);
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {} disconnect = disconnect;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup() {
  const view = render(<DocumentReader {...props} />);
  const scroll = view.getByRole("region", { name: "Document content" });
  Object.defineProperties(scroll, { clientHeight: { value: 400, configurable: true }, scrollHeight: { value: 1400, configurable: true } });
  return { ...view, scroll };
}

it("follows the reader's scroll position and keeps the compact outline in sync", async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole("button", { name: "Reading" }).getAttribute("aria-current")).toBe("location"));
  offset = 260; view.scroll.scrollTop = offset; fireEvent.scroll(view.scroll);
  await waitFor(() => expect(view.getByRole("button", { name: "First section" }).getAttribute("aria-current")).toBe("location"));
  expect((view.getByRole("combobox", { name: "Jump to heading" }) as HTMLSelectElement).value).toBe("first-section");
  expect(view.container.querySelectorAll('[aria-current="location"]')).toHaveLength(1);
});

it("recognizes the last section at the bottom without misclassifying short documents", async () => {
  const view = setup();
  offset = 1000; view.scroll.scrollTop = offset; fireEvent.scroll(view.scroll);
  await waitFor(() => expect(view.getByRole("button", { name: "Final section" }).getAttribute("aria-current")).toBe("location"));
  offset = 0; view.scroll.scrollTop = 0;
  Object.defineProperty(view.scroll, "scrollHeight", { value: 300 });
  fireEvent.scroll(view.scroll);
  await waitFor(() => expect(view.getByRole("button", { name: "Reading" }).getAttribute("aria-current")).toBe("location"));
});

it("keeps the jumped-to heading focused when the outline updates", async () => {
  const view = setup();
  const heading = view.getByRole("heading", { name: "First section" }) as HTMLElement;
  heading.scrollIntoView = vi.fn(() => {
    offset = 260; view.scroll.scrollTop = offset; fireEvent.scroll(view.scroll);
  });
  fireEvent.click(view.getByRole("button", { name: "First section" }));
  await waitFor(() => expect(view.getByRole("button", { name: "First section" }).getAttribute("aria-current")).toBe("location"));
  expect(view.getByRole("heading", { name: "First section" })).toBe(heading);
  expect(heading.ownerDocument.activeElement).toBe(heading);
});

it("preserves title focus through an unrelated parent update", () => {
  const view = setup();
  const heading = view.getByRole("heading", { name: "Reading" }) as HTMLElement;
  heading.scrollIntoView = vi.fn();
  fireEvent.click(view.getByRole("button", { name: "Reading" }));
  view.rerender(<DocumentReader {...props} onLink={() => {}} />);
  expect(view.getByRole("heading", { name: "Reading" })).toBe(heading);
  expect(heading.ownerDocument.activeElement).toBe(heading);
});

it("replaces the active outline when another document opens", async () => {
  const view = setup();
  offset = 260; view.scroll.scrollTop = offset; fireEvent.scroll(view.scroll);
  await waitFor(() => expect(view.getByRole("button", { name: "First section" }).getAttribute("aria-current")).toBe("location"));
  const next = { ...document, path: "Plans/other.md", title: "Other", content: "# Other",
    outline: [{ id: "other", text: "Other", depth: 1 }] };
  positions.set("wb-heading-other", 130);
  view.rerender(<DocumentReader {...props} document={next} path={next.path} />);
  await waitFor(() => expect(view.getByRole("button", { name: "Other" }).getAttribute("aria-current")).toBe("location"));
  expect(view.queryByRole("button", { name: "First section" })).toBeNull();
  expect(view.scroll.scrollTop).toBe(0);
});

it("recalculates after content layout changes and disposes the resize observer", async () => {
  const view = setup();
  offset = 260; view.scroll.scrollTop = offset; fireEvent.scroll(view.scroll);
  await waitFor(() => expect(view.getByRole("button", { name: "First section" }).getAttribute("aria-current")).toBe("location"));
  positions.set("wb-heading-first-section", 650);
  act(() => resize([], {} as ResizeObserver));
  await waitFor(() => expect(view.getByRole("button", { name: "Reading" }).getAttribute("aria-current")).toBe("location"));
  view.unmount(); expect(disconnect).toHaveBeenCalledOnce();
});
