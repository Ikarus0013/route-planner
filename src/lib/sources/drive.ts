import { cached } from "../cache";

/** OSRM public demo server (OpenStreetMap): free, keyless, fair use. */
export async function driveRoute(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const coords = `${a.lon.toFixed(4)},${a.lat.toFixed(4)};${b.lon.toFixed(4)},${b.lat.toFixed(4)}`;
  return cached(`osrm:${coords}`, 30 * 24 * 60, async () => {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`, {
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as { code: string; routes?: { duration: number; distance: number }[] };
    const r = body.routes?.[0];
    if (body.code !== "Ok" || !r) return null;
    return { minutes: Math.round(r.duration / 60), km: Math.round(r.distance / 1000) };
  });
}
