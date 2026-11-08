import { cached } from "../cache";
import { km, type Place } from "../geo";

/**
 * FlixBus (which owns Greyhound) public search endpoint used by flixbus.com.
 * Unofficial: responses are cached and requests kept to a minimum.
 */
const BASE = "https://global.api.flixbus.com/search";

export interface BusOption {
  price: number;
  depart: string;
  arrive: string;
  fromStation: string;
  toStation: string;
  operator: string;
  transfers: number;
  seatsLeft?: number;
  bookingUrl: string;
}

/** Flix operator ids -> display name and where to buy. Everything is also sold on flixbus.com. */
const OPERATORS: Record<string, { name: string; url: string }> = {
  grey: { name: "Greyhound", url: "https://www.greyhound.com" },
  blue: { name: "Jefferson Lines", url: "https://www.flixbus.com" },
  flixus: { name: "FlixBus", url: "https://www.flixbus.com" },
};

interface FlixCity {
  id: string;
  name: string;
  location: { lat: number; lon: number };
}

interface FlixResult {
  status: string;
  departure: { date: string; station_id: string };
  arrival: { date: string; station_id: string };
  price: { total: number; total_with_platform_fee?: number };
  available?: { seats?: number };
  legs: { operator_id?: string }[];
}

interface FlixSearch {
  trips: { results: Record<string, FlixResult> }[];
  stations: Record<string, { name: string }>;
  operators?: Record<string, { label?: string }>;
}

/** The Flix city serving this place, if any within 50 km. */
async function cityId(p: Place): Promise<string | null> {
  return cached(`flix-city:${p.label}`, 30 * 24 * 60, async () => {
    const q = new URLSearchParams({ q: p.name, lang: "en_US" });
    const res = await fetch(`${BASE}/autocomplete/cities?${q}`, { signal: AbortSignal.timeout(15_000) });
    const cities = (await res.json()) as FlixCity[];
    const best = cities
      .map((c) => ({ c, d: km(p, c.location) }))
      .filter((x) => x.d <= 50)
      .sort((a, b) => a.d - b.d)[0];
    return best?.c.id ?? null;
  });
}

export async function searchBuses(fromPlace: Place, toPlace: Place, date: string): Promise<BusOption[]> {
  const [from, to] = await Promise.all([cityId(fromPlace), cityId(toPlace)]);
  if (!from || !to) return [];
  const [y, m, d] = date.split("-");
  const params = new URLSearchParams({
    from_city_id: from,
    to_city_id: to,
    departure_date: `${d}.${m}.${y}`,
    products: JSON.stringify({ adult: 1 }),
    currency: "USD",
    locale: "en_US",
    search_by: "cities",
  });

  const data = await cached(`flix:${params}`, 30, async () => {
    const res = await fetch(`${BASE}/service/v4/search?${params}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Bus search failed (${res.status})`);
    return (await res.json()) as FlixSearch;
  });

  return data.trips
    .flatMap((t) => Object.values(t.results))
    .filter((r) => r.status === "available")
    .map((r) => {
      const opId = r.legs[0]?.operator_id ?? "";
      const op = OPERATORS[opId] ?? {
        name: data.operators?.[opId]?.label?.replace(/,? (Inc|LLC|L\.P)\.?$/, "") ?? "FlixBus",
        url: "https://www.flixbus.com",
      };
      return {
        price: r.price.total_with_platform_fee ?? r.price.total,
        depart: new Date(r.departure.date).toISOString(),
        arrive: new Date(r.arrival.date).toISOString(),
        fromStation: data.stations[r.departure.station_id]?.name ?? fromPlace.name,
        toStation: data.stations[r.arrival.station_id]?.name ?? toPlace.name,
        operator: op.name,
        transfers: r.legs.length - 1,
        seatsLeft: r.available?.seats,
        bookingUrl: op.url,
      };
    });
}
