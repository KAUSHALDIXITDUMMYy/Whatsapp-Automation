import { CONTENT_TYPE_OPTIONS, defaultTypesPayload, type TemplateContentValue } from "../constants/templateContent";

type Props = {
  value: TemplateContentValue;
  onChange: (next: TemplateContentValue) => void;
  idPrefix?: string;
};

const input =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function TemplateContentForm({ value, onChange, idPrefix = "tpl" }: Props) {
  const key = value.twilio_types_key || "twilio/text";
  const p = value.types_payload;

  function setKey(nextKey: string) {
    onChange({
      twilio_types_key: nextKey,
      types_payload: defaultTypesPayload(nextKey),
    });
  }

  function patch(nextPayload: Record<string, unknown>) {
    onChange({ twilio_types_key: key, types_payload: nextPayload });
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-ctype`} className="block text-xs font-medium text-slate-600">
          Content type
        </label>
        <select
          id={`${idPrefix}-ctype`}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className={input}
        >
          {CONTENT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} — {o.hint}
            </option>
          ))}
        </select>
      </div>

      {key === "twilio/text" && (
        <div>
          <label className="block text-xs font-medium text-slate-600">Message body</label>
          <textarea
            required
            rows={6}
            value={String(p.body ?? "")}
            onChange={(e) => patch({ ...p, body: e.target.value })}
            className={input}
            placeholder="Hello {{1}}, your order is ready."
          />
        </div>
      )}

      {key === "twilio/quick-reply" && (
        <>
          <div>
            <label className="block text-xs font-medium text-slate-600">Message body</label>
            <textarea
              required
              rows={4}
              value={String(p.body ?? "")}
              onChange={(e) => patch({ ...p, body: e.target.value })}
              className={input}
            />
          </div>
          <div className="space-y-2">
            <span className="text-xs font-medium text-slate-600">Buttons (1–3)</span>
            {(Array.isArray(p.actions) ? p.actions : []).map((a: unknown, i: number) => {
              const row = a as { id?: string; title?: string };
              return (
                <div key={i} className="flex flex-wrap gap-2">
                  <input
                    placeholder="id"
                    value={row.id ?? ""}
                    onChange={(e) => {
                      const actions = [...((p.actions as unknown[]) ?? [])];
                      actions[i] = { ...(actions[i] as object), id: e.target.value };
                      patch({ ...p, actions });
                    }}
                    className={`${input} flex-1 min-w-[100px]`}
                  />
                  <input
                    placeholder="Button title"
                    value={row.title ?? ""}
                    onChange={(e) => {
                      const actions = [...((p.actions as unknown[]) ?? [])];
                      actions[i] = { ...(actions[i] as object), title: e.target.value };
                      patch({ ...p, actions });
                    }}
                    className={`${input} flex-[2]`}
                  />
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-1 text-xs text-red-700"
                    onClick={() => {
                      const actions = ((p.actions as unknown[]) ?? []).filter((_, j) => j !== i);
                      patch({ ...p, actions });
                    }}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              disabled={(p.actions as unknown[])?.length >= 3}
              className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-40"
              onClick={() => {
                const actions = [...((p.actions as unknown[]) ?? []), { id: `btn_${Date.now()}`, title: "New" }];
                patch({ ...p, actions });
              }}
            >
              Add button
            </button>
          </div>
        </>
      )}

      {key === "twilio/call-to-action" && (
        <>
          <div>
            <label className="block text-xs font-medium text-slate-600">Message body</label>
            <textarea
              required
              rows={4}
              value={String(p.body ?? "")}
              onChange={(e) => patch({ ...p, body: e.target.value })}
              className={input}
            />
          </div>
          {(Array.isArray(p.actions) ? p.actions : []).map((a: unknown, i: number) => {
            const row = a as { type?: string; title?: string; url?: string; phone?: string };
            const t = row.type === "PHONE_NUMBER" ? "PHONE_NUMBER" : "URL";
            return (
              <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <select
                    value={t}
                    onChange={(e) => {
                      const actions = [...((p.actions as unknown[]) ?? [])];
                      const nt = e.target.value;
                      actions[i] =
                        nt === "PHONE_NUMBER"
                          ? { type: "PHONE_NUMBER", title: row.title ?? "Call", phone: row.phone ?? "+10000000000" }
                          : { type: "URL", title: row.title ?? "Open", url: row.url ?? "https://example.com" };
                      patch({ ...p, actions });
                    }}
                    className={input}
                  >
                    <option value="URL">Open URL</option>
                    <option value="PHONE_NUMBER">Call phone</option>
                  </select>
                  <input
                    placeholder="Button title"
                    value={row.title ?? ""}
                    onChange={(e) => {
                      const actions = [...((p.actions as unknown[]) ?? [])];
                      actions[i] = { ...(actions[i] as object), title: e.target.value };
                      patch({ ...p, actions });
                    }}
                    className={`${input} flex-1 min-w-[120px]`}
                  />
                </div>
                {t === "URL" ? (
                  <input
                    placeholder="https://..."
                    value={row.url ?? ""}
                    onChange={(e) => {
                      const actions = [...((p.actions as unknown[]) ?? [])];
                      actions[i] = { ...(actions[i] as object), url: e.target.value };
                      patch({ ...p, actions });
                    }}
                    className={input}
                  />
                ) : (
                  <input
                    placeholder="+15551234567"
                    value={row.phone ?? ""}
                    onChange={(e) => {
                      const actions = [...((p.actions as unknown[]) ?? [])];
                      actions[i] = { ...(actions[i] as object), phone: e.target.value };
                      patch({ ...p, actions });
                    }}
                    className={input}
                  />
                )}
              </div>
            );
          })}
          <button
            type="button"
            disabled={(p.actions as unknown[])?.length >= 2}
            className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-40"
            onClick={() => {
              const actions = [
                ...((p.actions as unknown[]) ?? []),
                { type: "URL", title: "Link", url: "https://example.com" },
              ];
              patch({ ...p, actions });
            }}
          >
            Add second button (max 2)
          </button>
        </>
      )}

      {key === "twilio/list-picker" && (
        <>
          <div>
            <label className="block text-xs font-medium text-slate-600">Message body</label>
            <textarea
              required
              rows={3}
              value={String(p.body ?? "")}
              onChange={(e) => patch({ ...p, body: e.target.value })}
              className={input}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Menu button label</label>
            <input
              required
              value={String(p.button ?? "")}
              onChange={(e) => patch({ ...p, button: e.target.value })}
              className={input}
              placeholder="Choose"
            />
          </div>
          <div className="space-y-2">
            <span className="text-xs font-medium text-slate-600">Items (max 10)</span>
            {(Array.isArray(p.items) ? p.items : []).map((it: unknown, i: number) => {
              const row = it as { id?: string; item?: string; description?: string };
              return (
                <div key={i} className="grid gap-2 sm:grid-cols-3">
                  <input
                    placeholder="id"
                    value={row.id ?? ""}
                    onChange={(e) => {
                      const items = [...((p.items as unknown[]) ?? [])];
                      items[i] = { ...(items[i] as object), id: e.target.value };
                      patch({ ...p, items });
                    }}
                    className={input}
                  />
                  <input
                    placeholder="Row title"
                    value={row.item ?? ""}
                    onChange={(e) => {
                      const items = [...((p.items as unknown[]) ?? [])];
                      items[i] = { ...(items[i] as object), item: e.target.value };
                      patch({ ...p, items });
                    }}
                    className={input}
                  />
                  <input
                    placeholder="Description (optional)"
                    value={row.description ?? ""}
                    onChange={(e) => {
                      const items = [...((p.items as unknown[]) ?? [])];
                      items[i] = { ...(items[i] as object), description: e.target.value };
                      patch({ ...p, items });
                    }}
                    className={input}
                  />
                </div>
              );
            })}
            <button
              type="button"
              disabled={(p.items as unknown[])?.length >= 10}
              className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-40"
              onClick={() => {
                const n = ((p.items as unknown[]) ?? []).length + 1;
                const items = [...((p.items as unknown[]) ?? []), { id: String(n), item: `Option ${n}`, description: "" }];
                patch({ ...p, items });
              }}
            >
              Add item
            </button>
          </div>
        </>
      )}

      {key === "twilio/catalog" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600">Title (optional)</label>
              <input
                value={String(p.title ?? "")}
                onChange={(e) => patch({ ...p, title: e.target.value })}
                className={input}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Subtitle (optional)</label>
              <input
                value={String(p.subtitle ?? "")}
                onChange={(e) => patch({ ...p, subtitle: e.target.value })}
                className={input}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Body</label>
            <textarea
              required
              rows={3}
              value={String(p.body ?? "")}
              onChange={(e) => patch({ ...p, body: e.target.value })}
              className={input}
            />
          </div>
          <div className="space-y-3">
            <span className="text-xs font-medium text-slate-600">Catalog items</span>
            {(Array.isArray(p.items) ? p.items : []).map((it: unknown, i: number) => {
              const row = it as {
                name?: string;
                description?: string;
                price?: number;
                mediaUrl?: string;
                sectionTitle?: string;
              };
              return (
                <div key={i} className="rounded-lg border border-slate-200 p-3 space-y-2 bg-slate-50/80">
                  <input
                    placeholder="Section (optional)"
                    value={row.sectionTitle ?? ""}
                    onChange={(e) => {
                      const items = [...((p.items as unknown[]) ?? [])];
                      items[i] = { ...(items[i] as object), sectionTitle: e.target.value };
                      patch({ ...p, items });
                    }}
                    className={input}
                  />
                  <input
                    placeholder="Product name *"
                    required
                    value={row.name ?? ""}
                    onChange={(e) => {
                      const items = [...((p.items as unknown[]) ?? [])];
                      items[i] = { ...(items[i] as object), name: e.target.value };
                      patch({ ...p, items });
                    }}
                    className={input}
                  />
                  <input
                    placeholder="Image URL (optional)"
                    value={row.mediaUrl ?? ""}
                    onChange={(e) => {
                      const items = [...((p.items as unknown[]) ?? [])];
                      items[i] = { ...(items[i] as object), mediaUrl: e.target.value };
                      patch({ ...p, items });
                    }}
                    className={input}
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Price"
                      value={row.price === undefined ? "" : String(row.price)}
                      onChange={(e) => {
                        const items = [...((p.items as unknown[]) ?? [])];
                        const v = e.target.value;
                        items[i] = {
                          ...(items[i] as object),
                          price: v === "" ? undefined : Number(v),
                        };
                        patch({ ...p, items });
                      }}
                      className={input}
                    />
                    <input
                      placeholder="Description"
                      value={row.description ?? ""}
                      onChange={(e) => {
                        const items = [...((p.items as unknown[]) ?? [])];
                        items[i] = { ...(items[i] as object), description: e.target.value };
                        patch({ ...p, items });
                      }}
                      className={`${input} flex-1`}
                    />
                  </div>
                  <button
                    type="button"
                    className="text-xs text-red-700"
                    onClick={() => {
                      const items = ((p.items as unknown[]) ?? []).filter((_, j) => j !== i);
                      patch({ ...p, items });
                    }}
                  >
                    Remove item
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="text-xs font-medium text-brand-700 hover:underline"
              onClick={() => {
                const items = [
                  ...((p.items as unknown[]) ?? []),
                  { name: "New item", description: "", mediaUrl: "", price: undefined },
                ];
                patch({ ...p, items });
              }}
            >
              Add item
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default TemplateContentForm;
