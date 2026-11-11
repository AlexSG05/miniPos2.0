import { useState, type FormEvent } from "react";
import { Percent, Tag } from "lucide-react";
import Modal from "./Modal";
import { authorizeAdminAction, type AdminOption } from "../../auth/auth.api";

type Props = {
  cartLength: number;
  userRole?: string;
  adminOptions: AdminOption[];
  onApply: (percent: number) => void;
  onClose: () => void;
};

const PRESET_DISCOUNTS = [0, 5, 10, 15, 20];

export default function GlobalDiscountDialog({
  cartLength,
  userRole,
  adminOptions,
  onApply,
  onClose,
}: Props) {
  const [percentText, setPercentText] = useState("");
  const [adminUsername, setAdminUsername] = useState(adminOptions[0]?.username ?? "");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const percent = Number(percentText.replace(",", "."));
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError("Ingresa un porcentaje de descuento válido (entre 0% y 100%).");
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (userRole === "cashier" && percent > 0) {
        if (!adminUsername || !adminPassword) {
          setError("Se requiere usuario y contraseña de administrador para autorizar el descuento.");
          setSaving(false);
          return;
        }
        await authorizeAdminAction(adminUsername, adminPassword);
      }
      onApply(percent);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Descuento a toda la cuenta" onClose={onClose} widthClass="max-w-md">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-blue-50/70 p-3 text-blue-900 border border-blue-100">
          <div className="rounded-lg bg-blue-600 p-2 text-white">
            <Percent size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold">Aplicar a los {cartLength} artículos</p>
            <p className="text-xs text-blue-700">El descuento se distribuirá en todos los productos de la venta actual.</p>
          </div>
        </div>

        <div>
          <label htmlFor="discount-percent-input" className="block text-sm font-semibold text-slate-700 mb-1">
            Porcentaje de descuento (%)
          </label>
          <div className="relative">
            <input
              id="discount-percent-input"
              autoFocus
              type="number"
              min="0"
              max="100"
              step="0.5"
              placeholder="Ej. 10"
              value={percentText}
              onChange={(e) => setPercentText(e.target.value)}
              className="h-14 w-full rounded-xl border-2 border-slate-200 bg-white pr-10 pl-4 text-2xl font-bold tabular-nums text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              required
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-400">
              %
            </span>
          </div>
        </div>

        {/* Botones rápidos */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Descuentos comunes</p>
          <div className="grid grid-cols-5 gap-2">
            {PRESET_DISCOUNTS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setPercentText(String(preset))}
                className={`h-11 rounded-lg border text-sm font-bold transition ${
                  percentText === String(preset)
                    ? "border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-400"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {preset === 0 ? "Sin desc." : `${preset}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Autorización para cajeros */}
        {userRole === "cashier" && Number(percentText) > 0 && (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
              <Tag size={14} /> Autorización de administrador requerida
            </p>
            <div>
              <label className="text-xs font-medium text-slate-700">Administrador</label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500"
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                required
              >
                <option value="">Selecciona administrador</option>
                {adminOptions.map((admin) => (
                  <option key={admin.username} value={admin.username}>
                    {admin.displayName} ({admin.username})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Contraseña de administrador</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500"
                type="password"
                autoComplete="current-password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
              />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="h-12 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
          >
            Cancelar <kbd className="text-[10px] opacity-70">Esc</kbd>
          </button>
          <button
            type="submit"
            disabled={saving || (userRole === "cashier" && Number(percentText) > 0 && adminOptions.length === 0)}
            className="h-12 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-50"
          >
            {saving ? "Validando…" : "Aplicar descuento"} <kbd className="text-[10px] opacity-70">Enter</kbd>
          </button>
        </div>
      </form>
    </Modal>
  );
}
