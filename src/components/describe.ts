import type { Itinerary, Judgment } from "@/lib/types";

export const pct = (p: number) => `${Math.round(p * 100)}%`;
export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function fitLabel(fit: number) {
  if (fit >= 0.75) return { text: "Matches what you asked for", tone: "good" as const };
  if (fit >= 0.5) return { text: "Neutral on your preferences", tone: "neutral" as const };
  if (fit >= 0.25) return { text: "Works against your main priority", tone: "warn" as const };
  return { text: "Poor fit for what you asked", tone: "bad" as const };
}

export function riskLabel(risk: number, it: Itinerary) {
  if (risk < 0.2) return { text: it.kind === "direct" ? "Airline-protected" : "Flexible connection", tone: "good" as const };
  if (risk < 0.45) return { text: "Comfortable connection", tone: "good" as const };
  if (risk < 0.7) return { text: "Tight connection", tone: "warn" as const };
  return { text: "Real stranding risk", tone: "bad" as const };
}

export function worthLabel(j: Judgment) {
  if (j.worthIt == null) return null;
  const tone = j.worthIt >= 0.6 ? ("good" as const) : j.worthIt >= 0.4 ? ("neutral" as const) : ("warn" as const);
  return { text: `${pct(j.worthIt)} you'd call it worth it`, tone };
}

export const toneClass = {
  good: "text-accent bg-accent-soft",
  neutral: "text-muted bg-line/60",
  warn: "text-warn bg-warn/10",
  bad: "text-danger bg-danger/10",
};
