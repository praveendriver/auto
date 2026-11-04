import mgRoad from './mg-road.json';

/**
 * A real road, pre-baked by scripts/extract_road.py from OpenStreetMap.
 * Nothing here is fetched at runtime.
 */
export type Route = {
  slug: string;
  title: string;
  city: string;
  lengthM: number;
  /** Metres between sway samples. */
  stepM: number;
  /** Normalised curvature, -1..1, one per stepM. The road leans this way. */
  sway: number[];
  landmarks: { label: string; atM: number }[];
  attribution: string;
};

export const ROUTES: Record<string, Route> = {
  [mgRoad.slug]: mgRoad,
};

export const DEFAULT_ROUTE = mgRoad.slug;

/** `?route=slug` picks one; anything unknown falls back to the default. */
export function pickRoute(): Route {
  const slug = new URLSearchParams(location.search).get('route') ?? DEFAULT_ROUTE;
  return ROUTES[slug] ?? ROUTES[DEFAULT_ROUTE];
}

/** Sway at a distance along the route, 0 once you've driven off the end. */
export function swayAt(route: Route, metres: number): number {
  if (metres < 0 || metres >= route.lengthM) return 0;
  const i = metres / route.stepM;
  const a = route.sway[Math.floor(i)] ?? 0;
  const b = route.sway[Math.ceil(i)] ?? a;
  return a + (b - a) * (i - Math.floor(i));
}
