import { COMPACT_VIEWPORT_QUERY } from "./components/ui/hooks/use-compact-viewport";

// The overlay navigation API has no drawer-dismiss action. Use the host's
// existing local toggle only when navigating from its compact open drawer.
export function closeCompactSidebar() {
  if (!window.matchMedia(COMPACT_VIEWPORT_QUERY).matches) return;
  document.querySelector<HTMLButtonElement>(
    '[data-sidebar="trigger"][aria-expanded="true"]',
  )?.click();
}

// BB's footer registration only renders icons. A content script owns these
// additive portal targets; all activity data and navigation stay in SDK hooks.
export function createFooterTargets() {
  let targets: readonly HTMLElement[] = [];
  const listeners = new Set<() => void>();
  function publish(next: readonly HTMLElement[]) {
    if (next.length === targets.length && next.every((node, i) => node === targets[i])) return;
    targets = next;
    listeners.forEach(listener => listener());
  }
  return {
    getSnapshot: () => targets,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    mount(pluginId: string, signal: AbortSignal) {
      const owned = new Set<HTMLElement>();
      function reconcile() {
        for (const node of owned) {
          if (!node.isConnected) owned.delete(node);
        }
        for (const menu of document.querySelectorAll(
          '[data-sidebar="footer"] > [data-sidebar="menu"]',
        )) {
          if ([...owned].some(node => node.parentElement === menu)) continue;
          const node = document.createElement("li");
          node.className = "aa-anchor";
          node.dataset.bbPluginRoot = "";
          node.dataset.bbPlugin = pluginId;
          menu.prepend(node);
          owned.add(node);
        }
        publish([...owned]);
      }
      const observer = new MutationObserver(records => {
        // Streaming tokens and our own React renders do not change the footer.
        if (records.some(record => {
          const target = record.target;
          if (target instanceof Element && target.closest(".aa-anchor")) return false;
          return [...record.addedNodes, ...record.removedNodes].some(node =>
            node instanceof Element && (node.matches(
              '[data-sidebar="footer"], [data-sidebar="menu"], .aa-anchor',
            ) || node.querySelector('[data-sidebar="footer"], .aa-anchor')));
        })) reconcile();
      });
      let disposed = false;
      function dispose() {
        if (disposed) return;
        disposed = true;
        signal.removeEventListener("abort", dispose);
        observer.disconnect();
        publish([]);
        owned.forEach(node => node.remove());
        owned.clear();
      }
      if (signal.aborted) return dispose;
      observer.observe(document.body, { childList: true, subtree: true });
      signal.addEventListener("abort", dispose, { once: true });
      reconcile();
      return dispose;
    },
  };
}

export const footerTargets = createFooterTargets();
