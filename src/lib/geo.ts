import tzlookup from "@photostructure/tz-lookup";
import airportsData from "@/data/airports.json";
import { HUBS, type Hub } from "@/data/hubs";

export interface Airport {
  iata: string;
  name: string;
  city: string;
  region: string;
  country: string;
  large: boolean;
  lat: number;
  lon: number;
  tz: string;
}

/** A point the traveler starts from, ends at, or passes through. */
export interface Place {
  name: string;
  /** Human label, e.g. "Toronto, Ontario". Used for bus and transit searches. */
  label: string;
  lat: number;
  lon: number;
  tz: string;
  country: string;
}

export const AIRPORTS = airportsData as Airport[];
const BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a]));
export const airport = (iata: string) => BY_IATA.get(iata);

export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export const tzAt = (lat: number, lon: number) => tzlookup(lat, lon);

/**
 * Airports a traveler would reasonably use for this place: the large ones nearby,
 * topped up with small close ones, else the closest large airport within reach.
 */
export function airportsNear(p: Place, maxKm = 70): Airport[] {
  const sorted = AIRPORTS.map((a) => ({ a, d: km(p, a) })).sort((x, y) => x.d - y.d);
  const large = sorted.filter((x) => x.a.large && x.d <= maxKm).slice(0, 4);
  const small = sorted.filter((x) => !x.a.large && x.d <= 35);
  const near = [...large, ...small.slice(0, Math.max(0, 3 - large.length))];
  if (near.length) return near.map((x) => x.a);
  return [sorted.find((x) => x.a.large && x.d <= 250)?.a ?? sorted[0].a];
}

export interface Stopover {
  hub: Hub;
  place: Place;
  /** "destination": fly to the hub, then go by ground. "origin": ground to the hub, then fly. */
  side: "origin" | "destination";
  distanceKm: number;
}

export function hubPlace(h: Hub): Place {
  const a = airport(h.airports[0])!;
  return { name: h.city, label: h.query, lat: a.lat, lon: a.lon, tz: a.tz, country: a.country };
}

/**
 * Pick the two most promising stopovers: one near each end when possible.
 * Hubs must be roughly on the way; one near the origin gets a bonus when it
 * crosses the border towards the destination (e.g. Toronto -> Buffalo).
 */
export function pickStopovers(from: Place, to: Place, exclude: string[]): Stopover[] {
  const tripKm = km(from, to);
  const candidates: (Stopover & { score: number })[] = [];
  for (const hub of HUBS) {
    if (hub.airports.some((a) => exclude.includes(a))) continue;
    const place = hubPlace(hub);
    const dDest = km(place, to);
    const dOrig = km(place, from);
    // Going via the hub may add at most ~50% to the trip, so it's roughly on the way.
    if (dOrig + dDest > tripKm * 1.5 + 200) continue;
    if (dDest >= 120 && dDest <= 800 && dDest < tripKm) {
      candidates.push({ hub, place, side: "destination", distanceKm: dDest, score: hub.weight * 2 - dDest / 300 });
    }
    if (dOrig >= 60 && dOrig <= 300 && dOrig < tripKm) {
      const border = place.country !== from.country && place.country === to.country ? 1 : 0;
      candidates.push({ hub, place, side: "origin", distanceKm: dOrig, score: hub.weight * 2 - dOrig / 150 + border });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const bestDest = candidates.find((c) => c.side === "destination");
  const bestOrig = candidates.find((c) => c.side === "origin");
  const picked = [bestDest, bestOrig].filter((c): c is (typeof candidates)[number] => !!c);
  for (const c of candidates) {
    if (picked.length >= 2) break;
    if (!picked.some((p) => p.hub === c.hub)) picked.push(c);
  }
  return picked.map((c) => ({ hub: c.hub, place: c.place, side: c.side, distanceKm: c.distanceKm }));
}
