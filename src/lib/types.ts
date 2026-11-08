export type Mode = "flight" | "bus" | "train" | "ferry" | "car" | "transit" | "wait";

/** One continuous piece of a trip. Times are ISO instants (UTC). */
export interface Leg {
  mode: Mode;
  from: string;
  to: string;
  depart: string;
  arrive: string;
  /** Local timezone for displaying the departure / arrival times. */
  departTz: string;
  arriveTz: string;
  /** USD; 0 for waits. */
  price: number;
  /** True when the price is our estimate rather than a live quote. */
  estimated?: boolean;
  carrier?: string;
  detail?: string;
  bookingUrl?: string;
}

export interface Itinerary {
  id: string;
  kind: "direct" | "via" | "ground";
  label: string;
  legs: Leg[];
  price: number;
  /** Minutes from first departure to arrival downtown at the destination. */
  durationMin: number;
  depart: string;
  arrive: string;
  /** Number of separately purchased tickets (bus, train and car count as their own). */
  tickets: number;
  /** Minutes between landing and the ground departure, for self-transfers. */
  connectionBufferMin?: number;
  /** Ground departures still possible later the same day if this one is missed. */
  laterAlternatives?: number;
  overnight: boolean;
  hasEstimate: boolean;
  /** Crosses the US/Canada border by bus, train, ferry or car (customs line, delay risk). */
  landBorder?: boolean;
}

export interface Preferences {
  priority: {
    choice: PriorityKey;
    confidence: number;
    probabilities: Record<PriorityKey, number>;
  };
  /** 0 (money no object) .. 1 (every dollar counts) */
  priceSensitivity: number;
  /** 0 (wants simplest trip) .. 1 (happy to put up with hassle) */
  hassleTolerance: number;
  /** Probabilities (0..1) */
  avoidsOvernight: number;
  checkedBag: number;
  cannotDrive: number;
}

export type PriorityKey = "lowest_price" | "shortest_trip" | "balance" | "comfort";

export interface Judgment {
  /** 0 conflicts with request .. 1 matches it well */
  fit: number;
  fitConfidence: number;
  /** 0 airline-protected .. 1 likely stranded */
  risk: number;
  riskConfidence: number;
  /** Probability the traveler would call the saving worth it (via options only). */
  worthIt?: number;
}

export interface PlaceRef {
  name: string;
  label: string;
  tz: string;
}

export interface PlanResponse {
  query: { date: string; request: string; from: PlaceRef; to: PlaceRef };
  stopovers: string[];
  preferences: Preferences;
  itineraries: Itinerary[];
  judgments: Record<string, Judgment>;
  baselineId?: string;
  model: string;
  warnings: string[];
}
