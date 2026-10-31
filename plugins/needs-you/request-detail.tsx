import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { sourceLabel, type Change, type Item } from "./model";

export function age(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes}m ago`
    : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
}

export function RequestDetail({ item, disabled, onChange }: {
  item: Item; disabled: boolean; onChange: (input: Change) => void;
}) {
  const navigate = useBbNavigate();
  const act = (action: Change["action"]) => onChange({ id: item.id, version: item.version, action });
  return <section className="needs-detail" aria-label="Request detail" id="needs-request-detail">
    <div className="needs-detail-meta"><span className="needs-source">{sourceLabel(item.source)}</span>
      <span>{item.status === "open" ? item.kind === "review" ? "Review handoff" : "Needs attention" : item.status}</span></div>
    <h2>{item.title}</h2>
    <p className="needs-detail-thread">{item.threadTitle}<br />{item.projectName} · Added {age(item.raisedAt)}</p>
    <h3>The ask</h3><p className="needs-ask">{item.ask}</p>
    {item.context && <><h3>Why it needs you</h3><p>{item.context}</p></>}
    {item.recommendation && <><h3>Recommendation / next step</h3><p>{item.recommendation}</p></>}
    {item.status === "snoozed" && item.snoozedUntil !== null && <p className="needs-snoozed-until">
      Returns {new Date(item.snoozedUntil).toLocaleString()}. Snoozing does not unblock the agent.
    </p>}
    <div className="needs-actions">
      <button className="needs-primary" onClick={() => navigate.toThread(item.threadId, { split: true })}>Open thread</button>
      {item.status === "open" && <button disabled={disabled} onClick={() => act("snooze")}>Snooze 1h</button>}
      {item.status === "snoozed" && <button disabled={disabled} onClick={() => act("unsnooze")}>Unsnooze</button>}
      {["open", "snoozed"].includes(item.status) && <button disabled={disabled} onClick={() => act("handle")}>Mark handled</button>}
      {item.status === "handled" && <button disabled={disabled} onClick={() => act("reopen")}>Reopen request</button>}
    </div>
    <p className="needs-safety">{item.kind === "permission"
      ? "Review and grant permission in the original thread. Mark handled only changes this inbox item."
      : "Reply or review in the original thread. Handled does not mean approved, verified, or finished."}</p>
    <details className="needs-provenance"><summary>About this source</summary>
      <p>{item.source === "kanban" ? "This is a generic fallback from the thread’s current Kanban metadata, not an explicit question. A Blocked card may be waiting on someone other than you."
        : "This request was explicitly reported for this thread. Its content and any verification claims have not been independently checked."}</p>
      <p>Source opens the thread, not a specific message. No transcript is copied or scanned.</p>
    </details>
  </section>;
}
