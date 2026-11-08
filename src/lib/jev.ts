import { TypeSafeClient, choice, noul, score, type Question, type Questions, type ResultFor } from "@typesafe-ai/sdk";
import { formatDay, formatDuration, formatTime, minutesBetween } from "./time";
import type { Itinerary, Judgment, PlaceRef, Preferences, PriorityKey } from "./types";

let client: TypeSafeClient | undefined;
// Constructed lazily: the SDK throws without TYPESAFE_API_KEY, which would break `next build`.
const jev = () => (client ??= new TypeSafeClient());

const NO_REQUEST = "The traveler gave no preferences.";

const PRIORITY = {
  lowest_price: "Keeping the total cost down matters most; they will trade time or comfort to save money",
  shortest_trip: "Getting there as quickly as possible matters most",
  comfort: "An easy, low-stress, comfortable trip matters most",
  balance: "They want a sensible balance of cost and time, or state no clear priority",
} satisfies Record<PriorityKey, string>;

/** Turn the traveler's own words into typed preferences. */
export async function readPreferences(request: string) {
  const res = await jev().systemOne({
    state: { request: request.trim() || NO_REQUEST },
    questions: {
      priority: choice("What matters most to the traveler writing `request` for this trip?", PRIORITY),
      price_sensitivity: score("How sensitive to price is the traveler writing `request`?", [
        "They say cost is not a concern or they are happy to pay more for convenience",
        "They say nothing about budget or price",
        "They mention wanting a good deal or that the fares seem expensive",
        "They say the budget is tight or that saving money is essential",
      ]),
      hassle_tolerance: score("How much travel hassle will the traveler writing `request` put up with?", [
        "They want the simplest possible trip: no transfers and no long bus or train rides",
        "They would accept one transfer only if the trip stays simple",
        "They say nothing about transfers, bus rides or how complicated the trip is",
        "They say they are fine with long bus or train rides or extra transfers",
      ]),
      avoids_overnight: noul(
        "Does the traveler writing `request` say or clearly imply they do not want to travel overnight, such as an overnight bus or arriving in the middle of the night?",
      ),
      checked_bag: noul("Does the traveler writing `request` say they are bringing checked luggage or a large suitcase?"),
      cannot_drive: noul(
        "Does the traveler writing `request` say they cannot, will not, or would rather not drive a car on this trip?",
      ),
    },
  });
  const a = res.answers;
  const preferences: Preferences = {
    priority: { choice: a.priority.choice, confidence: a.priority.confidence, probabilities: { ...a.priority.probabilities } },
    priceSensitivity: a.price_sensitivity.score / 3,
    hassleTolerance: a.hassle_tolerance.score / 3,
    avoidsOvernight: a.avoids_overnight.noul,
    checkedBag: a.checked_bag.noul,
    cannotDrive: a.cannot_drive.noul,
  };
  return { preferences, model: res.model };
}

const FIT_LEVELS = [
  "The trip does something the traveler explicitly said they do not want, or misses a requirement they stated",
  "The trip goes against what the traveler said matters most, though it breaks nothing they ruled out",
  "The traveler stated nothing that this trip clearly satisfies or violates",
  "The trip delivers what the traveler said matters most to them",
] as const;

const RISK_LEVELS = [
  "Nothing depends on catching a separately booked departure: it is one ticket the carrier must rebook, or the only connection is flexible, like picking up or driving a rental car",
  "Separate tickets, but with hours of slack before the next leg or several later departures the same day",
  "Separate tickets with a buffer of an hour or two and few later options",
  "Separate tickets with little slack and no later departure that day, so a delay likely means being stranded or buying a new ticket",
] as const;

