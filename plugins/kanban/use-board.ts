import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./contract";
import { BOARD_CHANGED, PAGE_SIZE, type Card, type Column } from "./model";

export function useBoard(projectId: string) {
  const rpc = useRpc<typeof rpcContract>();
  const connection = useRealtimeConnectionState();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [pages, setPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const generation = useRef(0);
  const alive = useRef(true);
  const moveLock = useRef(false);
  const report = useCallback((cause: unknown) => {
    if (alive.current) setError(cause instanceof Error ? cause.message : String(cause));
  }, []);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setRefreshing(true);
    try {
      const results = await Promise.all(Array.from({ length: pages }, (_, i) =>
        rpc.call("board_list", { projectId, offset: i * PAGE_SIZE, limit: PAGE_SIZE })));
      if (!alive.current || request !== generation.current) return;
      const unique = new Map(results.flatMap(result => result.cards).map(card => [card.id, card]));
      setCards([...unique.values()]);
      setHasMore(results.at(-1)?.hasMore ?? false);
      setError(null);
    } catch (cause) {
      if (request === generation.current) report(cause);
    } finally {
      if (alive.current && request === generation.current) setRefreshing(false);
    }
  }, [rpc, projectId, pages, report]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; generation.current++; };
  }, []);
  useEffect(() => {
    void refresh();
    // Recover missed signals, title changes, or metadata written outside this plugin.
    const timer = setInterval(() => void refresh(), 30_000);
    return () => { clearInterval(timer); generation.current++; };
  }, [refresh, connection]);
  useRealtime(BOARD_CHANGED, () => { void refresh(); });

  async function move(card: Card, column: Column) {
    if (moveLock.current || card.column === column) return;
    moveLock.current = true;
    setPending(card.id);
    try {
      await rpc.call("card_move", { projectId, threadId: card.id, column });
      if (!alive.current) return;
      setAnnouncement(`Moved ${card.title} to ${column.replaceAll("-", " ")}.`);
      await refresh();
    } catch (cause) {
      report(cause);
    } finally {
      moveLock.current = false;
      if (alive.current) setPending(null);
    }
  }
  return { cards, error, refreshing, pending, hasMore, connection, announcement,
    refresh, move, loadMore: () => setPages(count => count + 1) };
}
