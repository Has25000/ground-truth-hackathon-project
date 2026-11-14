"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Small inline create form that POSTs JSON then navigates/refreshes. */
export function CreateForm(props: {
  action: string;
  fields: { name: string; placeholder: string; required?: boolean }[];
  button: string;
  goToPrefix?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(props.action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Something went wrong.");
    setValues({});
    if (props.goToPrefix && body.id) router.push(props.goToPrefix + body.id);
    else router.refresh();
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="inline-form">
        {props.fields.map((f) => (
          <input
            key={f.name}
            className="admin-input"
            placeholder={f.placeholder}
            required={f.required}
            value={values[f.name] ?? ""}
            onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
          />
        ))}
        <button className="btn-dark" disabled={busy}>{busy ? "Saving…" : props.button}</button>
      </div>
      {error && <div className="error-text">{error}</div>}
    </form>
  );
}

export function DangerButton({ action, label, confirmText, then }: { action: string; label: string; confirmText: string; then: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn-text"
      style={{ fontSize: 13, color: "#b42318" }}
      disabled={busy}
      onClick={async () => {
        if (!window.confirm(confirmText)) return;
        setBusy(true);
        await fetch(action, { method: "DELETE" });
        router.push(then);
        router.refresh();
      }}
    >
      {busy ? "Deleting…" : label}
    </button>
  );
}
