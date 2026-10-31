import { COLUMNS, type Card, type Column } from "./model";

export function BoardCard({ card, disabled, providerName, projectName, onOpen, onMove, onDrag, onDragEnd }: {
  card: Card;
  disabled: boolean;
  providerName: string;
  projectName?: string;
  onOpen: () => void;
  onMove: (column: Column) => void;
  onDrag: (id: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <article className="kanban-card" draggable={!disabled} aria-busy={disabled}
      onDragStart={event => {
        event.dataTransfer.setData("application/x-bb-kanban-thread", card.id);
        event.dataTransfer.effectAllowed = "move";
        onDrag(card.id);
      }} onDragEnd={onDragEnd}>
      <div className="kanban-card-meta">
        <span>{providerName}</span>
        <span className="kanban-runtime" data-status={card.runtimeStatus}>
          <span aria-hidden="true" className="kanban-runtime-dot" />
          {card.runtimeStatus.replaceAll("-", " ")}
        </span>
      </div>
      {projectName && <p className="kanban-card-project">{projectName}</p>}
      <button type="button" className="kanban-card-title" onClick={onOpen}>
        {card.title}
      </button>
      {card.note && <p className="kanban-note">{card.note}</p>}
      <div className="kanban-card-footer">
        <select aria-label={`Move ${card.title}`} value={card.column} disabled={disabled}
          onChange={event => onMove(event.target.value as Column)}>
          {COLUMNS.map(column => <option key={column.id} value={column.id}>{column.label}</option>)}
        </select>
        <span title={card.movedAt === null ? "Not moved yet" : `Moved ${new Date(card.movedAt).toLocaleString()}`}>
          {card.movedBy === "agent" ? "Agent moved" : card.movedBy === "cli" ? "CLI moved" : card.movedBy === "user" ? "You moved" : "Unsorted"}
        </span>
      </div>
    </article>
  );
}
