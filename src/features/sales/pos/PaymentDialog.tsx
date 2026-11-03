import { useEffect, useRef, useState } from "react";
import { Banknote, CheckCircle2, CreditCard } from "lucide-react";
import Modal from "./Modal";
import { amount, cashSuggestions, money } from "./pos.utils";

export type PaymentMethod = "cash" | "card";

type Props = {
  totalCents: number;
  saving: boolean;
  error: string;
  onConfirm: (method: PaymentMethod, receivedCents: number) => void;
  onCancel: () => void;
};

const kbd = "rounded border border-current/30 px-1.5 py-0.5 text-[10px] font-bold leading-none opacity-80";

export default function PaymentDialog({ totalCents, saving, error, onConfirm, onCancel }: Props) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const receivedRef = useRef<HTMLInputElement>(null);

  const receivedCents = method === "card" ? totalCents : Math.round((Number(received.replace(",", ".")) || 0) * 100);
  const changeCents = Math.max(0, receivedCents - totalCents);
  const missingCents = Math.max(0, totalCents - receivedCents);
  const canConfirm = !saving && receivedCents >= totalCents;

  // F12 confirma, F8 efectivo, F9 tarjeta (sin salir del teclado).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "F12") {
        event.preventDefault();
        formRef.current?.requestSubmit();
      } else if (event.key === "F8" || event.key === "F9") {
        event.preventDefault();
        setMethod(event.key === "F8" ? "cash" : "card");
        if (event.key === "F8") window.requestAnimationFrame(() => receivedRef.current?.focus());
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  function chooseMethod(next: PaymentMethod) {
    setMethod(next);
    if (next === "cash") window.requestAnimationFrame(() => receivedRef.current?.focus());
  }

  const methodButton = (value: PaymentMethod, label: string, hotkey: string, Icon: typeof Banknote) => (
    <button
      type="button"
      aria-pressed={method === value}
      onClick={() => chooseMethod(value)}
      className={`flex h-14 items-center justify-center gap-2 rounded-xl border-2 text-sm font-bold transition focus:outline-none focus:ring-4 focus:ring-blue-100 ${
        method === value
          ? "border-blue-600 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon size={19} /> {label} <kbd className={kbd}>{hotkey}</kbd>
    </button>
  );

  return (
    <Modal title="Cobrar venta" onClose={onCancel} widthClass="max-w-lg">
      <form
        ref={formRef}
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (canConfirm) onConfirm(method, receivedCents);
        }}
      >
        <div className="rounded-xl bg-slate-950 px-5 py-4 text-right">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Total a pagar</p>
          <p className="mt-1 text-5xl font-extrabold tabular-nums tracking-tight text-green-400">
            <span className="mr-2 text-3xl font-bold text-green-500/70">$</span>
            {amount(totalCents)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {methodButton("cash", "Efectivo", "F8", Banknote)}
          {methodButton("card", "Tarjeta", "F9", CreditCard)}
        </div>

        {method === "cash" ? (
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700" htmlFor="pos-received">
              Efectivo recibido
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-slate-400">$</span>
              <input
                id="pos-received"
                ref={receivedRef}
                autoFocus
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={received}
                onChange={(event) => setReceived(event.target.value.replace(/[^\d.,]/g, ""))}
                onFocus={(event) => event.currentTarget.select()}
                className="h-16 w-full rounded-xl border-2 border-slate-200 bg-white pl-10 pr-4 text-right text-3xl font-bold tabular-nums text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setReceived((totalCents / 100).toFixed(2))}
                className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Exacto
              </button>
              {cashSuggestions(totalCents).map((cents) => (
                <button
                  key={cents}
                  type="button"
                  onClick={() => setReceived(String(cents / 100))}
                  className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-semibold tabular-nums text-slate-700 hover:bg-slate-100"
                >
                  {money(cents)}
                </button>
              ))}
            </div>
            <div
              aria-live="polite"
              className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                missingCents > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"
              }`}
            >
              <span className="text-sm font-semibold">{missingCents > 0 ? "Falta" : "Cambio"}</span>
              <strong className="text-2xl font-extrabold tabular-nums">
                {money(missingCents > 0 ? missingCents : changeCents)}
              </strong>
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Se registrará el pago con tarjeta por <strong>{money(totalCents)}</strong>. Cobra en la terminal bancaria y confirma.
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="h-14 flex-1 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-blue-100"
          >
            Volver <kbd className={kbd}>Esc</kbd>
          </button>
          <button
            type="submit"
            disabled={!canConfirm}
            className="flex h-14 flex-[1.6] items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-extrabold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving ? "Registrando…" : <>CONFIRMAR COBRO <kbd className={kbd}>F12</kbd></>}
            {!saving && <CheckCircle2 size={19} />}
          </button>
        </div>
      </form>
    </Modal>
  );
}
