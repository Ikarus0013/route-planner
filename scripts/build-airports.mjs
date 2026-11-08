// Builds src/data/airports.json from OurAirports (public domain):
// US and Canadian airports with scheduled passenger service, plus their timezone.
// Run: node scripts/build-airports.mjs
import { writeFileSync } from "node:fs";
import tzlookup from "@photostructure/tz-lookup";

const COUNTRIES = new Set(["US", "CA"]);
const csv = await (await fetch("https://davidmegginson.github.io/ourairports-data/airports.csv")).text();

function parseLine(line) {
  const out = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") out.push(cur), (cur = "");
    else cur += c;
  }
  out.push(cur);
  return out;
}

const [header, ...rows] = csv.trim().split("\n");
const cols = parseLine(header);
const col = (r, name) => r[cols.indexOf(name)];
const airports = rows
  .map(parseLine)
  .filter(
    (r) =>
      COUNTRIES.has(col(r, "iso_country")) &&
      ["large_airport", "medium_airport"].includes(col(r, "type")) &&
      col(r, "scheduled_service") === "yes" &&
      /^[A-Z]{3}$/.test(col(r, "iata_code")),
  )
  .map((r) => {
    const lat = Number(col(r, "latitude_deg"));
    const lon = Number(col(r, "longitude_deg"));
    return {
      iata: col(r, "iata_code"),
      name: col(r, "name"),
      city: col(r, "municipality"),
      region: col(r, "iso_region").split("-")[1],
      country: col(r, "iso_country"),
      large: col(r, "type") === "large_airport",
      lat: Math.round(lat * 1e4) / 1e4,
      lon: Math.round(lon * 1e4) / 1e4,
      tz: tzlookup(lat, lon),
    };
  });

writeFileSync(new URL("../src/data/airports.json", import.meta.url), JSON.stringify(airports));
console.log(`${airports.length} airports`);
