import { cached } from "../cache";
import type { Place } from "../geo";
import { addMinutes, zonedToIso } from "../time";
import type { Mode } from "../types";

/**
 * Public transit routes (trains, ferries, buses) from Google Maps via SerpApi.
 * Schedules are real; Google rarely includes a fare, so most prices are estimated
 * by the caller.
 */

interface SerpStop {
  name: string;
  time?: string;
}

interface SerpTrip {
  travel_mode: string;
  title?: string;
  duration: number;
  icon?: string;
  start_stop?: SerpStop;
  end_stop?: SerpStop;
  service_run_by?: { name?: string };
}

interface SerpDirection {
  start_time?: string;
  end_time?: string;
  duration: number;
  distance?: number;
  cost?: number;
  currency?: string;
  trips: SerpTrip[];
}

export interface TransitSegment {
  mode: Mode;
  from: string;
  to: string;
  depart: string;
  arrive: string;
  operator?: string;
  line?: string;
}

export interface TransitRoute {
  depart: string;
  arrive: string;
  km: number;
  /** Google's fare when it has one (USD). */
  fare?: number;
  segments: TransitSegment[];
}

function modeOf(icon = ""): Mode {
  if (icon.includes("ferry")) return "ferry";
  if (/subway|tram|metro|light/.test(icon)) return "transit";
  if (/rail|train/.test(icon)) return "train";
  return "bus";
}

/** "3:05 PM" (with narrow no-break spaces) -> minutes after midnight. */
function clock(s?: string): number | null {
  const m = s?.replace(/\s/g, " ").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2]);
}

export async function searchTransit(from: Place, to: Place, date: string, departLocal = "05:00"): Promise<TransitRoute[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key || key.startsWith("paste-")) return [];
  const startIso = zonedToIso(`${date} ${departLocal}`, from.tz);
  const params = new URLSearchParams({
    engine: "google_maps_directions",
    start_addr: from.label,
    end_addr: to.label,
    travel_mode: "3",
    time: `depart_at:${Math.floor(new Date(startIso).getTime() / 1000)}`,
    hl: "en",
    gl: "us",
  });

  const data = await cached(`serp-dir:${params}`, 12 * 60, async () => {
    params.set("api_key", key);
    const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(30_000) });
    const body = (await res.json()) as { error?: string; directions?: SerpDirection[] };
    if (body.error?.includes("hasn't returned any results")) return { directions: [] };
    if (!res.ok || body.error) throw new Error(`Transit search failed: ${body.error ?? res.status}`);
    return body;
  });

  const startClock = clock(departLocal)!;
  return (data.directions ?? []).flatMap((d) => {
    const first = clock(d.start_time);
    if (first == null) return [];
    // Google returns departures after the requested time, so an earlier clock time means the next day.
    const depart = addMinutes(startIso, (first - startClock + 1440) % 1440);
    const arrive = addMinutes(depart, Math.round(d.duration / 60));

    // Walk the trips in order, rolling over midnight. Stop times are local; we read them in the
    // origin's timezone and pin the final arrival to the exact total duration.
    let cursor = depart;
    let prev = first;
    const at = (s?: string) => {
      const c = clock(s);
      if (c == null) return cursor;
      cursor = addMinutes(cursor, (c - prev + 1440) % 1440);
      prev = c;
      return cursor;
    };
    const segments: TransitSegment[] = d.trips
      .filter((t) => t.travel_mode === "Transit" && t.start_stop && t.end_stop)
      .map((t) => ({
        mode: modeOf(t.icon),
        from: t.start_stop!.name,
        to: t.end_stop!.name,
        depart: at(t.start_stop!.time),
        arrive: at(t.end_stop!.time),
        operator: t.service_run_by?.name,
        line: t.title,
      }));
    if (!segments.length) return [];
    segments[segments.length - 1].arrive = arrive;
    return [
      {
        depart,
        arrive,
        km: Math.round((d.distance ?? 0) / 1000),
        fare: d.currency === "USD" && d.cost ? d.cost : undefined,
        segments,
      },
    ];
  });
}
