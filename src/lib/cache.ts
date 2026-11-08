import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), ".cache");

/**
 * Disk cache for upstream API responses. SerpApi's free tier is 250 searches a
 * month and the Flix endpoint is unofficial, so we avoid repeat calls.
 */
export async function cached<T>(key: string, ttlMin: number, load: () => Promise<T>): Promise<T> {
  const file = path.join(DIR, createHash("sha1").update(key).digest("hex") + ".json");
  try {
    const hit = JSON.parse(await readFile(file, "utf8")) as { at: number; value: T };
    if (Date.now() - hit.at < ttlMin * 60_000) return hit.value;
  } catch {
    // miss
  }
  const value = await load();
  await mkdir(DIR, { recursive: true });
  await writeFile(file, JSON.stringify({ at: Date.now(), value }));
  return value;
}
