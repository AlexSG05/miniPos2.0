import { Moon, Sun, Sunrise, type LucideIcon } from "lucide-react";
import { useNow } from "./pos.hooks";
import { greetingFor } from "./pos.utils";

const timeFormat = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
const dateFormat = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

type Theme = { card: string; glowA: string; glowB: string; subtle: string; bar: string };

// Clases completas (no armadas con plantillas) para que Tailwind las detecte.
const DAY: Theme = {
  card: "bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700",
  glowA: "bg-sky-300/40",
  glowB: "bg-indigo-300/30",
  subtle: "text-blue-100",
  bar: "bg-white/80",
};
const NIGHT: Theme = {
  card: "bg-gradient-to-br from-indigo-700 via-indigo-900 to-slate-950",
  glowA: "bg-violet-400/30",
  glowB: "bg-blue-500/25",
  subtle: "text-indigo-100",
  bar: "bg-violet-300/80",
};

function periodFor(hour: number): { theme: Theme; Icon: LucideIcon } {
  if (hour < 6) return { theme: NIGHT, Icon: Moon };
  if (hour < 12) return { theme: DAY, Icon: Sunrise };
  if (hour < 19) return { theme: DAY, Icon: Sun };
  return { theme: NIGHT, Icon: Moon };
}

/** Reloj, fecha y saludo. Se actualiza solo: no re-renderiza el resto del POS cada segundo. */
export default function ClockCard() {
  const now = useNow(1000);
  const { theme, Icon } = periodFor(now.getHours());
  const [hours, minutes] = timeFormat.format(now).split(":");
  const seconds = now.getSeconds();

  return (
    <section
      aria-label="Reloj"
      className={`relative shrink-0 overflow-hidden rounded-2xl p-4 text-white shadow-lg ring-1 ring-white/10 ${theme.card}`}
    >
      <div aria-hidden className={`pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full blur-2xl ${theme.glowA}`} />
      <div aria-hidden className={`pointer-events-none absolute -bottom-12 -left-6 h-32 w-32 rounded-full blur-2xl ${theme.glowB}`} />

      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0">
          <time
            dateTime={now.toISOString()}
            className="flex items-baseline text-5xl font-extrabold leading-none tabular-nums tracking-tight [text-shadow:0_2px_18px_rgba(0,0,0,0.25)]"
          >
            {hours}
            <span aria-hidden className="mx-0.5 -translate-y-0.5 motion-safe:animate-pulse">:</span>
            {minutes}
            <span className={`ml-2 text-lg font-semibold tabular-nums ${theme.subtle}`}>
              {String(seconds).padStart(2, "0")}
            </span>
          </time>
          <p className={`mt-2 truncate text-sm font-medium ${theme.subtle}`}>{capitalize(dateFormat.format(now))}</p>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1.5 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
            <Icon size={22} strokeWidth={2} />
          </span>
          <p className="text-sm font-bold leading-tight">{greetingFor(now)}</p>
        </div>
      </div>

      {/* Barra de segundos: avanza sola y reinicia sin animar hacia atrás. */}
      <div aria-hidden className="relative mt-3.5 h-1 overflow-hidden rounded-full bg-white/20">
        <div
          className={`h-full rounded-full ${theme.bar} ${seconds === 0 ? "" : "transition-[width] duration-1000 ease-linear"}`}
          style={{ width: `${((seconds + 1) / 60) * 100}%` }}
        />
      </div>
    </section>
  );
}
