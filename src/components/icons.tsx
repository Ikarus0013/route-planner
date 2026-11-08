import type { Mode } from "@/lib/types";

const paths: Record<Mode, string> = {
  flight: "M2.5 13.5 21 6.5c.8-.3 1.6.5 1.2 1.3L19 12l3.2 4.2c.4.8-.4 1.6-1.2 1.3L2.5 10.5M9 12l-3 7h2.5L14 13",
  bus: "M5 17V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v11M5 17h14M5 17v2m14-2v2M5 11h14M8 14h.01M16 14h.01",
  train: "M7 3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm-3 8h16M8 21l2-4m6 4-2-4M12 3v8",
  ferry: "M3 17c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0M5 14l-1-4h16l-1 4M7 10V6h10v4M10 6V3h4v3",
  car: "M5 16H3v-4l2-5h14l2 5v4h-2M5 16a2 2 0 1 0 4 0m-4 0a2 2 0 1 1 4 0m6 0a2 2 0 1 0 4 0m-4 0a2 2 0 1 1 4 0M9 16h6M3 12h18",
  transit: "M8 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm-2 7h12M9 20l1.5-4m4.5 4-1.5-4",
  wait: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
};

export function ModeIcon({ mode, className = "size-4" }: { mode: Mode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={paths[mode]} />
    </svg>
  );
}

export const modeColor: Record<Mode, string> = {
  flight: "var(--flight)",
  bus: "var(--bus)",
  train: "var(--train)",
  ferry: "var(--ferry)",
  car: "var(--car)",
  transit: "var(--transit)",
  wait: "var(--transit)",
};
