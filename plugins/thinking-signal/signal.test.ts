// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  loadPluginApp,
  mountPluginContentScripts,
} from "@get-bb/plugin-sdk/testing/app";

const slot = '[data-sidebar-thread-trailing-indicator]';
const overlay = '[data-thinking-signal]';
const working = '<svg data-icon="Loading" aria-label="Thread working"><path /></svg>';
const row = (icon = working) =>
  `<span data-sidebar-thread-trailing-indicator>${icon}</span>`;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const disposers: Array<() => Promise<void>> = [];

async function mount(generation = 1) {
  const app = await loadPluginApp(() => import("./app.tsx"));
  const scripts = await mountPluginContentScripts(app, {
    pluginId: "thinking-signal",
    generation,
  });
  disposers.push(() => scripts.lifecycle.dispose());
  return scripts;
}

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
  document.body.replaceChildren();
});

describe("thinking signal", () => {
  it("decorates only the sidebar working spinner, preserving its accessible label", async () => {
    document.body.innerHTML = row() + working + row(
      '<svg data-icon="CircleQuestion" aria-label="Waiting for input" />',
    ) + row('<svg data-icon="Edit" aria-label="Thread working with draft" />');
    const original = document.querySelector(`${slot} > svg`);
    await mount();
    expect(document.querySelectorAll(overlay)).toHaveLength(1);
    expect(document.querySelectorAll(`${overlay} rect`)).toHaveLength(5);
    expect(document.querySelector(overlay)?.getAttribute("aria-hidden")).toBe("true");
    expect(original?.getAttribute("aria-label")).toBe("Thread working");
    expect(original?.parentElement?.matches(slot)).toBe(true);
  });

  it("handles inserted rows, working-to-waiting transitions, and working again", async () => {
    await mount();
    document.body.insertAdjacentHTML("beforeend", row());
    await settle();
    expect(document.querySelectorAll(overlay)).toHaveLength(1);
    const original = document.querySelector(`${slot} > svg`)!;
    original.setAttribute("data-icon", "CircleQuestion");
    original.setAttribute("aria-label", "Waiting for input");
    await settle();
    expect(document.querySelector(overlay)).toBeNull();
    original.setAttribute("data-icon", "Loading");
    original.setAttribute("aria-label", "Thread working");
    await settle();
    expect(document.querySelectorAll(overlay)).toHaveLength(1);
  });

  it("cleans detached rows and restores the original DOM on disable", async () => {
    document.body.innerHTML = row();
    const original = document.querySelector(slot)!.innerHTML;
    const scripts = await mount();
    const detached = document.querySelector(slot)!;
    detached.remove();
    await settle();
    expect(detached.querySelector(overlay)).toBeNull();
    document.body.append(detached);
    await settle();
    expect(detached.querySelector(overlay)).not.toBeNull();
    await scripts.lifecycle.dispose();
    expect(detached.innerHTML).toBe(original);
    document.body.insertAdjacentHTML("beforeend", row());
    await settle();
    expect(document.querySelector(overlay)).toBeNull();
  });

  it("does not accumulate overlays across reloads or replace other statuses", async () => {
    document.body.innerHTML = row();
    const first = await mount();
    await first.lifecycle.dispose();
    await mount(2);
    expect(document.querySelectorAll(overlay)).toHaveLength(1);
    document.querySelector(`${slot} > svg`)!.replaceWith(
      document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    );
    await settle();
    expect(document.querySelector(overlay)).toBeNull();
  });
});
