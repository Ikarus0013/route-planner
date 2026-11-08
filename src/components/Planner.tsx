"use client";

import { useEffect, useMemo, useState } from "react";
import type { Place } from "@/lib/geo";
import { rank, tiltOf, weightsFor, withPriceTilt } from "@/lib/rank";
import { formatDay } from "@/lib/time";
import type { PlanResponse } from "@/lib/types";
import { usd } from "./describe";
import { ModeIcon } from "./icons";
import { PlaceInput } from "./PlaceInput";
import { TripCard } from "./TripCard";
import { Understanding } from "./Understanding";

const EXAMPLES = [
  "Cheapest way there, I don't mind a long bus ride",
  "I need to arrive before 9pm and I have a big suitcase",
  "I don't drive, and I'd rather not travel overnight",
  "Time matters more than money for me",
];

const DEFAULT_NOTE =
  "Direct flights are really expensive. I'd happily take a bus or train for part of the way if it saves real money, but I'd rather not arrive in the middle of the night. Carry-on only.";

/** Prefilled so the first visit shows the trip that started this project. */
const TORONTO: Place = { name: "Toronto", label: "Toronto, Ontario", lat: 43.6535, lon: -79.3839, tz: "America/Toronto", country: "CA" };
const MINNEAPOLIS: Place = { name: "Minneapolis", label: "Minneapolis, Minnesota", lat: 44.9778, lon: -93.265, tz: "America/Chicago", country: "US" };

const STEPS = [
  { mode: "wait", text: "Jev is reading your note" },
  { mode: "flight", text: "Searching live flights, including cheaper airports nearby" },
  { mode: "bus", text: "Checking buses" },
  { mode: "train", text: "Finding trains and ferries" },
  { mode: "car", text: "Pricing rental cars" },
  { mode: "transit", text: "Jev is judging every combination" },
] as const;

type Sort = "jev" | "price" | "time";

function defaultDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

