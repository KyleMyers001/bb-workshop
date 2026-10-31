import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./contract";
import { CHANGED, type Change, type Summary, type View, type ViewInput } from "./model";

function useFeed<T extends { checkedAt: number }>(key: string, load: (refresh: boolean) => Promise<T>) {
  const connection = useRealtimeConnectionState();
  const [state, setState] = useState<{ key: string; data: T | null; error: boolean }>({ key, data: null, error: false });
  const [refreshing, setRefreshing] = useState(true);
  const [clock, setClock] = useState(Date.now);
  const generation = useRef(0), alive = useRef(true);
  const refresh = useCallback(async (force = false) => {
    const request = ++generation.current;
    setRefreshing(true);
    try {
      const data = await load(force);
      if (alive.current && request === generation.current) setState({ key, data, error: false });
    } catch {
      if (alive.current && request === generation.current) setState(previous => ({
        key, data: previous.key === key ? previous.data : null, error: true,
      }));
    } finally {
      if (alive.current && request === generation.current) { setRefreshing(false); setClock(Date.now()); }
    }
  }, [key, load]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
  useEffect(() => {
    void refresh();
    const poll = setInterval(() => void refresh(true), 30_000);
    const clockTick = setInterval(() => setClock(Date.now()), 15_000);
    return () => { clearInterval(poll); clearInterval(clockTick); generation.current++; };
  }, [refresh, connection]);
  useRealtime(CHANGED, () => { void refresh(); });
  const data = state.key === key ? state.data : null;
  const error = state.key === key && state.error;
  const stale = connection !== "connected" || error || !data || clock - data.checkedAt > 90_000;
  return { data, error, connection, stale, refreshing, refresh };
}

export function useInbox(query: ViewInput) {
  const rpc = useRpc<typeof rpcContract>();
  const key = JSON.stringify(query);
  const load = useCallback((refresh: boolean) => rpc.call("inbox_view", { ...query, refresh }), [rpc, key]);
  const feed = useFeed<View>(key, load);
  const lock = useRef(false), mounted = useRef(true);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function change(input: Change) {
    if (lock.current || feed.stale || feed.refreshing) return;
    lock.current = true; setPending(input.id); setActionError(""); setMessage("");
    try {
      await rpc.call("request_change", input);
      if (!mounted.current) return;
      setMessage(input.action === "snooze" ? "Snoozed for one hour. The agent is still waiting."
        : input.action === "handle" ? "Marked handled. No permission granted and no thread status changed."
        : "Request returned to Open.");
      await feed.refresh(true);
    } catch (cause) {
      if (mounted.current) setActionError(cause instanceof Error && /changed|state/i.test(cause.message)
        ? "Request changed elsewhere. Refresh before acting."
        : "Could not update this request. Refresh and try again.");
    } finally { lock.current = false; if (mounted.current) setPending(null); }
  }
  return { ...feed, change, pending, message, actionError };
}

export function useSummary() {
  const rpc = useRpc<typeof rpcContract>();
  const load = useCallback(() => rpc.call("inbox_summary", null), [rpc]);
  return useFeed<Summary>("summary", load);
}
