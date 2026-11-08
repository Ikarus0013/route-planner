import { airport, type Place, type Stopover } from "./geo";
import { localHop, stationHop, type GroundOption } from "./ground";
import type { FlightOption } from "./sources/flights";
import { addMinutes, formatDuration, localDate, localHour, minutesBetween, zonedToIso } from "./time";
import type { Itinerary, Leg, Mode } from "./types";

/** Typical first checked bag on US/Canada carriers. */
const BAG_FEE = 35;
/** Minimum slack between reaching a station and the departure. */
const MIN_SLACK = 30;
const MAX_WAIT_AFTER_FLIGHT = 16 * 60;
const MAX_WAIT_BEFORE_FLIGHT = 10 * 60;
const MAX_ITINERARIES = 18;
/** Canadian airports with US customs preclearance: no customs queue on arrival in the US. */
const PRECLEARANCE = new Set(["YYZ", "YUL", "YVR", "YYC", "YEG", "YOW", "YWG", "YHZ"]);

export interface StopoverData {
  stop: Stopover;
  /** The hub city itself (downtown), for getting between its airport and stations. */
  city: Place;
  flights: FlightOption[];
  ground: GroundOption[];
}

interface Inputs {
  from: Place;
  to: Place;
  date: string;
  checkedBag: boolean;
  direct: FlightOption[];
  stopovers: StopoverData[];
  wholeWay: GroundOption[];
}

export function buildItineraries(x: Inputs): Itinerary[] {
  const b = new Builder(x);
  const directs = pickFlights(x.direct, 3).map((f) => b.direct(f));
  const others = [...x.stopovers.flatMap((s) => (s.stop.side === "destination" ? b.flyThenGround(s) : b.groundThenFly(s))), ...b.wholeWay()];
  return [...directs, ...diverse(others, MAX_ITINERARIES - directs.length)].map((it, i) => ({ ...it, id: `t${i}` }));
}

/** Keep the best option of each kind (hub + mode) first, then fill with the next best. */
function diverse(its: Itinerary[], n: number): Itinerary[] {
  const value = (i: Itinerary) => i.price + i.durationMin * 0.1;
  const sorted = [...its].sort((a, b) => value(a) - value(b));
  const seen = new Set<string>();
  const firsts = sorted.filter((i) => !seen.has(i.label) && seen.add(i.label));
  const rest = sorted.filter((i) => !firsts.includes(i));
  return [...firsts, ...rest].slice(0, n);
}

/** Cheapest few, the fastest, and the earliest arrival (it catches the most onward connections). */
function pickFlights(flights: FlightOption[], n: number): FlightOption[] {
  const byPrice = [...flights].sort((a, b) => a.price - b.price);
  const fastest = [...flights].sort((a, b) => a.durationMin - b.durationMin)[0];
  const earliest = [...flights].sort((a, b) => a.arrive.localeCompare(b.arrive))[0];
  return [...new Set([earliest, fastest, ...byPrice].filter(Boolean))].slice(0, n);
}

const WORD: Record<string, string> = { bus: "bus", train: "train", ferry: "ferry", car: "drive" };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

class Builder {
  constructor(private x: Inputs) {}

  private ap(iata: string) {
    const a = airport(iata);
    return { name: iata, lat: a?.lat ?? this.x.from.lat, lon: a?.lon ?? this.x.from.lon, tz: a?.tz ?? this.x.from.tz, country: a?.country ?? "US" };
  }

  private crossBorder(f: FlightOption) {
    return this.ap(f.fromAirport).country !== this.ap(f.toAirport).country;
  }

  private checkin(f: FlightOption) {
    return this.crossBorder(f) ? 120 : 90;
  }

  private deplane(f: FlightOption) {
    const customs = this.crossBorder(f) && !PRECLEARANCE.has(f.fromAirport) ? 30 : 0;
    return (this.x.checkedBag ? 45 : 25) + customs;
  }

