/**
 * Every number that affects how the game feels lives here. Tune this file,
 * not the scene — the point of the prototype is to find the values that make
 * "how many can I fit" fun, and that is much faster when they are in one place.
 */

/* ---------- canvas (portrait phone, scaled to fit) ---------- */
export const W = 360;
export const H = 640;

/* ---------- road geometry ---------- */
export const LANES = 3;
export const ROAD_LEFT = 60;
export const ROAD_RIGHT = 300;
export const LANE_W = (ROAD_RIGHT - ROAD_LEFT) / LANES;
export const laneX = (lane: number) => ROAD_LEFT + LANE_W * (lane + 0.5);

/* ---------- the auto ---------- */
export const AUTO_Y = 520;
export const AUTO_W = 40;
export const AUTO_H = 56;

/* ---------- speed ---------- */
export const SPEED_START = 220; // px/s of road scroll at t=0
/**
 * The ceiling is deliberately out of reach. A runner has to outrun the player
 * eventually — a cap you can master turns every later run into the same run.
 * The quadratic term is what makes the late game "get away from you".
 */
export const SPEED_MAX = 900;
export const SPEED_RAMP = 3.2; // px/s gained per second of survival
export const SPEED_RAMP2 = 0.02; // px/s per second², kicks in after ~40s
export const BRAKE_FACTOR = 0.45; // speed multiplier while holding

/* ---------- passengers & fare ---------- */
export const MAX_PAX = 6;
/** ₹ earned per px of road per passenger aboard. 100px with 1 pax ≈ ₹2. */
export const FARE_PER_PX = 0.02;
export const CHALLAN = 50; // ₹ the cop takes

/**
 * Handling. Lane changes get slower and the auto wobbles more the fuller it is.
 * This is the entire risk/reward: more people = more fare = worse handling.
 */
export const LANE_TWEEN_BASE = 110; // ms for an empty auto
export const LANE_TWEEN_PER_PAX = 38; // ms added per passenger
export const WOBBLE_PER_PAX = 1.4; // degrees of tilt per passenger on a lane change

/* ---------- spawning ---------- */
export const GRACE_MS = 1800; // no obstacles at the very start
export const SPAWN_START = 950; // ms between obstacles at t=0
export const SPAWN_MIN = 380; // floor as the game speeds up
export const SPAWN_RAMP_S = 75; // seconds to go from START to MIN
export const PAX_SPAWN_MIN = 1300;
export const PAX_SPAWN_MAX = 2400;

/**
 * Relative weights, and the distance at which each hazard first appears.
 * Gating by distance is the reward for getting good: the further you drive,
 * the more of the road you've seen. Passengers spawn on their own cadence.
 */
export const OBSTACLES = {
  cow: { weight: 24, unlockKm: 0 },
  bus: { weight: 14, unlockKm: 0 },
  scooter: { weight: 16, unlockKm: 0 },
  pothole: { weight: 20, unlockKm: 0 },
  breaker: { weight: 12, unlockKm: 0 },
  cop: { weight: 10, unlockKm: 0 },
  /** Two lanes of slow-moving wedding procession. Get to the free lane early. */
  baraat: { weight: 9, unlockKm: 0.5 },
  /** Monsoon puddle across two lanes. Not a crash — but slow, and it soaks your riders. */
  water: { weight: 14, unlockKm: 0.25 },
  /** Wrong-side truck. Wide and fast. */
  truck: { weight: 8, unlockKm: 1.0 },
} as const;

/* ---------- combo ---------- */
/** Consecutive clean drops multiply the tip. Broken by a miss or a bump. */
export const COMBO_STEP = 0.35; // ×1.35, ×1.7, ×2.05 ...
export const COMBO_MAX = 3.0;

/* ---------- missions ---------- */
export const MISSIONS_PER_RUN = 3;
export const MISSION_REWARD = 60; // ₹ added to the run's fare per completed mission

/* ---------- drop-offs ---------- */
/**
 * Every rider boards with a destination some distance ahead. A stop marker
 * appears on the kerb when it's close; be in that lane when you reach it.
 * Miss it and they stay aboard, angry — still weighing you down, no longer
 * paying — and ask again a bit further on. That's the whole reason to bother
 * dropping anyone rather than hoarding six fares forever.
 */
export const DROP_MIN_PX = 1400; // shortest ride (10px = 1m, so 140m)
export const DROP_MAX_PX = 3800;
export const STOP_H = 44;
export const MISS_RETRY_PX = 900;

/** Tip on a clean drop. Halved if they were jostled by a pothole or breaker. */
export const TIP_BASE = 15;
export const TIP_PER_KM = 90;

/* ---------- real roads ---------- */
/** How far the road leans at the route's sharpest bend, in px. Cosmetic. */
export const SWAY_PX = 44;
/** ₹ for driving a route end to end. */
export const ROUTE_BONUS = 200;
/** Landmark sign height, for spawn geometry. */
export const LANDMARK_H = 40;
