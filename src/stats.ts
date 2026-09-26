import type { RunStats } from './scenes/Game';
import { installId } from './analytics';

/**
 * Lifetime stats on this device. This is the instrumentation for the
 * strangers test: there is no server, so the player sends it to you
 * themselves — over WhatsApp, which is where they already are.
 */

const KEY = 'auto_stats';

export type Lifetime = {
  runs: number;
  seconds: number;
  bestFare: number;
  totalFare: number;
  carried: number;
  dropped: number;
  missions: number;
  routesDone: number;
  firstPlayed: string;
};

const EMPTY: Lifetime = {
  runs: 0, seconds: 0, bestFare: 0, totalFare: 0, carried: 0, dropped: 0, missions: 0, routesDone: 0,
  firstPlayed: '',
};

export function readStats(): Lifetime {
  try {
    return { ...EMPTY, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Lifetime>) };
  } catch {
    return { ...EMPTY };
  }
}

export function recordRun(run: RunStats): Lifetime {
  const s = readStats();
  const next: Lifetime = {
    runs: s.runs + 1,
    seconds: s.seconds + Math.round(run.seconds),
    bestFare: Math.max(s.bestFare, Math.floor(run.fare)),
    totalFare: s.totalFare + Math.floor(run.fare),
    carried: s.carried + run.carried,
    dropped: s.dropped + run.dropped,
    missions: s.missions + run.missionsDone.length,
    routesDone: s.routesDone + (run.route.done ? 1 : 0),
    firstPlayed: s.firstPlayed || new Date().toISOString().slice(0, 10),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked — stats just won't persist
  }
  return next;
}

/** A one-screen summary a tester can paste back to you. */
export function summary(s: Lifetime): string {
  const mins = Math.round(s.seconds / 60);
  return [
    '🛺 Auto — my stats',
    `${s.runs} runs · ${mins} min played · since ${s.firstPlayed}`,
    `best ₹${s.bestFare} · ₹${s.totalFare} total`,
    `${s.carried} picked up · ${s.dropped} dropped · ${s.missions} missions · ${s.routesDone} roads finished`,
    `device: ${/Android/i.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/i.test(navigator.userAgent) ? 'iOS' : 'other'} · ${screen.width}×${screen.height}`,
    `id: ${installId().slice(0, 8)}`,
  ].join('\n');
}
