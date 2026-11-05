export type TrafficStyle = 'calm' | 'normal' | 'monsoon' | 'rush' | 'wedding';

export type Shift = {
  id: number;
  name: string;
  objective: string;
  drops: number;
  traffic: TrafficStyle;
  trafficLabel: string;
  reward: number;
};

export const SHIFTS: Shift[] = [
  { id: 1, name: 'First Fare', objective: 'Drop off 1 passenger', drops: 1, traffic: 'calm', trafficLabel: 'Easy traffic · learn the stops', reward: 100 },
  { id: 2, name: 'Two Stops', objective: 'Drop off 2 passengers', drops: 2, traffic: 'normal', trafficLabel: 'A regular Bengaluru shift', reward: 150 },
  { id: 3, name: 'Monsoon Meter', objective: 'Drop off 2 passengers', drops: 2, traffic: 'monsoon', trafficLabel: 'Rain puddles across the road', reward: 200 },
  { id: 4, name: 'Rush Hour', objective: 'Drop off 3 passengers', drops: 3, traffic: 'rush', trafficLabel: 'More buses and scooters', reward: 250 },
  { id: 5, name: 'Wedding Detour', objective: 'Drop off 3 passengers', drops: 3, traffic: 'wedding', trafficLabel: 'Baraats block two lanes', reward: 300 },
];

export type ShiftProgress = {
  unlocked: number;
  completed: number[];
  cash: number;
};

const KEY = 'riksha_shift_progress_v1';
const EMPTY: ShiftProgress = { unlocked: 1, completed: [], cash: 0 };

export function readShiftProgress(): ShiftProgress {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ShiftProgress>;
    return {
      unlocked: Math.max(1, Math.min(SHIFTS.length, Math.floor(saved.unlocked ?? 1))),
      completed: Array.isArray(saved.completed) ? saved.completed.filter((id) => Number.isInteger(id) && id >= 1 && id <= SHIFTS.length) : [],
      cash: Math.max(0, Math.floor(saved.cash ?? 0)),
    };
  } catch {
    return { ...EMPTY, completed: [] };
  }
}

export function getShift(id: number): Shift {
  return SHIFTS[Math.max(0, Math.min(SHIFTS.length - 1, id - 1))];
}

/** Bank each run's fare; finishing the job also unlocks the next shift. */
export function settleShift(id: number, fare: number, completed: boolean): ShiftProgress {
  const progress = readShiftProgress();
  progress.cash += Math.max(0, Math.floor(fare)) + (completed ? getShift(id).reward : 0);
  if (completed && !progress.completed.includes(id)) progress.completed.push(id);
  if (completed && id < SHIFTS.length) progress.unlocked = Math.max(progress.unlocked, id + 1);
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // The run still completes if storage is unavailable.
  }
  return progress;
}
