import { km, type Place } from "./geo";
import { searchBuses } from "./sources/bus";
import { searchTransit, type TransitRoute } from "./sources/directions";
import { driveRoute } from "./sources/drive";
import { addMinutes, formatDuration, minutesBetween, nextDate } from "./time";
import type { Leg, Mode } from "./types";

/** A way to cover one stretch on the ground. Fixed options have a timetable; driving fits around the traveler. */
export type GroundOption =
  | { kind: "fixed"; mode: Mode; legs: Leg[]; depart: string; arrive: string; price: number }
  | { kind: "flexible"; mode: "car"; minutes: number; km: number; price: number; crossBorder: boolean };

export interface GroundQuery {
  /** Include next-day departures (for a leg that may start late in the day). */
  nextDay?: boolean;
  /** Spend a SerpApi search on transit directions (trains, ferries). */
  transit?: boolean;
  maxDriveMinutes?: number;
}

/** Transit fares Google doesn't give us, per km. Rough North American averages. */
const FARE: Partial<Record<Mode, (km: number) => number>> = {
  train: (k) => Math.max(15, 0.14 * k),
  ferry: (k) => 15 + 0.6 * k,
  bus: (k) => Math.max(5, 0.1 * k),
  transit: () => 3,
};

export async function groundOptions(from: Place, to: Place, date: string, q: GroundQuery = {}): Promise<{ options: GroundOption[]; warnings: string[] }> {
  const warnings: string[] = [];
  const soft = <T,>(label: string, p: Promise<T>, fallback: T) =>
    p.catch((e: Error) => {
      warnings.push(`${label}: ${e.message}`);
      return fallback;
    });

  const [busDays, transit, drive] = await Promise.all([
    Promise.all((q.nextDay ? [date, nextDate(date)] : [date]).map((d) => soft(`Buses ${from.name}–${to.name}`, searchBuses(from, to, d), []))),
    q.transit ? soft(`Transit ${from.name}–${to.name}`, searchTransit(from, to, date), []) : Promise.resolve([]),
    soft(`Driving ${from.name}–${to.name}`, driveRoute(from, to), null),
  ]);

  const buses = busDays.flat();
  const options: GroundOption[] = buses.map((b) => ({
    kind: "fixed",
    mode: "bus",
    depart: b.depart,
    arrive: b.arrive,
    price: b.price,
    legs: [
      {
        mode: "bus",
        from: b.fromStation,
        to: b.toStation,
        depart: b.depart,
        arrive: b.arrive,
        departTz: from.tz,
        arriveTz: to.tz,
        price: b.price,
        carrier: b.operator,
        detail: [b.transfers ? `${b.transfers} bus change` : "Direct bus", b.seatsLeft != null && b.seatsLeft < 10 ? `${b.seatsLeft} seats left` : ""]
          .filter(Boolean)
          .join(" · "),
        bookingUrl: b.bookingUrl,
      },
    ],
  }));

  // Transit routes add trains and ferries. Bus-only routes duplicate Flix, so keep them only when Flix has nothing.
  for (const r of transit) {
    const hasRailOrSea = r.segments.some((s) => s.mode === "train" || s.mode === "ferry");
    if (!hasRailOrSea && buses.length) continue;
    options.push(transitOption(r, from, to));
  }

  if (drive && drive.km >= 30 && drive.minutes <= (q.maxDriveMinutes ?? 12 * 60)) {
    const crossBorder = from.country !== to.country;
    const days = Math.max(1, Math.ceil(drive.minutes / 60 / 9));
    const price = Math.round(65 * days * 1.2 + (crossBorder ? 350 : 120) + drive.km * 0.075);
    options.push({ kind: "flexible", mode: "car", minutes: drive.minutes, km: drive.km, price, crossBorder });
  }
  return { options, warnings };
}

function transitOption(r: TransitRoute, from: Place, to: Place): GroundOption {
  const total = Math.max(1, minutesBetween(r.depart, r.arrive));
  const legs: Leg[] = [];
  let price = 0;
  r.segments.forEach((s, i) => {
    const prev = legs[legs.length - 1];
    if (prev && minutesBetween(prev.arrive, s.depart) >= 15) {
      legs.push({
        mode: "wait",
        from: s.from,
        to: s.from,
        depart: prev.arrive,
        arrive: s.depart,
        departTz: from.tz,
        arriveTz: from.tz,
        price: 0,
        detail: `Change at ${s.from} (${formatDuration(minutesBetween(prev.arrive, s.depart))})`,
      });
    }
    const segKm = (r.km * minutesBetween(s.depart, s.arrive)) / total;
    const fare = r.fare != null ? (i === 0 ? r.fare : 0) : Math.round(FARE[s.mode]?.(segKm) ?? 0);
    price += fare;
    legs.push({
      mode: s.mode,
      from: s.from,
      to: s.to,
      depart: s.depart,
      arrive: s.arrive,
      departTz: from.tz,
      arriveTz: i === r.segments.length - 1 ? to.tz : from.tz,
      price: fare,
      estimated: r.fare == null && fare >= 10,
      carrier: s.operator,
      detail: [s.line, r.fare == null && fare >= 10 ? "fare estimated" : ""].filter(Boolean).join(" · "),
      bookingUrl: s.operator ? `https://www.google.com/search?q=${encodeURIComponent(`${s.operator} tickets`)}` : undefined,
    });
  });
  const main = legs.some((l) => l.mode === "ferry") ? "ferry" : legs.some((l) => l.mode === "train") ? "train" : "bus";
  return { kind: "fixed", mode: main, legs, depart: r.depart, arrive: r.arrive, price };
}

/**
 * Getting around town (to/from an airport or a station): a straight-line estimate,
 * transit when it's short and a rideshare when it's far.
 */
export function localHop(from: { name: string; lat: number; lon: number }, to: { name: string; lat: number; lon: number }, depart: string, tz: string): Leg {
  const road = km(from, to) * 1.3;
  const walk = road < 1.5;
  const minutes = Math.round(walk ? road * 12 : 12 + road * 1.5);
  const price = walk ? 0 : road <= 40 ? 5 : Math.round(8 + road * 1.1);
  return {
    mode: "transit",
    from: from.name,
    to: to.name,
    depart,
    arrive: addMinutes(depart, minutes),
    departTz: tz,
    arriveTz: tz,
    price,
    estimated: price >= 10 || undefined,
    detail: walk ? "Walk" : road <= 40 ? "Local transit (estimated)" : "Rideshare (estimated)",
  };
}

/** Between a station and somewhere in the same city, when we don't know the station's exact location. */
export function stationHop(from: string, to: string, depart: string, tz: string): Leg {
  return { mode: "transit", from, to, depart, arrive: addMinutes(depart, 20), departTz: tz, arriveTz: tz, price: 3, detail: "Local transit (estimated)" };
}
