import { cached } from "../cache";
import { tzAt, type Place } from "../geo";

/** Photon (komoot) OpenStreetMap geocoder: free, keyless, fair use. */
const PHOTON = "https://photon.komoot.io/api/";
const COUNTRIES = new Set(["US", "CA"]);
const KINDS = new Set(["city", "town", "village", "hamlet", "suburb", "municipality", "borough", "neighbourhood"]);

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; state?: string; country?: string; countrycode?: string; osm_value?: string };
}

export async function searchPlaces(q: string): Promise<Place[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const data = await cached(`photon:${query.toLowerCase()}`, 7 * 24 * 60, async () => {
    const params = new URLSearchParams({ q: query, limit: "15", lang: "en" });
    const res = await fetch(`${PHOTON}?${params}`, {
      headers: { "User-Agent": "RoutePlanner (personal project)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Place search failed (${res.status})`);
    return ((await res.json()) as { features: PhotonFeature[] }).features;
  });

  const seen = new Set<string>();
  return data
    .filter((f) => COUNTRIES.has(f.properties.countrycode ?? "") && KINDS.has(f.properties.osm_value ?? "") && f.properties.name)
    .map((f) => {
      const [lon, lat] = f.geometry.coordinates;
      const p = f.properties;
      return {
        name: p.name!,
        label: [p.name, p.state].filter(Boolean).join(", "),
        lat,
        lon,
        tz: tzAt(lat, lon),
        country: p.countrycode!,
      };
    })
    .filter((p) => !seen.has(p.label) && seen.add(p.label))
    .slice(0, 6);
}
