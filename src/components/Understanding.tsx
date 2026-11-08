import type { Preferences, PriorityKey } from "@/lib/types";
import { pct } from "./describe";

const PRIORITY_LABEL: Record<PriorityKey, string> = {
  lowest_price: "Lowest price",
  shortest_trip: "Fastest trip",
  balance: "Balance of both",
  comfort: "Easy & comfortable",
};

const level = (v: number, labels: [string, string, string, string]) => labels[Math.min(3, Math.round(v * 3))];

/** What Jev understood from the traveler's note, with its probabilities. */
export function Understanding({ prefs }: { prefs: Preferences }) {
  const rows = (Object.entries(prefs.priority.probabilities) as [PriorityKey, number][]).sort((a, b) => b[1] - a[1]);
  const flags = [
    { label: "Avoid overnight travel", p: prefs.avoidsOvernight },
    { label: "Checked bag", p: prefs.checkedBag },
    { label: "Won't drive", p: prefs.cannotDrive },
  ];

  return (
    <section className="rise rounded-3xl border border-line bg-card p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">What Jev heard</p>
      <div className="mt-4 space-y-2.5">
        {rows.map(([k, p]) => (
          <div key={k} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 text-sm">
            <span className={k === prefs.priority.choice ? "font-medium" : "text-muted"}>{PRIORITY_LABEL[k]}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-line">
              <span
                className="block h-full rounded-full bg-accent transition-[width] duration-700"
                style={{ width: pct(p), opacity: k === prefs.priority.choice ? 1 : 0.45 }}
              />
            </span>
            <span className="text-right tabular-nums text-muted">{pct(p)}</span>
          </div>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-paper p-3">
          <dt className="text-xs text-muted">Price sensitivity</dt>
          <dd className="mt-0.5 font-medium">{level(prefs.priceSensitivity, ["Not a concern", "Not mentioned", "Wants a deal", "Tight budget"])}</dd>
        </div>
        <div className="rounded-2xl bg-paper p-3">
          <dt className="text-xs text-muted">Hassle tolerance</dt>
          <dd className="mt-0.5 font-medium">{level(prefs.hassleTolerance, ["Keep it simple", "One transfer max", "Not mentioned", "Happy to rough it"])}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {flags.map((f) => (
          <span
            key={f.label}
            className={`rounded-full px-2.5 py-1 text-xs ${f.p > 0.5 ? "bg-accent-soft font-medium text-accent" : "bg-paper text-muted line-through decoration-muted/50"}`}
            title={`Probability ${pct(f.p)}`}
          >
            {f.label} · {pct(f.p)}
          </span>
        ))}
      </div>
    </section>
  );
}
