import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import KanbanBoard, { type KanbanColumnDef } from "../components/KanbanBoard";

type CallStatus = "pending" | "called" | "cancelled";

type CallRequest = {
  id: string;
  preferred_date: string;
  preferred_time: string;
  status: CallStatus;
  customer_name: string;
  customer_phone: string;
  notes: string | null;
  created_at: string;
};

const COLUMNS: KanbanColumnDef<CallStatus>[] = [
  {
    id: "pending",
    title: "Pending",
    hint: "Waiting for your call",
    accent: "brand",
  },
  {
    id: "called",
    title: "Called",
    hint: "Conversation done",
    accent: "green",
  },
  {
    id: "cancelled",
    title: "Cancelled",
    hint: "No longer needed",
    accent: "red",
  },
];

function formatDate(iso: string): string {
  return String(iso).slice(0, 10);
}

export default function CallRequests() {
  const [items, setItems] = useState<CallRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await apiFetch<{ call_requests: CallRequest[] }>("/api/call-requests?status=all");
    setItems(
      d.call_requests.map((r) => ({
        ...r,
        status: r.status as CallStatus,
      }))
    );
  }, []);

  useEffect(() => {
    void load()
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [load]);

  async function moveStatus(id: string, status: CallStatus) {
    const prev = items;
    setItems((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
    setErr(null);
    try {
      await apiFetch(`/api/call-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch (e) {
      setItems(prev);
      throw e;
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Call requests</h1>
      <p className="text-slate-600 text-sm mt-1">
        Customers who chose &quot;Schedule a call&quot; on WhatsApp. Drag tickets to mark called or
        cancelled.
      </p>

      {err && <p className="text-red-600 text-sm mt-4">{err}</p>}

      {loading ? (
        <p className="text-slate-500 text-sm mt-8">Loading board…</p>
      ) : (
        <KanbanBoard
          columns={COLUMNS}
          items={items}
          getStatus={(r) => r.status}
          onMove={async (id, status) => {
            try {
              await moveStatus(id, status);
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Could not update status");
              throw e;
            }
          }}
          renderCard={(r) => (
            <>
              <div className="font-medium text-slate-900 leading-snug">{r.customer_name}</div>
              <a
                href={`tel:${r.customer_phone}`}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="text-xs text-brand-600 hover:underline mt-0.5 inline-block"
              >
                {r.customer_phone}
              </a>
              <div className="mt-2 text-sm text-slate-700">
                <span className="font-medium">{formatDate(r.preferred_date)}</span>
                <span className="text-slate-400 mx-1">·</span>
                <span>{r.preferred_time}</span>
              </div>
              {r.notes && (
                <p className="mt-2 text-xs text-slate-500 line-clamp-2">{r.notes}</p>
              )}
              {r.status === "pending" && (
                <a
                  href={`tel:${r.customer_phone}`}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="mt-3 inline-block rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700"
                >
                  Call now
                </a>
              )}
            </>
          )}
        />
      )}
    </div>
  );
}