  private flightLeg(f: FlightOption): Leg {
    const bag = this.x.checkedBag;
    return {
      mode: "flight",
      from: f.fromAirport,
      to: f.toAirport,
      depart: f.depart,
      arrive: f.arrive,
      departTz: this.ap(f.fromAirport).tz,
      arriveTz: this.ap(f.toAirport).tz,
      price: f.price + (bag ? BAG_FEE : 0),
      estimated: bag || undefined,
      carrier: f.airlines,
      detail: [
        f.flightNumbers,
        f.stops ? `${f.stops} stop${f.stops > 1 ? "s" : ""}` : "Nonstop",
        bag ? `incl. ~$${BAG_FEE} checked bag` : "",
        f.oftenDelayed ? "Often delayed 30+ min" : "",
      ]
        .filter(Boolean)
        .join(" · "),
      bookingUrl: f.bookingUrl,
    };
  }

  /** Home -> airport -> check-in, timed to make the flight. */
  private toFlight(start: { name: string; lat: number; lon: number }, f: FlightOption): Leg[] {
    const ap = this.ap(f.fromAirport);
    const checkinStart = addMinutes(f.depart, -this.checkin(f));
    const hop = shiftToArrive(localHop(start, ap, checkinStart, ap.tz), checkinStart);
    return [hop, wait(checkinStart, f.depart, ap.name, ap.tz, "Check-in & security"), this.flightLeg(f)];
  }

  direct(f: FlightOption): Itinerary {
    const ap = this.ap(f.toAirport);
    const legs = [...this.toFlight(this.x.from, f), localHop(ap, this.x.to, addMinutes(f.arrive, this.deplane(f)), ap.tz)];
    return this.finish({ kind: "direct", label: f.stops ? `Fly with ${f.stops} stop${f.stops > 1 ? "s" : ""}` : "Fly direct", legs, tickets: 1 });
  }

  flyThenGround({ stop, city, flights, ground }: StopoverData): Itinerary[] {
    const out: Itinerary[] = [];
    for (const f of pickFlights(flights, 5)) {
      const ap = this.ap(f.toAirport);
      const landed = addMinutes(f.arrive, this.deplane(f));
      const intoTown = localHop(ap, city, landed, ap.tz);
      const fixed = ground
        .filter((g) => g.kind === "fixed")
        .map((g) => ({ g, slack: minutesBetween(intoTown.arrive, g.depart) }))
        .filter(({ g, slack }) => slack >= MIN_SLACK && minutesBetween(f.arrive, g.depart) <= MAX_WAIT_AFTER_FLIGHT)
        .sort((a, b) => a.g.depart.localeCompare(b.g.depart));

      const chosen = new Set([...byMode(fixed, (c) => c.g.mode, 2), [...fixed].sort((a, b) => a.g.price - b.g.price)[0]].filter(Boolean));
      for (const { g, slack } of chosen) {
        if (g.kind !== "fixed") continue;
        const later = fixed.filter(
          (c) => c.g.mode === g.mode && c.g.depart > g.depart && localDate(c.g.depart, city.tz) === localDate(g.depart, city.tz),
        ).length;
        const legs = [
          ...this.toFlight(this.x.from, f),
          intoTown,
          wait(intoTown.arrive, g.depart, g.legs[0].from, city.tz, `Wait in ${stop.hub.city}`),
          ...g.legs,
          stationHop(g.legs[g.legs.length - 1].to, this.x.to.name, g.arrive, this.x.to.tz),
        ];
        out.push(
          this.finish({
            kind: "via",
            label: `Fly to ${stop.hub.city} + ${WORD[g.mode] ?? g.mode}`,
            legs,
            tickets: 1 + ticketsFor(g),
            connectionBufferMin: slack,
            laterAlternatives: later,
            landBorder: city.country !== this.x.to.country,
          }),
        );
      }

      const car = ground.find((g) => g.kind === "flexible");
      if (car?.kind === "flexible") {
        const pickup = addMinutes(landed, 40);
        const legs = [
          ...this.toFlight(this.x.from, f),
          wait(landed, pickup, `${ap.name} rental cars`, ap.tz, "Rental shuttle & counter"),
          carLeg(`${ap.name} rental cars`, this.x.to.name, pickup, car, ap.tz, this.x.to.tz),
        ];
        out.push(this.finish({ kind: "via", label: `Fly to ${stop.hub.city} + drive`, legs, tickets: 2, landBorder: city.country !== this.x.to.country }));
      }
    }
    return out;
  }

