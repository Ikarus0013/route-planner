/**
 * Airports worth trying as a stopover: big hubs with lots of competition, plus a
 * few border airports Canadians use to reach cheaper US fares. `weight` is a
 * rough 1-3 measure of how often flying there beats flying to a smaller airport.
 */
export interface Hub {
  city: string;
  /** How bus and transit search should name the city. */
  query: string;
  airports: string[];
  weight: number;
}

export const HUBS: Hub[] = [
  { city: "Chicago", query: "Chicago, IL", airports: ["ORD", "MDW"], weight: 3 },
  { city: "New York", query: "New York, NY", airports: ["JFK", "LGA", "EWR"], weight: 3 },
  { city: "Atlanta", query: "Atlanta, GA", airports: ["ATL"], weight: 3 },
  { city: "Dallas", query: "Dallas, TX", airports: ["DFW", "DAL"], weight: 3 },
  { city: "Denver", query: "Denver, CO", airports: ["DEN"], weight: 3 },
  { city: "Las Vegas", query: "Las Vegas, NV", airports: ["LAS"], weight: 3 },
  { city: "Los Angeles", query: "Los Angeles, CA", airports: ["LAX", "BUR", "LGB"], weight: 3 },
  { city: "Miami", query: "Miami, FL", airports: ["MIA", "FLL"], weight: 3 },
  { city: "Orlando", query: "Orlando, FL", airports: ["MCO"], weight: 2 },
  { city: "Houston", query: "Houston, TX", airports: ["IAH", "HOU"], weight: 2 },
  { city: "San Francisco", query: "San Francisco, CA", airports: ["SFO", "OAK", "SJC"], weight: 2 },
  { city: "Seattle", query: "Seattle, WA", airports: ["SEA"], weight: 2 },
  { city: "Phoenix", query: "Phoenix, AZ", airports: ["PHX"], weight: 2 },
  { city: "Boston", query: "Boston, MA", airports: ["BOS"], weight: 2 },
  { city: "Washington", query: "Washington, DC", airports: ["DCA", "IAD", "BWI"], weight: 2 },
  { city: "Detroit", query: "Detroit, MI", airports: ["DTW"], weight: 2 },
  { city: "Minneapolis", query: "Minneapolis, MN", airports: ["MSP"], weight: 2 },
  { city: "Charlotte", query: "Charlotte, NC", airports: ["CLT"], weight: 2 },
  { city: "Salt Lake City", query: "Salt Lake City, UT", airports: ["SLC"], weight: 2 },
  { city: "Nashville", query: "Nashville, TN", airports: ["BNA"], weight: 2 },
  { city: "Philadelphia", query: "Philadelphia, PA", airports: ["PHL"], weight: 1 },
  { city: "Austin", query: "Austin, TX", airports: ["AUS"], weight: 1 },
  { city: "San Diego", query: "San Diego, CA", airports: ["SAN"], weight: 1 },
  { city: "Tampa", query: "Tampa, FL", airports: ["TPA"], weight: 1 },
  { city: "Kansas City", query: "Kansas City, MO", airports: ["MCI"], weight: 1 },
  { city: "St. Louis", query: "St. Louis, MO", airports: ["STL"], weight: 1 },
  { city: "Milwaukee", query: "Milwaukee, WI", airports: ["MKE"], weight: 1 },
  { city: "Portland", query: "Portland, OR", airports: ["PDX"], weight: 1 },
  { city: "Toronto", query: "Toronto, ON", airports: ["YYZ", "YTZ"], weight: 2 },
  { city: "Montreal", query: "Montreal, QC", airports: ["YUL"], weight: 2 },
  { city: "Vancouver", query: "Vancouver, BC", airports: ["YVR"], weight: 2 },
  { city: "Calgary", query: "Calgary, AB", airports: ["YYC"], weight: 1 },
  { city: "Ottawa", query: "Ottawa, ON", airports: ["YOW"], weight: 1 },
  // Border airports: often far cheaper than flying out of Canada.
  { city: "Buffalo", query: "Buffalo, NY", airports: ["BUF"], weight: 2 },
  { city: "Bellingham", query: "Bellingham, WA", airports: ["BLI"], weight: 1 },
  { city: "Burlington", query: "Burlington, VT", airports: ["BTV"], weight: 1 },
  { city: "Plattsburgh", query: "Plattsburgh, NY", airports: ["PBG"], weight: 1 },
];
