"use client";

import { useState } from "react";
import type { Ranked } from "@/lib/rank";
import { formatDay, formatDuration, formatTime, minutesBetween } from "@/lib/time";
import type { Itinerary } from "@/lib/types";
import { fitLabel, riskLabel, toneClass, usd, worthLabel } from "./describe";
import { ModeIcon, modeColor } from "./icons";
import { Timeline, type TimeWindow } from "./Timeline";

function Pill({ text, tone }: { text: string; tone: keyof typeof toneClass }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${toneClass[tone]}`}>{text}</span>;
}

function Delta({ it, baseline }: { it: Itinerary; baseline?: Itinerary }) {
  if (!baseline || it.id === baseline.id) return <span className="text-muted">Cheapest direct flight</span>;
  const save = baseline.price - it.price;
  const extra = it.durationMin - baseline.durationMin;
  return (
    <span>
      <span className={save > 0 ? "font-medium text-accent" : "text-muted"}>
        {save > 0 ? `Saves ${usd(save)}` : save < 0 ? `${usd(-save)} more` : "Same price"}
      </span>
      <span className="text-muted">
        {" · "}
        {extra > 0 ? `${formatDuration(extra)} longer` : `${formatDuration(-extra)} faster`}
      </span>
    </span>
  );
}

export function TripCard({
  r,
  window,
  tz,
  baseline,
  rank,
  hero = false,
}: {
  r: Ranked;
  window: TimeWindow;
  tz: string;
  baseline?: Itinerary;
  rank: number;
  hero?: boolean;
}) {
  const [open, setOpen] = useState(hero);
  const { it, j } = r;
  const fit = fitLabel(j.fit);
  const risk = riskLabel(j.risk, it);
  const worth = worthLabel(j);

  return (
    <article
      className={`rise rounded-3xl border bg-card transition-shadow ${
        hero ? "border-accent/40 p-6 shadow-[0_20px_60px_-30px_rgba(31,77,63,0.45)] sm:p-8" : "border-line p-5 hover:shadow-lg hover:shadow-black/5"
      } ${r.excluded ? "opacity-55" : ""}`}
      style={{ animationDelay: `${Math.min(rank, 8) * 50}ms` }}
    >
      <button type="button" onClick={() => setOpen((o) => !o)} className="block w-full text-left" aria-expanded={open}>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            {hero && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">Jev&rsquo;s pick for you</p>}
            <h3 className={`${hero ? "font-display text-4xl leading-tight" : "text-lg font-semibold"} flex items-center gap-2`}>
              {!hero && <span className="w-5 text-sm tabular-nums text-muted">{rank}</span>}
              {it.label}
            </h3>
            <p className="mt-1 text-sm">
              <Delta it={it} baseline={baseline} />
            </p>
          </div>
          <div className="text-right">
            <p className={`${hero ? "font-display text-5xl" : "text-2xl font-semibold"} tabular-nums`}>
              {usd(it.price)}
              {it.hasEstimate && <span className="align-super text-sm text-muted">*</span>}
            </p>
            <p className="text-sm text-muted">
              {formatDuration(it.durationMin)} door to door
            </p>
          </div>
        </div>

        <div className={hero ? "mt-8" : "mt-5"}>
          <Timeline it={it} window={window} tz={tz} tall={hero} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {r.excluded && <Pill text={r.excluded} tone="bad" />}
          {r.penalty && <Pill text={r.penalty} tone="warn" />}
          {worth && <Pill {...worth} />}
          <Pill {...risk} />
          <Pill {...fit} />
          {it.overnight && !r.penalty && <Pill text="Travels overnight" tone="neutral" />}
          {it.landBorder && <Pill text="Customs on the way" tone="neutral" />}
          <span className="ml-auto text-xs text-muted">{open ? "Hide details" : "Details"}</span>
        </div>
      </button>

      {open && <LegList it={it} />}
    </article>
  );
}

function LegList({ it }: { it: Itinerary }) {
  return (
    <ol className="mt-6 space-y-0 border-t border-line pt-5">
      {it.legs.map((l, i) => (
        <li key={i} className="grid grid-cols-[4.5rem_1.75rem_1fr] gap-x-3 pb-4 last:pb-0 sm:grid-cols-[6.5rem_1.75rem_1fr_auto]">
          <div className="pt-0.5 text-right text-sm tabular-nums">
            <div className="font-medium">{formatTime(l.depart, l.departTz)}</div>
            <div className="text-[11px] text-muted">{formatDay(l.depart, l.departTz)}</div>
          </div>
          <div className="flex flex-col items-center">
            <span
              className={`grid size-7 place-items-center rounded-full ${l.mode === "wait" || l.mode === "transit" ? "bg-line text-muted" : "text-white"}`}
              style={l.mode === "wait" || l.mode === "transit" ? undefined : { background: modeColor[l.mode] }}
            >
              <ModeIcon mode={l.mode} className="size-3.5" />
            </span>
            {i < it.legs.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
          </div>
          <div className="min-w-0 pb-1">
            <p className="text-sm font-medium">
              {l.mode === "wait" ? l.detail : l.mode === "transit" ? `${l.from} → ${l.to}` : `${l.carrier} · ${l.from} → ${l.to}`}
            </p>
            <p className="text-xs text-muted">
              {l.mode === "transit" && l.detail}
              {l.mode !== "transit" && l.mode !== "wait" && (
                <>
                  {formatDuration(minutesBetween(l.depart, l.arrive))} · arrives {formatTime(l.arrive, l.arriveTz)}
                  {l.detail && ` · ${l.detail}`}
                </>
              )}
            </p>
          </div>
          <div className="col-start-3 flex items-center gap-3 text-sm sm:col-start-auto sm:justify-end">
            {l.price > 0 && (
              <span className="tabular-nums text-muted">
                {l.estimated ? "~" : ""}
                {usd(l.price)}
              </span>
            )}
            {l.bookingUrl && (
              <a
                href={l.bookingUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:border-ink"
                onClick={(e) => e.stopPropagation()}
              >
                Book
              </a>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