/** Judge every candidate trip against the traveler's request in a single request. */
export async function judgeItineraries(request: string, itineraries: Itinerary[], baseline: Itinerary | undefined, from: PlaceRef, to: PlaceRef) {
  const questions: Questions = {};
  itineraries.forEach((it, i) => {
    const ref = `\`itineraries[${i}]\``;
    questions[`fit.${it.id}`] = score(`How well does ${ref} match what the traveler asked for in \`traveler.request\`?`, FIT_LEVELS);
    questions[`risk.${it.id}`] = score(
      `If one part of ${ref} runs late, how exposed is the traveler to missing the next part and having to pay again?`,
      RISK_LEVELS,
    );
    if (baseline && it.kind !== "direct" && it.price < baseline.price) {
      questions[`worth.${it.id}`] = noul(
        `Compared with \`cheapest_direct_flight\`, ${ref} saves \`itineraries[${i}].savings_vs_cheapest_direct_usd\` dollars but takes \`itineraries[${i}].extra_time_vs_cheapest_direct\` longer and needs a self-managed connection. Would the traveler described in \`traveler.request\` consider that trade worth it?`,
      );
    }
  });

  const res = await jev().systemOne({
    state: {
      traveler: { request: request.trim() || NO_REQUEST },
      trip: { from: from.label, to: to.label },
      cheapest_direct_flight: baseline ? describe(baseline, baseline, from, to) : null,
      itineraries: itineraries.map((it) => describe(it, baseline, from, to)),
    },
    questions,
  });

  const answer = <T extends Question["type"]>(key: string, type: T) => {
    const a = res.answers[key] as ResultFor<Question> | undefined;
    return a?.type === type ? (a as Extract<ResultFor<Question>, { type: T }>) : undefined;
  };
  const judgments: Record<string, Judgment> = {};
  for (const it of itineraries) {
    const fit = answer(`fit.${it.id}`, "score")!;
    const risk = answer(`risk.${it.id}`, "score")!;
    judgments[it.id] = {
      fit: fit.score / 3,
      fitConfidence: fit.confidence,
      risk: risk.score / 3,
      riskConfidence: risk.confidence,
      worthIt: answer(`worth.${it.id}`, "noul")?.noul,
    };
  }
  return { judgments, model: res.model };
}

/** Plain-language summary of a trip. Arithmetic is done here, not by the model. */
function describe(it: Itinerary, baseline: Itinerary | undefined, from: PlaceRef, to: PlaceRef) {
  const steps = it.legs.map((l) => {
    switch (l.mode) {
      case "flight":
        return `Fly ${l.from} to ${l.to} on ${l.carrier} (${l.detail})`;
      case "car":
        return `Drive a ${l.carrier?.toLowerCase()} from ${l.from} to ${l.to}, ${formatDuration(minutesBetween(l.depart, l.arrive))}`;
      case "wait":
        return l.detail!;
      case "transit":
        return `${l.detail} to ${l.to}`;
      default:
        return `${l.carrier} from ${l.from} to ${l.to}, ${formatDuration(minutesBetween(l.depart, l.arrive))}`;
    }
  });
  return {
    route: steps.join("; then "),
    total_price_usd: it.price,
    door_to_door: formatDuration(it.durationMin),
    leaves_home: `${formatDay(it.depart, from.tz)} ${formatTime(it.depart, from.tz)} ${from.name} time`,
    arrives: `${formatDay(it.arrive, to.tz)} ${formatTime(it.arrive, to.tz)} ${to.name} time`,
    separate_tickets: it.tickets > 1,
    travels_through_the_night: it.overnight,
    connection_buffer: it.legs.some((l) => l.mode === "car")
      ? "Flexible: the rental car has no fixed departure time"
      : it.connectionBufferMin != null
        ? `${formatDuration(it.connectionBufferMin)} spare at the connection between separately booked tickets`
        : null,
    later_departures_same_day_if_missed: it.laterAlternatives ?? null,
    crosses_border_by_land: it.landBorder ? "Yes: a customs stop on the ground leg, which can add delays" : "No",
    savings_vs_cheapest_direct_usd: baseline ? baseline.price - it.price : null,
    extra_time_vs_cheapest_direct: baseline ? formatDuration(Math.max(0, it.durationMin - baseline.durationMin)) : null,
  };
}
