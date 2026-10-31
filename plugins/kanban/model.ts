export const COLUMNS = [
  { id: "backlog", label: "Backlog" },
  { id: "in-progress", label: "In progress" },
  { id: "blocked", label: "Blocked" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
] as const;

export type Column = typeof COLUMNS[number]["id"];
export const COLUMN_IDS = COLUMNS.map(column => column.id) as [Column, ...Column[]];
export const BOARD_CHANGED = "board-changed";
export const PAGE_SIZE = 100;

export interface Card {
  id: string;
  projectId: string;
  title: string;
  column: Column;
  note: string;
  runtimeStatus: string;
  providerId: string;
  updatedAt: number;
  movedAt: number | null;
  movedBy: string | null;
}