  groundThenFly({ stop, city, flights, ground }: StopoverData): Itinerary[] {
    const out: Itinerary[] = [];
    for (const f of pickFlights(flights, 4)) {
      const ap = this.ap(f.fromAirport);
      const checkinStart = addMinutes(f.depart, -this.checkin(f));
      const toAirport = shiftToArrive(localHop(city, ap, checkinStart, ap.tz), checkinStart);
      const rest = [toAirport, wait(checkinStart, f.depart, ap.name, ap.tz, "Check-in & security"), this.flightLeg(f), this.lastMile(f)];

      const fixed = ground
        .filter((g) => g.kind === "fixed")
        .map((g) => ({ g, slack: minutesBetween(g.arrive, toAirport.depart) }))
        .filter(({ g, slack }) => slack >= MIN_SLACK && minutesBetween(g.arrive, f.depart) <= MAX_WAIT_BEFORE_FLIGHT)
        .sort((a, b) => b.g.arrive.localeCompare(a.g.arrive));
      const chosen = new Set([...byMode(fixed, (c) => c.g.mode, 2), [...fixed].sort((a, b) => a.g.price - b.g.price)[0]].filter(Boolean));
      for (const { g, slack } of chosen) {
        if (g.kind !== "fixed") continue;
        const legs = [
          shiftToArrive(stationHop(this.x.from.name, g.legs[0].from, g.depart, this.x.from.tz), g.depart),
          ...g.legs,
          wait(g.arrive, toAirport.depart, g.legs[g.legs.length - 1].to, city.tz, `Wait in ${stop.hub.city}`),
          ...rest,
        ];
        out.push(
          this.finish({
            kind: "via",
            label: `${cap(WORD[g.mode] ?? g.mode)} to ${stop.hub.city} + fly`,
            legs,
            tickets: 1 + ticketsFor(g),
            connectionBufferMin: slack,
            landBorder: this.x.from.country !== city.country,
          }),
        );
      }

      // A one-way rental across the border costs more than it saves, so only offer it domestically.
      const car = ground.find((g) => g.kind === "flexible");
      if (car?.kind === "flexible" && !car.crossBorder) {
        const dropoff = addMinutes(checkinStart, -30);
        const legs = [
          carLeg(this.x.from.name, `${ap.name} rental return`, addMinutes(dropoff, -car.minutes), car, this.x.from.tz, ap.tz),
          wait(dropoff, checkinStart, `${ap.name} rental return`, ap.tz, "Return car, shuttle to terminal"),
          ...rest.slice(1),
        ];
        out.push(this.finish({ kind: "via", label: `Drive to ${stop.hub.city} + fly`, legs, tickets: 2, connectionBufferMin: 30 }));
      }
    }
    return out;
  }

  wholeWay(): Itinerary[] {
    const { from, to, date } = this.x;
    const fixed = this.x.wholeWay.filter((g): g is Extract<GroundOption, { kind: "fixed" }> => g.kind === "fixed" && localDate(g.depart, from.tz) === date);
    const picks = new Set([...byMode(fixed.sort((a, b) => a.price - b.price), (g) => g.mode, 2), [...fixed].sort((a, b) => a.arrive.localeCompare(b.arrive))[0]].filter(Boolean));
    const out = [...picks].map((g) =>
      this.finish({
        kind: "ground",
        label: `${cap(WORD[g.mode] ?? g.mode)} the whole way`,
        legs: [shiftToArrive(stationHop(from.name, g.legs[0].from, g.depart, from.tz), g.depart), ...g.legs, stationHop(g.legs[g.legs.length - 1].to, to.name, g.arrive, to.tz)],
        tickets: ticketsFor(g),
        landBorder: from.country !== to.country,
      }),
    );
    const car = this.x.wholeWay.find((g) => g.kind === "flexible");
    if (car?.kind === "flexible") {
      out.push(this.finish({ kind: "ground", label: "Drive the whole way", legs: [carLeg(from.name, to.name, zonedToIso(`${date} 08:00`, from.tz), car, from.tz, to.tz)], tickets: 1, landBorder: car.crossBorder }));
    }
    return out;
  }

