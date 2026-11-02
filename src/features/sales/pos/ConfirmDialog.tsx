import Modal from "./Modal";

type Props = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Confirmación dentro de la app (window.confirm no es confiable en todos los webviews). */
export default function ConfirmDialog({ title, message, confirmLabel, cancelLabel = "Volver", onConfirm, onCancel }: Props) {
  return (
    <Modal title={title} onClose={onCancel} widthClass="max-w-sm">
      <div className="p-5">
        <p className="text-sm leading-relaxed text-slate-600">{message}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="h-12 flex-1 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-blue-100"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-12 flex-1 rounded-xl bg-rose-600 text-sm font-bold text-white hover:bg-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-200"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
