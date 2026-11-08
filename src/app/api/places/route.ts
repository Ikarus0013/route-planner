import { searchPlaces } from "@/lib/sources/geocode";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return Response.json(await searchPlaces(q));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
