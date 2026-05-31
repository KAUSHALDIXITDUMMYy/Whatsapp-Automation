import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import KanbanBoard, { type KanbanColumnDef } from "../components/KanbanBoard";

type VisitStatus = "scheduled" | "completed" | "cancelled";

type Appointment = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: VisitStatus;
  customer_name: string;
  customer_phone: string;
  notes: string | null;
};

const COLUMNS: KanbanColumnDef<VisitStatus>[] = [
  {
    id: "scheduled",
    title: "Scheduled",
    hint: "Upcoming technician visits",
    accent: "brand",
  },
  {
    id: "completed",
    title: "Completed",
    hint: "Visit done",
    accent: "green",
  },
  {
    id: "cancelled",
    title: "Cancelled",
    hint: "Did not happen",
    accent: "red",
  },
];

function formatDate(iso: string): string {
  return String(iso).slice(0, 10);
}

export default function Appointments() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  const load = useCallback(async () => {
    const d = await apiFetch<{ appointments: Appointment[] }>("/api/appointments?status=all");
    setItems(
      d.appointments.map((a) => ({
        ...a,
        status: a.status as VisitStatus,
      }))
    );
  }, []);

  useEffect(() => {
    void load()
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [load]);

  async function moveStatus(id: string, status: VisitStatus) {
    const prev = items;
    setItems((list) => list.map((a) => (a.id === id ? { ...a, status } : a)));
    setErr(null);
    try {
      await apiFetch(`/api/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch (e) {
      setItems(prev);
      throw e;
    }
  }

  function openReschedule(a: Appointment) {
    setRescheduleId(a.id);
    setNewDate(formatDate(a.appointment_date));
    setNewTime(a.appointment_time);
    setMsg(null);
    setErr(null);
  }

  async function submitReschedule(e: FormEvent) {
    e.preventDefault();
    if (!rescheduleId) return;
    setErr(null);
    try {
      const r = await apiFetch<{ ok: boolean; notified: boolean }>(`/api/appointments/${rescheduleId}`, {
        method: "PATCH",
        body: JSON.stringify({
          appointment_date: newDate,
          appointment_time: newTime,
          notify_customer: true,
        }),
      });
      setMsg(r.notified ? "Rescheduled — customer notified on WhatsApp." : "Rescheduled.");
      setRescheduleId(null);
      await load();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Reschedule failed");
    }
  }

  const rescheduleTarget = items.find((a) => a.id === rescheduleId);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Technician visits</h1>
      <p className="text-slate-600 text-sm mt-1">
        Drag cards between columns to update status. Reschedule from the Scheduled column if the slot
        changes — the customer is notified on WhatsApp.
      </p>

      {err && <p className="text-red-600 text-sm mt-4">{err}</p>}
      {msg && <p className="text-green-700 text-sm mt-4">{msg}</p>}

      {rescheduleId && rescheduleTarget && (
        <form
          onSubmit={submitReschedule}
          className="mt-6 max-w-md space-y-3 rounded-xl border border-brand-200 bg-brand-50 p-4"
        >
          <h2 className="font-semibold text-slate-800">
            Reschedule — {rescheduleTarget.customer_name}
          </h2>
          <div className="flex gap-3">
            <input
              type="date"
              required
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              placeholder="10:00"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-24"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm">
              Save & notify customer
            </button>
            <button
              type="button"
              onClick={() => setRescheduleId(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Close
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500 text-sm mt-8">Loading board…</p>
      ) : (
        <KanbanBoard
          columns={COLUMNS}
          items={items}
          getStatus={(a) => a.status}
          onMove={async (id, status) => {
            try {
              await moveStatus(id, status);
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Could not update status");
              throw e;
            }
          }}
          renderCard={(a) => (
            <>
              <div className="font-medium text-slate-900 leading-snug">{a.customer_name}</div>
              <div className="text-xs text-slate-500 mt-0.5">{a.customer_phone}</div>
              <div className="mt-2 text-sm text-slate-700">
                <span className="font-medium">{formatDate(a.appointment_date)}</span>
                <span className="text-slate-400 mx-1">·</span>
                <span>{a.appointment_time}</span>
              </div>
              {a.notes && (
                <p className="mt-2 text-xs text-slate-500 line-clamp-2">{a.notes}</p>
              )}
              {a.status === "scheduled" && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openReschedule(a);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="mt-3 text-xs font-medium text-brand-600 hover:underline"
                >
                  Reschedule
                </button>
              )}
            </>
          )}
        />
      )}
    </div>
  );
}
