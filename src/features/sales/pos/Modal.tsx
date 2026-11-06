/**
 * ============================================================================
 * COMPONENTE: Modal (Contenedor Base de Diálogos Accesibles)
 * ============================================================================
 * 
 * PROPÓSITO:
 * Renderiza una capa superpuesta (overlay) accesible para ventanas emergentes.
 *
 * CARACTERÍSTICAS CLAVE:
 * 1. Accesibilidad ARIA: Implementa `role="dialog"`, `aria-modal="true"` y 
 *    `aria-labelledby` vinculado automáticamente mediante `useId()`.
 * 2. Trampa de Foco (Focus Trap): Atrapa la navegación por teclado (`Tab` / `Shift+Tab`) 
 *    para evitar que el usuario interactúe con la página detrás del modal.
 * 3. Atajos de Teclado: Cierra la ventana al presionar la tecla `Escape`.
 * 4. Cierre por Overlay: Cierra al hacer clic en el fondo oscuro exterior 
 *    (validando `event.target === event.currentTarget`).
 * ============================================================================
 */
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Diálogo modal accesible: Esc cierra, Tab queda dentro del panel y el clic en el fondo cierra. */
export default function Modal({ title, onClose, children, widthClass = "max-w-md" }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`w-full ${widthClass} rounded-2xl bg-white shadow-2xl outline-none`}
      >
        <h2 id={titleId} className="border-b border-slate-100 px-5 py-4 text-lg font-bold text-slate-900">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
