import { ReactNode, useState } from "react";

export type KanbanColumnDef<TStatus extends string> = {
  id: TStatus;
  title: string;
  hint?: string;
  accent: "slate" | "brand" | "green" | "red";
};

const accentStyles = {
  slate: {
    header: "bg-slate-100 border-slate-200 text-slate-800",
    drop: "ring-brand-400 bg-slate-50/80",
    count: "bg-slate-200 text-slate-700",
  },
  brand: {
    header: "bg-brand-50 border-brand-200 text-brand-900",
    drop: "ring-brand-500 bg-brand-50/90",
    count: "bg-brand-200 text-brand-900",
  },
  green: {
    header: "bg-emerald-50 border-emerald-200 text-emerald-900",
    drop: "ring-emerald-500 bg-emerald-50/90",
    count: "bg-emerald-200 text-emerald-900",
  },
  red: {
    header: "bg-red-50 border-red-200 text-red-900",
    drop: "ring-red-400 bg-red-50/90",
    count: "bg-red-200 text-red-900",
  },
} as const;

type KanbanBoardProps<TItem extends { id: string }, TStatus extends string> = {
  columns: KanbanColumnDef<TStatus>[];
  items: TItem[];
  getStatus: (item: TItem) => TStatus;
  onMove: (itemId: string, toStatus: TStatus) => Promise<void>;
  renderCard: (item: TItem, ctx: { isDragging: boolean; isUpdating: boolean }) => ReactNode;
  emptyCard?: string;
};

export default function KanbanBoard<TItem extends { id: string }, TStatus extends string>({
  columns,
  items,
  getStatus,
  onMove,
  renderCard,
  emptyCard = "Drop tickets here",
}: KanbanBoardProps<TItem, TStatus>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<TStatus | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  function itemsInColumn(status: TStatus) {
    return items.filter((item) => getStatus(item) === status);
  }

  async function handleDrop(status: TStatus, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item || getStatus(item) === status) return;
    setUpdatingId(itemId);
    try {
      await onMove(itemId, status);
    } finally {
      setUpdatingId(null);
      setDraggingId(null);
      setDropColumn(null);
    }
  }

  return (
    <div className="mt-6 flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
      {columns.map((col) => {
        const colItems = itemsInColumn(col.id);
        const styles = accentStyles[col.accent];
        const isDropTarget = dropColumn === col.id;

        return (
          <section
            key={col.id}
            className={`flex w-[min(100%,320px)] shrink-0 snap-start flex-col rounded-xl border border-slate-200 bg-slate-50/50 transition-shadow ${
              isDropTarget ? `ring-2 ${styles.drop}` : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDragEnter={() => setDropColumn(col.id)}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setDropColumn((prev) => (prev === col.id ? null : prev));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/kanban-item-id");
              if (id) void handleDrop(col.id, id);
              setDropColumn(null);
            }}
          >
            <header
              className={`shrink-0 rounded-t-xl border-b px-4 py-3 ${styles.header}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold text-sm">{col.title}</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${styles.count}`}
                >
                  {colItems.length}
                </span>
              </div>
              {col.hint && <p className="mt-1 text-xs opacity-80">{col.hint}</p>}
            </header>

            <ul className="flex min-h-[220px] flex-1 flex-col gap-2 p-3">
              {colItems.length === 0 ? (
                <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-300/80 px-3 py-8 text-center text-xs text-slate-500">
                  {draggingId ? emptyCard : "No tickets"}
                </li>
              ) : (
                colItems.map((item) => {
                  const isDragging = draggingId === item.id;
                  const isUpdating = updatingId === item.id;
                  return (
                    <li key={item.id}>
                      <article
                        draggable={!isUpdating}
                        onDragStart={(e) => {
                          setDraggingId(item.id);
                          e.dataTransfer.setData("text/kanban-item-id", item.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDropColumn(null);
                        }}
                        className={`cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition active:cursor-grabbing ${
                          isDragging ? "opacity-40 scale-[0.98]" : "hover:border-slate-300 hover:shadow"
                        } ${isUpdating ? "pointer-events-none opacity-60" : ""}`}
                      >
                        {renderCard(item, { isDragging, isUpdating })}
                      </article>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
