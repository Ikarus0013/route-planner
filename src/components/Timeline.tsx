import { formatDuration, formatTime, localDate, minutesBetween, zonedToIso } from "@/lib/time";
import type { Itinerary } from "@/lib/types";
import { ModeIcon, modeColor } from "./icons";

export interface TimeWindow {
  start: string;
  end: string;
}

/** All trips drawn on one shared time axis, so arrival times line up across cards. */
export function Timeline({ it, window, tz, tall = false }: { it: Itinerary; window: TimeWindow; tz: string; tall?: boolean }) {
  const span = minutesBetween(window.start, window.end);
  const pos = (iso: string) => (minutesBetween(window.start, iso) / span) * 100;

  const midnights: { at: number; label: string }[] = [];
  for (let d = localDate(window.start, tz); ; ) {
    const next = new Date(zonedToIso(`${d} 12:00`, tz));
    next.setUTCDate(next.getUTCDate() + 1);
    d = localDate(next.toISOString(), tz);
    const iso = zonedToIso(`${d} 00:00`, tz);
    if (iso >= window.end) break;
    midnights.push({
      at: pos(iso),
      label: new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(iso)),
    });
  }

  return (
    <div className="relative">
      <div className={`relative w-full ${tall ? "h-9" : "h-6"}`}>
        {midnights.map((m) => (
          <div key={m.at} className="absolute inset-y-[-6px] border-l border-dashed border-line" style={{ left: `${m.at}%` }}>
            <span className="absolute -top-4 -translate-x-1/2 text-[10px] uppercase tracking-wider text-muted">{m.label}</span>
          </div>
        ))}
        {it.legs.map((l, i) => {
          const left = pos(l.depart);
          const width = Math.max(pos(l.arrive) - left, 0.6);
          const wide = width > 7;
          return (
            <div
              key={i}
              title={`${l.detail ?? l.carrier ?? l.mode} · ${formatDuration(minutesBetween(l.depart, l.arrive))}`}
              className={`absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-full ${l.mode === "wait" ? "hatch" : ""}`}
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: l.mode === "wait" ? undefined : modeColor[l.mode],
                opacity: l.mode === "transit" ? 0.55 : 1,
              }}
            >
              {wide && l.mode !== "wait" && l.mode !== "transit" && <ModeIcon mode={l.mode} className={`${tall ? "size-4" : "size-3.5"} text-white`} />}
            </div>
          );
        })}
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] tabular-nums whitespace-nowrap text-muted">
        {pos(it.arrive) - pos(it.depart) < 22 ? (
          <span className="absolute" style={{ left: `${Math.min(pos(it.depart), 70)}%` }}>
            {formatTime(it.depart, it.legs[0].departTz)} – <span className="font-medium text-ink">{formatTime(it.arrive, tz)}</span>
          </span>
        ) : (
          <>
            <span className="absolute" style={{ left: `${Math.min(pos(it.depart), 85)}%` }}>
              {formatTime(it.depart, it.legs[0].departTz)}
            </span>
            <span className="absolute -translate-x-full font-medium text-ink" style={{ left: `${Math.max(pos(it.arrive), 15)}%` }}>
              {formatTime(it.arrive, tz)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
