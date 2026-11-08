import { cached } from "../cache";
import { airport } from "../geo";
import { addMinutes, zonedToIso } from "../time";

export interface FlightOption {
  price: number;
  depart: string;
  arrive: string;
  fromAirport: string;
  toAirport: string;
  durationMin: number;
  stops: number;
  airlines: string;
  flightNumbers: string;
  bookingUrl?: string;
  /** Google flags segments that are often delayed by 30+ minutes. */
  oftenDelayed: boolean;
}

interface SerpSegment {
  departure_airport: { id: string; time: string };
  arrival_airport: { id: string; time: string };
  airline: string;
  flight_number: string;
  often_delayed_by_over_30_min?: boolean;
}

interface SerpItinerary {
  flights: SerpSegment[];
  total_duration: number;
  price?: number;
}

interface SerpResponse {
  error?: string;
  best_flights?: SerpItinerary[];
  other_flights?: SerpItinerary[];
  search_metadata?: { google_flights_url?: string };
}

export class FlightSearchError extends Error {}

/** One-way economy search via SerpApi's Google Flights engine. */
export async function searchFlights(from: string, to: string, date: string): Promise<FlightOption[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key || key.startsWith("paste-")) {
    throw new FlightSearchError("SERPAPI_KEY is missing. Add it to .env to get live flight prices.");
  }
  const params = new URLSearchParams({
    engine: "google_flights",
    departure_id: from,
    arrival_id: to,
    outbound_date: date,
    type: "2",
    currency: "USD",
    hl: "en",
    gl: "us",
    adults: "1",
  });

  const data = await cached(`serp:${params}`, 6 * 60, async () => {
    params.set("api_key", key);
    const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(30_000) });
    const body = (await res.json()) as SerpResponse;
    if (body.error?.includes("hasn't returned any results")) return {};
    if (!res.ok || body.error) throw new FlightSearchError(`Flight search failed: ${body.error ?? res.status}`);
    return body;
  });

  const url = data.search_metadata?.google_flights_url;
  return [...(data.best_flights ?? []), ...(data.other_flights ?? [])]
    .filter((it) => it.price != null && it.flights.length > 0)
    .map((it) => toOption(it, url));
}

function toOption(it: SerpItinerary, bookingUrl?: string): FlightOption {
  const first = it.flights[0];
  const last = it.flights[it.flights.length - 1];
  const fromTz = airport(first.departure_airport.id)?.tz ?? "America/New_York";
  const depart = zonedToIso(first.departure_airport.time, fromTz);
  return {
    price: it.price!,
    depart,
    // total_duration is exact and avoids needing the arrival airport's timezone.
    arrive: addMinutes(depart, it.total_duration),
    fromAirport: first.departure_airport.id,
    toAirport: last.arrival_airport.id,
    durationMin: it.total_duration,
    stops: it.flights.length - 1,
    airlines: [...new Set(it.flights.map((f) => f.airline))].join(" + "),
    flightNumbers: it.flights.map((f) => f.flight_number).join(", "),
    bookingUrl,
    oftenDelayed: it.flights.some((f) => f.often_delayed_by_over_30_min),
  };
}
