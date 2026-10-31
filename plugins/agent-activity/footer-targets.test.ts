// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { closeCompactSidebar, createFooterTargets } from "./footer-targets";

const disposers: Array<() => void> = [];
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
it("closes only an open compact sidebar after thread navigation", () => {
  let compact = true;
  vi.stubGlobal("matchMedia", () => ({ matches: compact }));
  const button = document.createElement("button");
  button.dataset.sidebar = "trigger";
  button.setAttribute("aria-expanded", "true");
  const click = vi.fn();
  button.addEventListener("click", click);
  document.body.append(button);
  closeCompactSidebar();
  expect(click).toHaveBeenCalledTimes(1);
  compact = false;
  closeCompactSidebar();
  compact = true;
  button.setAttribute("aria-expanded", "false");
  closeCompactSidebar();
  expect(click).toHaveBeenCalledTimes(1);
});

function footer() {
  const element = document.createElement("div");
  element.dataset.sidebar = "footer";
  element.innerHTML = '<ul data-sidebar="menu"><li id="original">Existing controls</li></ul>';
  document.body.append(element);
  return element;
}

it("prepends one owned anchor without moving or changing host controls", async () => {
  const f = footer(), original = f.querySelector("#original");
  const store = createFooterTargets();
  disposers.push(store.mount("agent-activity", new AbortController().signal));
  expect(store.getSnapshot()).toHaveLength(1);
  expect(f.querySelector("ul")?.firstElementChild).toBe(store.getSnapshot()[0]);
  f.append(document.createElement("span"));
  await waitFor(() => expect(f.querySelectorAll(".aa-anchor")).toHaveLength(1));
  expect(f.querySelector("#original")).toBe(original);
});

it("handles a late footer, replacement and multiple sidebar surfaces", async () => {
  const store = createFooterTargets();
  disposers.push(store.mount("agent-activity", new AbortController().signal));
  expect(store.getSnapshot()).toHaveLength(0);
  const f = footer();
  await waitFor(() => expect(store.getSnapshot()).toHaveLength(1));
  footer();
  await waitFor(() => expect(store.getSnapshot()).toHaveLength(2));
  f.remove();
  await waitFor(() => expect(store.getSnapshot()).toHaveLength(1));
});

it("aborts cleanly and can mount again without duplicated anchors or listeners", async () => {
  footer();
  const store = createFooterTargets(), controller = new AbortController();
  const dispose = store.mount("agent-activity", controller.signal);
  controller.abort(); dispose(); dispose();
  expect(store.getSnapshot()).toHaveLength(0);
  expect(document.querySelector(".aa-anchor")).toBeNull();
  const cleanup = store.mount("agent-activity", new AbortController().signal);
  disposers.push(cleanup);
  expect(store.getSnapshot()).toHaveLength(1);
  cleanup();
  footer();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(document.querySelector(".aa-anchor")).toBeNull();
});
