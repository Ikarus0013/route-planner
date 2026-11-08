import { APIError, TypeSafeError } from "@typesafe-ai/sdk";
import { airportsNear, hubPlace, km, pickStopovers, tzAt, type Place } from "@/lib/geo";
import { groundOptions } from "@/lib/ground";
import { buildItineraries, type StopoverData } from "@/lib/itineraries";
import { judgeItineraries, readPreferences } from "@/lib/jev";
import { searchPlaces } from "@/lib/sources/geocode";
import { searchFlights } from "@/lib/sources/flights";
import type { PlanResponse } from "@/lib/types";

export const maxDuration = 60;

/** Only look for whole-trip ground options (and spend a transit search on them) up to this distance. */
const WHOLE_WAY_MAX_KM = 1500;

interface Body {
  date?: string;
  request?: string;
  from?: Place;
  to?: Place;
}

const validPlace = (p?: Place): p is Place =>
  !!p && typeof p.lat === "number" && typeof p.lon === "number" && typeof p.name === "string" && typeof p.label === "string";

export async function POST(req: Request) {
  const { date, request = "", from: rawFrom, to: rawTo } = (await req.json()) as Body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Pick a travel date." }, { status: 400 });
  if (!validPlace(rawFrom) || !validPlace(rawTo)) return Response.json({ error: "Pick where you're leaving from and going to." }, { status: 400 });
  // Recompute timezones server-side rather than trusting the client.
  const from = { ...rawFrom, tz: tzAt(rawFrom.lat, rawFrom.lon) };
  const to = { ...rawTo, tz: tzAt(rawTo.lat, rawTo.lon) };
  if (km(from, to) < 50) return Response.json({ error: "Those places are too close together for this planner." }, { status: 400 });

  const warnings: string[] = [];
  const soft = <T,>(label: string, p: Promise<T>, fallback: T) =>
    p.catch((e: Error) => {
      warnings.push(`${label}: ${e.message}`);
      return fallback;
    });

  const originAirports = airportsNear(from).map((a) => a.iata);
  const destAirports = airportsNear(to).map((a) => a.iata);
  const stopovers = pickStopovers(from, to, [...originAirports, ...destAirports]);
  const tripKm = km(from, to);

  try {
    // Everything independent runs at once: Jev reads the note while the searches run.
    const [prefs, direct, stopoverData, wholeWay] = await Promise.all([
      readPreferences(request),
      soft("Direct flights", searchFlights(originAirports.join(","), destAirports.join(","), date), []),
      Promise.all(
        stopovers.map(async (stop): Promise<StopoverData> => {
          const city = (await soft(`Finding ${stop.hub.city}`, searchPlaces(stop.hub.query), []))[0] ?? hubPlace(stop.hub);
          const flightsP =
            stop.side === "destination"
              ? searchFlights(originAirports.join(","), stop.hub.airports.join(","), date)
              : searchFlights(stop.hub.airports.join(","), destAirports.join(","), date);
          const groundP =
            stop.side === "destination"
              ? groundOptions(city, to, date, { nextDay: true, transit: true })
              : groundOptions(from, city, date, { transit: true });
          const [flights, ground] = await Promise.all([soft(`Flights via ${stop.hub.city}`, flightsP, []), groundP]);
          warnings.push(...ground.warnings);
          return { stop, city, flights, ground: ground.options };
        }),
      ),
      tripKm <= WHOLE_WAY_MAX_KM
        ? groundOptions(from, to, date, { transit: true, maxDriveMinutes: 14 * 60 }).then((g) => {
            warnings.push(...g.warnings);
            return g.options;
          })
        : Promise.resolve([]),
    ]);

    const itineraries = buildItineraries({
      from,
      to,
      date,
      checkedBag: prefs.preferences.checkedBag > 0.5,
      direct,
      stopovers: stopoverData,
      wholeWay,
    });
    if (!itineraries.length) {
      return Response.json({ error: warnings[0] ?? "We couldn't find any way to make that trip on that date.", warnings }, { status: 502 });
    }

    // Compare against the cheapest *reasonable* flight, not a 20-hour one that happens to be cheapest.
    const flights = itineraries.filter((i) => i.kind === "direct");
    const fastest = Math.min(...flights.map((i) => i.durationMin));
    const baseline = flights.filter((i) => i.durationMin <= fastest * 1.8 + 60).sort((a, b) => a.price - b.price)[0];
    const fromRef = { name: from.name, label: from.label, tz: from.tz };
    const toRef = { name: to.name, label: to.label, tz: to.tz };
    const { judgments, model } = await judgeItineraries(request, itineraries, baseline, fromRef, toRef);

    const body: PlanResponse = {
      query: { date, request, from: fromRef, to: toRef },
      stopovers: stopovers.map((s) => s.hub.city),
      preferences: prefs.preferences,
      itineraries,
      judgments,
      baselineId: baseline?.id,
      model,
      warnings,
    };
    return Response.json(body);
  } catch (e) {
    if (e instanceof APIError) return Response.json({ error: `Jev request failed (${e.status}): ${e.message}` }, { status: 502 });
    if (e instanceof TypeSafeError) return Response.json({ error: e.message }, { status: 500 });
    throw e;
  }
}