  private lastMile(f: FlightOption): Leg {
    const ap = this.ap(f.toAirport);
    return localHop(ap, this.x.to, addMinutes(f.arrive, this.deplane(f)), ap.tz);
  }

  private finish(it: Pick<Itinerary, "kind" | "label" | "legs" | "tickets" | "connectionBufferMin" | "laterAlternatives" | "landBorder">): Itinerary {
    const legs = it.legs.filter((l) => l.mode !== "wait" || minutesBetween(l.depart, l.arrive) >= 10);
    const depart = legs[0].depart;
    const arrive = legs[legs.length - 1].arrive;
    return {
      ...it,
      id: "",
      legs,
      price: Math.round(legs.reduce((s, l) => s + l.price, 0)),
      durationMin: minutesBetween(depart, arrive),
      depart,
      arrive,
      overnight: spansNight(depart, arrive, this.x.to.tz),
      hasEstimate: legs.some((l) => l.estimated),
    };
  }
}

/** Separately bought tickets on a ground option: one per operator (local transit excluded). */
function ticketsFor(g: GroundOption): number {
  if (g.kind === "flexible") return 1;
  return Math.max(1, new Set(g.legs.filter((l) => l.mode === "bus" || l.mode === "train" || l.mode === "ferry").map((l) => l.carrier)).size);
}

/** Earliest `n` per mode, so a train isn't crowded out by three buses. */
function byMode<T>(xs: T[], mode: (x: T) => Mode, n: number): T[] {
  const counts = new Map<Mode, number>();
  return xs.filter((x) => {
    const c = counts.get(mode(x)) ?? 0;
    counts.set(mode(x), c + 1);
    return c < n;
  });
}

function wait(depart: string, arrive: string, where: string, tz: string, what: string): Leg {
  return { mode: "wait", from: where, to: where, depart, arrive, departTz: tz, arriveTz: tz, price: 0, detail: `${what} (${formatDuration(Math.max(0, minutesBetween(depart, arrive)))})` };
}

function carLeg(from: string, to: string, depart: string, car: Extract<GroundOption, { kind: "flexible" }>, departTz: string, arriveTz: string): Leg {
  return {
    mode: "car",
    from,
    to,
    depart,
    arrive: addMinutes(depart, car.minutes),
    departTz,
    arriveTz,
    price: car.price,
    estimated: true,
    carrier: "One-way rental",
    detail: `${Math.round(car.km * 0.621)} mi · estimate incl. ${car.crossBorder ? "cross-border " : ""}one-way fee and fuel`,
    bookingUrl: "https://www.kayak.com/cars",
  };
}

/** Move a leg so it arrives exactly at `at`. */
function shiftToArrive(l: Leg, at: string): Leg {
  const d = minutesBetween(l.depart, l.arrive);
  return { ...l, depart: addMinutes(at, -d), arrive: at };
}

/** True when the trip is under way at 2am at the destination, or arrives between midnight and 5am. */
function spansNight(depart: string, arrive: string, tz: string): boolean {
  if (localHour(arrive, tz) < 5) return true;
  for (let t = zonedToIso(`${localDate(depart, tz)} 02:00`, tz); t < arrive; t = addMinutes(t, 24 * 60)) {
    if (t > depart) return true;
  }
  return false;
}
