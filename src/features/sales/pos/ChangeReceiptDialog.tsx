import { useEffect } from "react";
import { CheckCircle2, ArrowRight } from "lucide-react";
import type { SaleReceipt } from "../sales.api";
import { money } from "./pos.utils";

type Props = {
  receipt: SaleReceipt;
  onClose: () => void;
};

export default function ChangeReceiptDialog({ receipt, onClose }: Props) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" || event.key === "Escape" || event.key === " ") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  const hasChange = receipt.changeCents > 0;
  const isCredit = receipt.paymentMethod === "credit";
  const isCard = receipt.paymentMethod === "card";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Resumen de cambio de venta"
        className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Encabezado de éxito */}
        <div className="bg-emerald-600 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={24} className="text-emerald-100" />
            <div>
              <h2 className="text-lg font-bold leading-tight">¡Venta completada!</h2>
              <p className="text-xs text-emerald-100 font-mono">{receipt.folio}</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-700/60 px-3 py-1 text-xs font-semibold text-emerald-100">
            {isCredit ? "Fiado / Crédito" : isCard ? "Tarjeta" : "Efectivo"}
          </span>
        </div>

        {/* Cuerpo principal: El Cambio en GRANDE */}
        <div className="p-6 text-center">
          {hasChange ? (
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                Cambio a entregar
              </span>
              <p className="my-2 text-6xl sm:text-7xl font-black tabular-nums text-emerald-600 tracking-tight">
                {money(receipt.changeCents)}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3.5 border border-slate-100 text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">Total a pagar</span>
                  <strong className="text-base text-slate-900 tabular-nums">{money(receipt.totalCents)}</strong>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Efectivo recibido</span>
                  <strong className="text-base text-slate-900 tabular-nums">{money(receipt.receivedCents)}</strong>
                </div>
              </div>
            </div>
          ) : isCredit ? (
            <div className="py-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-violet-500">
                Cargado a cuenta de crédito
              </span>
              <p className="my-2 text-5xl font-black tabular-nums text-slate-900">
                {money(receipt.totalCents)}
              </p>
              <p className="mt-3 text-sm text-slate-600">
                Cliente: <strong className="text-slate-800">{receipt.customerName || "Cliente"}</strong>
              </p>
              {receipt.dueAt && (
                <p className="text-xs text-slate-400 mt-1">
                  Vence: {new Date(`${receipt.dueAt.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX")}
                </p>
              )}
            </div>
          ) : isCard ? (
            <div className="py-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-blue-500">
                Cobro con tarjeta
              </span>
              <p className="my-2 text-5xl font-black tabular-nums text-slate-900">
                {money(receipt.totalCents)}
              </p>
              <p className="text-xs text-emerald-600 font-semibold mt-2">
                Pago aprobado · Sin cambio
              </p>
            </div>
          ) : (
            <div className="py-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                Pago exacto en efectivo
              </span>
              <p className="my-2 text-5xl font-black tabular-nums text-slate-900">
                {money(receipt.totalCents)}
              </p>
              <p className="text-xs text-slate-500 font-semibold mt-2">
                No hay cambio a entregar
              </p>
            </div>
          )}

          {/* Botón de acción rápida: Presionar ENTER para quitar y seguir vendiendo */}
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 text-base font-bold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300"
          >
            <span>Listo / Nueva venta</span>
            <kbd className="rounded-md border border-white/30 bg-white/15 px-2 py-0.5 text-xs font-bold">
              Enter ↵
            </kbd>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
