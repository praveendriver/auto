export type TrafficStyle = 'calm' | 'normal' | 'monsoon' | 'rush' | 'wedding';
export type Environment = 'day' | 'monsoon' | 'night';

export type Shift = {
  id: number;
  name: string;
  objective: string;
  drops: number;
  traffic: TrafficStyle;
  environment: Environment;
  trafficLabel: string;
  reward: number;
};

export const SHIFTS: Shift[] = [
  { id: 1, name: 'First Fare', objective: 'Drop off 1 passenger', drops: 1, traffic: 'calm', environment: 'day', trafficLabel: 'Easy traffic · learn the stops', reward: 100 },
  { id: 2, name: 'Two Stops', objective: 'Drop off 2 passengers', drops: 2, traffic: 'normal', environment: 'day', trafficLabel: 'A regular Bengaluru shift', reward: 150 },
  { id: 3, name: 'Monsoon Meter', objective: 'Drop off 2 passengers', drops: 2, traffic: 'monsoon', environment: 'monsoon', trafficLabel: 'Rain, lightning, puddles · busy roads', reward: 200 },
  { id: 4, name: 'Night Rush', objective: 'Drop off 3 passengers', drops: 3, traffic: 'rush', environment: 'night', trafficLabel: 'Headlights on · faster traffic', reward: 250 },
  { id: 5, name: 'Wedding Detour', objective: 'Drop off 3 passengers', drops: 3, traffic: 'wedding', environment: 'night', trafficLabel: 'Night wedding · baraats block lanes', reward: 300 },
];

export const CAREER_TRAIL = [
  { name: 'Namma Driver', target: 5, reward: 200 },
  { name: 'Meter Master', target: 12, reward: 500 },
  { name: 'City Legend', target: 25, reward: 1000 },
];

export type ShiftProgress = {
  unlocked: number;
  completed: number[];
  cash: number;
  deliveries: number;
  trailStage: number;
};

const KEY = 'riksha_shift_progress_v1';
const EMPTY: ShiftProgress = { unlocked: 1, completed: [], cash: 0, deliveries: 0, trailStage: 0 };

export function readShiftProgress(): ShiftProgress {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ShiftProgress>;
    return {
      unlocked: Math.max(1, Math.min(SHIFTS.length, Math.floor(saved.unlocked ?? 1))),
      completed: Array.isArray(saved.completed) ? saved.completed.filter((id) => Number.isInteger(id) && id >= 1 && id <= SHIFTS.length) : [],
      cash: Math.max(0, Math.floor(saved.cash ?? 0)),
      deliveries: Math.max(0, Math.floor(saved.deliveries ?? 0)),
      trailStage: Math.max(0, Math.min(CAREER_TRAIL.length, Math.floor(saved.trailStage ?? 0))),
    };
  } catch {
    return { ...EMPTY, completed: [] };
  }
}

export function getShift(id: number): Shift {
  return SHIFTS[Math.max(0, Math.min(SHIFTS.length - 1, id - 1))];
}

export function getCareerTrail(progress: ShiftProgress) {
  const rank = progress.trailStage > 0 ? CAREER_TRAIL[progress.trailStage - 1].name : 'New Driver';
  return { rank, next: CAREER_TRAIL[progress.trailStage] ?? null };
}

/** Bank each run's fare; finishing the job unlocks the next shift. */
export function settleShift(id: number, fare: number, completed: boolean, dropped: number) {
  const progress = readShiftProgress();
  progress.cash += Math.max(0, Math.floor(fare)) + (completed ? getShift(id).reward : 0);
  progress.deliveries += Math.max(0, Math.floor(dropped));
  const trailRewards: { name: string; reward: number }[] = [];
  while (progress.trailStage < CAREER_TRAIL.length) {
    const milestone = CAREER_TRAIL[progress.trailStage];
    if (progress.deliveries < milestone.target) break;
    trailRewards.push(milestone);
    progress.cash += milestone.reward;
    progress.trailStage++;
  }
  if (completed && !progress.completed.includes(id)) progress.completed.push(id);
  if (completed && id < SHIFTS.length) progress.unlocked = Math.max(progress.unlocked, id + 1);
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // The run still completes if storage is unavailable.
  }
  return { progress, trailRewards };
}
