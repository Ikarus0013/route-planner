import type { Itinerary, Judgment, Preferences, PriorityKey } from "./types";

export interface Weights {
  price: number;
  time: number;
  fit: number;
  safety: number;
}

const BY_PRIORITY: Record<PriorityKey, Weights> = {
  lowest_price: { price: 0.55, time: 0.1, fit: 0.2, safety: 0.15 },
  shortest_trip: { price: 0.1, time: 0.55, fit: 0.2, safety: 0.15 },
  balance: { price: 0.3, time: 0.3, fit: 0.2, safety: 0.2 },
  comfort: { price: 0.15, time: 0.2, fit: 0.35, safety: 0.3 },
};

/** Blend the per-priority weights by Jev's probability for each priority. */
export function weightsFor(prefs: Preferences): Weights {
  const w: Weights = { price: 0, time: 0, fit: 0, safety: 0 };
  for (const [k, p] of Object.entries(prefs.priority.probabilities) as [PriorityKey, number][]) {
    for (const f of Object.keys(w) as (keyof Weights)[]) w[f] += p * BY_PRIORITY[k][f];
  }
  return w;
}

/** Re-split the price+time share: 0 = all time, 1 = all price. */
export function withPriceTilt(w: Weights, tilt: number): Weights {
  const mass = w.price + w.time;
  return { ...w, price: mass * tilt, time: mass * (1 - tilt) };
}

export const tiltOf = (w: Weights) => w.price / (w.price + w.time || 1);

export interface Ranked {
  it: Itinerary;
  j: Judgment;
  score: number;
  /** Hard conflict with what the traveler said (e.g. drive when they can't). */
  excluded?: string;
  penalty?: string;
}

export function rank(itineraries: Itinerary[], judgments: Record<string, Judgment>, prefs: Preferences, w: Weights): Ranked[] {
  const prices = itineraries.map((i) => i.price);
  const times = itineraries.map((i) => i.durationMin);
  const norm = (v: number, xs: number[]) => {
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    return hi === lo ? 1 : (hi - v) / (hi - lo);
  };
  const total = w.price + w.time + w.fit + w.safety || 1;

  return itineraries
    .map((it) => {
      const j = judgments[it.id];
      let score =
        (w.price * norm(it.price, prices) + w.time * norm(it.durationMin, times) + w.fit * j.fit + w.safety * (1 - j.risk)) /
        total;
      const r: Ranked = { it, j, score };
      if (it.overnight && prefs.avoidsOvernight > 0.5) {
        r.score = score *= 1 - 0.5 * prefs.avoidsOvernight;
        r.penalty = "Travels overnight, which you said you'd rather avoid";
      }
      if (it.legs.some((l) => l.mode === "car") && prefs.cannotDrive > 0.5) {
        r.excluded = "You said you won't drive";
      }
      return r;
    })
    .sort((a, b) => Number(!!a.excluded) - Number(!!b.excluded) || b.score - a.score);
}
