/**
 * ============================================================================
 * HOOKS: Utilerías de Tiempo y Conexión de Red
 * ============================================================================
 * 
 * PROPÓSITO:
 * Proporciona hooks personalizados para gestionar la hora actual en tiempo real 
 * y monitorear el estado de la conexión a internet de la aplicación.
 *
 * HOOKS EXPORTADOS:
 * 1. `useNow(intervalMs)`:
 *    - Mantiene un objeto `Date` actualizado periódicamente mediante un intervalo.
 *    - Realiza limpieza de temporizadores al desmontar el componente.
 *
 * 2. `useOnlineStatus()`:
 *    - Retorna `true` o `false` según la conectividad del navegador (`navigator.onLine`).
 *    - Implementa `useSyncExternalStore` (React 18+) para sincronización segura con SSR.
 * ============================================================================
 */
import { useEffect, useState, useSyncExternalStore } from "react";

/** Fecha/hora actual, actualizada cada `intervalMs`. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnlineStatus() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}
