const SLOT = "[data-sidebar-thread-trailing-indicator]";
const SPINNER = 'svg[data-icon="Loading"][aria-label="Thread working"]';
const SVG_NS = "http://www.w3.org/2000/svg";

function createSignal() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("data-thinking-signal", "");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (let index = 0; index < 5; index++) {
    const bar = document.createElementNS(SVG_NS, "rect");
    bar.setAttribute("x", String(3 + index * 3.9));
    bar.setAttribute("y", "5");
    bar.setAttribute("width", "2.4");
    bar.setAttribute("height", "14");
    bar.setAttribute("rx", "1.2");
    bar.setAttribute("fill", "currentColor");
    svg.append(bar);
  }
  return svg;
}

export function mountSignal(signal: AbortSignal) {
  if (signal.aborted) return () => {};
  const overlays = new Map<Element, SVGSVGElement>();

  function sync(slot: Element) {
    const source = slot.querySelector(`:scope > ${SPINNER}`);
    const existing = overlays.get(slot);
    if (!slot.isConnected || !source) {
      existing?.remove();
      overlays.delete(slot);
      return;
    }
    if (existing?.parentElement === slot) return;
    existing?.remove();
    const overlay = createSignal();
    overlays.set(slot, overlay);
    slot.append(overlay);
  }

  function scan(node: Node) {
    if (!(node instanceof Element)) return;
    const slot = node.closest(SLOT);
    if (slot) sync(slot);
    node.querySelectorAll(SLOT).forEach(sync);
  }

  document.querySelectorAll(SLOT).forEach(sync);
  const observer = new MutationObserver((mutations) => {
    for (const slot of overlays.keys()) {
      if (!slot.isConnected) sync(slot);
    }
    for (const mutation of mutations) {
      const target = mutation.target;
      if (target instanceof Element) {
        const slot = target.closest(SLOT);
        if (slot) sync(slot);
      }
      mutation.addedNodes.forEach(scan);
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-icon", "aria-label"],
  });

  function dispose() {
    observer.disconnect();
    signal.removeEventListener("abort", dispose);
    for (const overlay of overlays.values()) overlay.remove();
    overlays.clear();
  }
  signal.addEventListener("abort", dispose, { once: true });
  return dispose;
}
