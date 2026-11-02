import { useNow } from "./pos.hooks";
import { greetingFor } from "./pos.utils";

const timeFormat = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
const dateFormat = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Reloj, fecha y saludo. Se actualiza solo: no re-renderiza el resto del POS cada segundo. */
export default function ClockCard() {
  const now = useNow(1000);
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return (
    <section className="flex shrink-0 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm">
      <div>
        <p className="text-4xl font-bold leading-none tabular-nums tracking-tight text-slate-900">
          {timeFormat.format(now)}
          <span className="ml-1 text-lg font-semibold text-slate-300">:{seconds}</span>
        </p>
        <p className="mt-1.5 text-xs text-slate-500">{capitalize(dateFormat.format(now))}</p>
      </div>
      <p className="text-right text-base font-bold text-blue-700">{greetingFor(now)}</p>
    </section>
  );
}
