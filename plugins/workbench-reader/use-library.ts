import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract, SearchResult, ReadResult } from "./contract";

type Sort = "smart" | "added" | "updated";
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Workbench could not be loaded.";

export function useLibrary() {
  const rpc = useRpc<typeof rpcContract>();
  const [query, setQuery] = useState(""), [debouncedQuery, setDebouncedQuery] = useState("");
  const [folder, setFolder] = useState(""), [sort, setSort] = useState<Sort>("smart");
  const [data, setData] = useState<SearchResult | null>(null), [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0), request = useRef(0);
  const connection = useRealtimeConnectionState(), previouslyConnected = useRef(false);
  useRealtime("library-changed", () => setRevision(value => value + 1));
  useEffect(() => {
    if (connection === "connected") {
      if (previouslyConnected.current) setRevision(value => value + 1);
      previouslyConnected.current = true;
    }
  }, [connection]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 180);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (folder && data && !data.folders.some(item => item.name === folder)) setFolder("");
  }, [data?.folders, folder]);
  const load = useCallback(async (offset: number) => {
    const id = ++request.current; setLoading(true); setError(null);
    try {
      const next = await rpc.call("search", { query: debouncedQuery, folder, sort, offset, limit: 50 });
      if (id !== request.current) return;
      setData(previous => ({ ...next, documents: offset && previous
        ? [...previous.documents, ...next.documents.filter(doc => !previous.documents.some(old => old.path === doc.path))]
        : next.documents }));
    } catch (cause) {
      if (id !== request.current) return;
      setError(errorMessage(cause)); if (!offset) setData(null);
    } finally { if (id === request.current) setLoading(false); }
  }, [rpc, debouncedQuery, folder, sort]);
  useEffect(() => {
    void load(0); return () => { request.current++; };
  }, [load, revision]);
  async function refresh() {
    setRefreshing(true); setError(null);
    try { await rpc.call("refresh"); setRevision(value => value + 1); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setRefreshing(false); }
  }
  return { query, setQuery, folder, setFolder, sort, setSort, data, loading, error, refreshing,
    connection, revision, refresh, retry: () => setRevision(value => value + 1),
    loadMore: () => { if (data?.hasMore && !loading) void load(data.documents.length); } };
}

export function useDocument(path: string | null, revision: number) {
  const rpc = useRpc<typeof rpcContract>();
  const [document, setDocument] = useState<ReadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setDocument(previous => previous?.path === path ? previous : null); setError(null);
    if (path) rpc.call("read", { path }).then(next => {
      if (!cancelled) setDocument(next);
    }, cause => { if (!cancelled) { setDocument(null); setError(errorMessage(cause)); } });
    return () => { cancelled = true; };
  }, [rpc, path, revision, retry]);
  return { document, error, retry: () => setRetry(value => value + 1) };
}