export function Planner() {
  const [from, setFrom] = useState<Place | null>(TORONTO);
  const [to, setTo] = useState<Place | null>(MINNEAPOLIS);
  const [date, setDate] = useState(defaultDate);
  const [note, setNote] = useState(DEFAULT_NOTE);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [tilt, setTilt] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>("jev");

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 1400);
    return () => clearInterval(t);
  }, [loading]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) {
      setError("Pick both places from the suggestions.");
      return;
    }
    setLoading(true);
    setStep(0);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, date, request: note }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setPlan(body);
      setTilt(null);
      setSort("jev");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const view = useMemo(() => {
    if (!plan) return null;
    const base = weightsFor(plan.preferences);
    const weights = tilt == null ? base : withPriceTilt(base, tilt);
    const ranked = rank(plan.itineraries, plan.judgments, plan.preferences, weights);
    const sorted =
      sort === "price"
        ? [...ranked].sort((a, b) => a.it.price - b.it.price)
        : sort === "time"
          ? [...ranked].sort((a, b) => a.it.arrive.localeCompare(b.it.arrive))
          : ranked;
    const window = {
      start: plan.itineraries.reduce((m, i) => (i.depart < m ? i.depart : m), plan.itineraries[0].depart),
      end: plan.itineraries.reduce((m, i) => (i.arrive > m ? i.arrive : m), plan.itineraries[0].arrive),
    };
    const baseline = plan.itineraries.find((i) => i.id === plan.baselineId);
    return { ranked, sorted, window, baseline, tilt: tiltOf(weights), pick: ranked[0] };
  }, [plan, tilt, sort]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-7 place-items-center rounded-full bg-ink text-paper">
            <ModeIcon mode="flight" className="size-3.5" />
          </span>
          RoutePlanner
        </span>
        <span className="text-xs text-muted">Judgments by Jev · TypeSafe</span>
      </header>

      <section className="pt-8 pb-10 sm:pt-14">
        <h1 className="font-display text-5xl leading-[1.02] tracking-tight sm:text-7xl">
          Get there <span className="italic text-muted">for less,</span>
          <br />
          <span className="italic">not just faster.</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted">
          The direct flight is the obvious choice, not always the smart one. We check cheaper airports nearby, then
          buses, trains, ferries and rental cars to close the gap, and Jev weighs every combination against what you tell
          it.
        </p>
      </section>

      <form onSubmit={submit} className="rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <PlaceInput label="From" value={from} onChange={setFrom} placeholder="City you're leaving from" />
          <button
            type="button"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
            aria-label="Swap origin and destination"
            className="grid size-11 shrink-0 place-items-center self-center rounded-full border border-line text-muted transition hover:border-ink hover:text-ink sm:mb-1.5"
          >
            <svg viewBox="0 0 24 24" className="size-4 rotate-90 sm:rotate-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 7h13l-4-4M17 17H4l4 4" />
            </svg>
          </button>
          <PlaceInput label="To" value={to} onChange={setTo} placeholder="Where you're going" />
        </div>
        <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">What matters to you?</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-2 w-full resize-none rounded-2xl border border-line bg-paper px-4 py-3 text-base outline-none focus:border-accent"
              placeholder="e.g. Cheapest possible, but no overnight buses"
            />
          </label>
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Travel date</span>
              <input
                type="date"
                value={date}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-line bg-paper px-4 py-3 outline-none focus:border-accent"
                required
              />
            </label>
            <button
              disabled={loading}
              className="mt-auto rounded-2xl bg-ink px-5 py-3.5 font-medium text-paper transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Planning…" : "Find my route"}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((x) => (
            <button
              type="button"
              key={x}
              onClick={() => setNote(x)}
              className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:border-ink hover:text-ink"
            >
              {x}
            </button>
          ))}
        </div>
      </form>

      {loading && (
        <section className="mt-10 space-y-4" aria-live="polite">
          <div className="flex items-center gap-3 text-sm">
            <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-accent">
              <ModeIcon mode={STEPS[step].mode} className="size-4" />
            </span>
            <span key={step} className="rise">
              {STEPS[step].text}…
            </span>
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-36 rounded-3xl" style={{ opacity: 1 - i * 0.25 }} />
          ))}
        </section>
      )}

      {error && !loading && (
        <div className="mt-10 rounded-3xl border border-danger/30 bg-danger/5 p-5 text-sm text-danger">{error}</div>
      )}

      {view && !loading && plan && (
        <div className="mt-12 space-y-10">
          <div className="rise">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {formatDay(`${plan.query.date}T12:00:00Z`, "UTC")}
              {plan.stopovers.length > 0 && <> · also checked via {plan.stopovers.join(" and ")}</>}
            </p>
            <h2 className="mt-1 font-display text-4xl sm:text-5xl">
              {plan.query.from.name} <span className="italic text-muted">to</span> {plan.query.to.name}
            </h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <TripCard key={`pick-${view.pick.it.id}`} r={view.pick} window={view.window} tz={plan.query.to.tz} baseline={view.baseline} rank={1} hero />
            <div className="space-y-6">
              <Understanding prefs={plan.preferences} />
              <section className="rise rounded-3xl border border-line bg-card p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Your trade-off</p>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={view.tilt}
                  onChange={(e) => setTilt(Number(e.target.value))}
                  className="mt-4 w-full"
                  aria-label="Weight time versus price"
                />
                <div className="mt-1 flex justify-between text-xs text-muted">
                  <span>Save time</span>
                  <span>Save money</span>
                </div>
                <p className="mt-3 text-xs text-muted">
                  Re-ranks instantly using Jev&rsquo;s saved judgments. No new AI calls.
                  {tilt != null && (
                    <button type="button" onClick={() => setTilt(null)} className="ml-1 underline">
                      Reset to Jev&rsquo;s reading
                    </button>
                  )}
                </p>
              </section>
            </div>
          </div>

          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl">Every way there</h2>
                <p className="text-sm text-muted">
                  {plan.itineraries.length} door-to-door options
                  {view.baseline && <> · cheapest direct flight {usd(view.baseline.price)}</>}
                </p>
              </div>
              <div className="flex rounded-full border border-line bg-card p-1 text-sm">
                {(
                  [
                    ["jev", "Jev’s ranking"],
                    ["price", "Cheapest"],
                    ["time", "Arrives first"],
                  ] as [Sort, string][]
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSort(k)}
                    className={`rounded-full px-3.5 py-1.5 transition ${sort === k ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Legend />
            <div className="mt-6 space-y-4">
              {view.sorted.map((r, i) => (
                <TripCard key={`${sort}-${r.it.id}`} r={r} window={view.window} tz={plan.query.to.tz} baseline={view.baseline} rank={i + 1} />
              ))}
            </div>
          </section>

          <footer className="space-y-1 border-t border-line pt-6 text-xs text-muted">
            <p>
              Flights: live Google Flights prices. Buses: live Greyhound, FlixBus and partner fares. Trains and ferries: live
              Google schedules. * Train and ferry fares, rental cars, rideshares and checked-bag fees are estimates.
            </p>
            <p>
              Times are door to door, including check-in and typical local transit to and from airports and stations
              (estimated).
              Model: {plan.model}.
            </p>
            {plan.warnings.map((w) => (
              <p key={w} className="text-warn">
                {w}
              </p>
            ))}
          </footer>
        </div>
      )}
    </main>
  );
}

function Legend() {
  const items = [
    ["flight", "Flight"],
    ["bus", "Bus"],
    ["train", "Train"],
    ["ferry", "Ferry"],
    ["car", "Drive"],
    ["transit", "Local transit"],
    ["wait", "Waiting"],
  ] as const;
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      {items.map(([m, label]) => (
        <span key={m} className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-5 rounded-full ${m === "wait" ? "hatch" : ""}`}
            style={m === "wait" ? undefined : { background: `var(--${m})`, opacity: m === "transit" ? 0.55 : 1 }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}
