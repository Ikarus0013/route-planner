# RoutePlanner

RoutePlanner finds ways to travel between two cities in the US and Canada and ranks them with your own words.

## What it does

You enter a start city, a destination city, a travel date and a short note. The note tells what is important to you, for example price, time or comfort. RoutePlanner gets live flights, buses, trains, ferries and rental car estimates. It also makes combined trips, for example a flight to a hub airport and a bus from there. The Jev model from TypeSafe AI reads your note and judges each trip. The app then shows all trips in a ranked list.

## Requirements

- Node.js 20.9 or later.
- npm (included with Node.js).
- A TypeSafe AI account and API key: <https://typesafe.ai>.
- A SerpApi account and API key: <https://serpapi.com>. The free plan gives 250 searches each month.

## Install

1. Get the code:

   ```bash
   git clone https://github.com/Ikarus0013/route-planner.git
   ```

2. Go into the project folder:

   ```bash
   cd route-planner
   ```

3. Install the dependencies:

   ```bash
   npm install
   ```

4. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

5. Write your API keys into the `.env` file. Refer to "Configure".

## Configure

Put these values in the `.env` file in the project root.

| Variable | Required | Description | Where to get it |
| --- | --- | --- | --- |
| `TYPESAFE_API_KEY` | Yes | Key for the Jev model. Jev reads your note and judges each trip. | <https://typesafe.ai> |
| `SERPAPI_KEY` | Yes | Key for flight search (Google Flights) and public transit search (Google Maps). | <https://serpapi.com/manage-api-key> |
| `TYPESAFE_BASE_URL` | No | Other API address for the TypeSafe SDK. | TypeSafe documentation |
| `TYPESAFE_DEFAULT_MODEL` | No | Other default model for the TypeSafe SDK. | TypeSafe documentation |
| `TYPESAFE_LOG_LEVEL` | No | Log level for the TypeSafe SDK. | TypeSafe documentation |

**CAUTION:** Do not commit the `.env` file. It contains your private keys.

## Use

1. Start the development server:

   ```bash
   npm run dev
   ```

2. Open <http://localhost:3000> in your browser.
3. Type a city in the "From" field and select it from the list.
4. Type a city in the "To" field and select it from the list.
5. Write what is important to you in the "What matters to you?" field.
6. Select a travel date.
7. Click "Find my route".
8. Wait for the results. A search can take up to one minute.
9. Use the "Jev's ranking", "Cheapest" and "Arrives first" buttons to sort the list.
10. Move the "Your trade-off" slider to give more weight to time or to money.

To make a production build, use these commands:

```bash
npm run build
npm start
```

## How it works

1. The browser sends the cities, the date and the note to `/api/plan`.
2. The server finds airports near each city and selects hub cities for stopovers.
3. The server gets flights and transit routes from SerpApi.
4. The server gets bus trips from the public FlixBus search (FlixBus and Greyhound).
5. The server gets driving times from the public OSRM server and calculates a rental car estimate.
6. The server combines these parts into complete trips.
7. Jev reads the note and gives each trip a fit score, a risk score and a "worth it" answer.
8. The browser ranks the trips with these scores and your slider setting.

The server keeps API responses in the `.cache/` folder. This decreases the number of paid API calls. The place search uses the free Photon (OpenStreetMap) service.

## Files

| Path | Description |
| --- | --- |
| `src/app/page.tsx` | Main page. |
| `src/app/api/plan/route.ts` | API route that finds and judges the trips. |
| `src/app/api/places/route.ts` | API route for the city search. |
| `src/components/` | User interface parts (form, trip cards, timeline). |
| `src/lib/jev.ts` | Calls to the Jev model (TypeSafe AI). |
| `src/lib/itineraries.ts` | Combines flights, buses, trains and cars into trips. |
| `src/lib/rank.ts` | Ranks the trips. |
| `src/lib/sources/` | Clients for SerpApi, FlixBus, OSRM and Photon. |
| `src/lib/cache.ts` | Disk cache for API responses (`.cache/`). |
| `src/data/airports.json` | US and Canadian airports with scheduled flights. |
| `src/data/hubs.ts` | Hub airports for stopovers. |
| `scripts/build-airports.mjs` | Script that makes `airports.json` again from OurAirports data. |
| `AGENTS.md`, `CLAUDE.md` | Notes for AI coding agents. |

To make `src/data/airports.json` again, use this command:

```bash
node scripts/build-airports.mjs
```

## Limits

- The app supports only cities in the US and Canada.
- Each search uses many SerpApi searches. The free plan can run out quickly.
- The FlixBus search is not an official API. It can stop working at any time.
- Rental car prices, local transit prices and some train fares are estimates.
- The app does not book tickets. It shows links to booking sites.
- Prices and times can change after the search.

## License

MIT. Refer to the `LICENSE` file.
