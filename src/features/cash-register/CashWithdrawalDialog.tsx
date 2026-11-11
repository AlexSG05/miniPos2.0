import { useEffect, useMemo, useState, type FormEvent } from "react";
import { listActiveAdmins, type AdminOption } from "../auth/auth.api";
import { getOpenCashSession, recordCashWithdrawal, type CashDenomination } from "./cash.api";

const VALUES = [100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100, 50];
const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
const label = (cents: number) => cents >= 100 ? money(cents) : `${(cents / 100).toFixed(2)}¢`;

export default function CashWithdrawalDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [counts, setCounts] = useState<Record<number, string>>(() => Object.fromEntries(VALUES.map((value) => [value, "0"])));
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const [recipient, setRecipient] = useState("");
  const [reason, setReason] = useState("");
  const [available, setAvailable] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([listActiveAdmins(), getOpenCashSession()]).then(([people, session]) => {
      setAdmins(people); setRecipient(people[0]?.username ?? ""); setAvailable(session?.expectedCents ?? 0);
    }).catch((cause) => setError(String(cause)));
  }, []);
  const denominations: CashDenomination[] = useMemo(() => VALUES.map((denominationCents) => {
    const quantity = Number(counts[denominationCents] ?? 0);
    return { denominationCents, quantity, subtotalCents: denominationCents * quantity };
  }), [counts]);
  const total = denominations.reduce((sum, item) => sum + item.subtotalCents, 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      if (total <= 0) throw new Error("Indica los billetes o monedas que se van a retirar.");
      if (available !== null && total > available) throw new Error("El retiro supera el efectivo esperado disponible.");
      const admin = admins.find((item) => item.username === recipient);
      if (!admin) throw new Error("Selecciona un encargado activo.");
      await recordCashWithdrawal({ denominations, recipientUserId: admin.id, reason: reason.trim() });
      onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  }

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="cash-withdrawal-title" className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="border-b border-slate-200 px-5 py-4"><p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Control de caja · F8</p><h2 id="cash-withdrawal-title" className="mt-1 text-xl font-bold">Retiro de efectivo</h2><p className="mt-1 text-sm text-slate-500">Cuenta las denominaciones y selecciona al encargado que recibe el efectivo.</p></header>
      <form onSubmit={(event) => void submit(event)} className="min-h-0 overflow-auto p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{VALUES.map((value) => <label key={value} className="rounded-lg border border-slate-200 p-2.5 text-sm"><span className="font-semibold">{label(value)}</span><span className="ml-1 text-xs text-slate-500">×</span><input aria-label={`Cantidad ${label(value)}`} type="number" min="0" max="1000000" step="1" inputMode="numeric" value={counts[value]} onChange={(event) => setCounts((current) => ({ ...current, [value]: event.target.value }))} className="mt-1 w-full rounded border border-slate-200 p-2" /></label>)}</div>
        <div className="mt-4 flex justify-between rounded-lg bg-amber-50 p-3"><span>Importe del retiro</span><strong>{money(total)}</strong></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Encargado que recibe<select required value={recipient} onChange={(event) => setRecipient(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5"><option value="">Selecciona encargado</option>{admins.map((admin) => <option key={admin.username} value={admin.username}>{admin.displayName}</option>)}</select></label>  <label className="text-sm font-medium">Motivo<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label></div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancelar</button><button type="submit" disabled={saving || admins.length === 0 || total <= 0} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-amber-950 disabled:opacity-50">{saving ? "Registrando…" : "Confirmar retiro"}</button></div>
      </form>
    </section>
  </div>;
}
