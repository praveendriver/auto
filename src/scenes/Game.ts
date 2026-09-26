import Phaser from 'phaser';
import * as C from '../config';
import { Controls, type SwipeDir } from '../input';
import { sfx } from '../audio';
import { pickRoute, swayAt, type Route } from '../routes';
import { buildTextures, SCENERY } from '../art';
import { track } from '../analytics';

type Kind = keyof typeof C.OBSTACLES;

/** Everything on the road that isn't a passenger. */
type Obstacle = {
  kind: Kind;
  node: Phaser.GameObjects.Container;
  w: number;
  h: number;
  /** Extra downward speed on top of the road scroll (scooters come at you). */
  vy: number;
  /** Lateral drift in px/s (buses wander). */
  drift: number;
  /** Already resolved — potholes and cops fire once. */
  hit: boolean;
};

type Passenger = {
  node: Phaser.GameObjects.Container;
  /** Which edge lane you must be in to pick them up. */
  lane: 0 | 2;
  w: number;
  h: number;
};

/** Someone aboard. The seat is the resource; the stop is the obligation. */
type Rider = {
  name: string;
  dest: string;
  /** Road distance (stats.distPx) when they got in — the tip scales with the ride. */
  boardedAt: number;
  /** Road distance at which their stop arrives. */
  dropAt: number;
  side: 0 | 2;
  /** Missed their stop. Still takes a seat and weighs you down; no longer pays. */
  angry: boolean;
  /** Jostled by a pothole or breaker. Halves the tip. */
  bumped: boolean;
  stop?: Stop;
};

type Stop = {
  rider: Rider;
  node: Phaser.GameObjects.Container;
  mark: Phaser.GameObjects.Rectangle;
  lane: 0 | 2;
};

/** Flavour only, but it's what makes a fare feel like a person. */
const RIDERS: { name: string; dest: string; far: number }[] = [
  { name: 'Aunty', dest: 'TEMPLE', far: 0.4 },
  { name: 'Uncle', dest: 'STATION', far: 1.0 },
  { name: 'Student', dest: 'COLLEGE', far: 0.7 },
  { name: 'Bhaiya', dest: 'MARKET', far: 0.3 },
  { name: 'Madam', dest: 'OFFICE', far: 0.8 },
  { name: 'Kids', dest: 'SCHOOL', far: 0.5 },
  { name: 'Dadaji', dest: 'HOSPITAL', far: 0.9 },
  { name: 'Chacha', dest: 'CHAI', far: 0.15 },
];

/** Placeholder art. Every visual is a rectangle with a label — deliberately. */
const LOOK: Record<Kind, { w: number; h: number; color: number; label: string; crash: boolean }> = {
  cow: { w: 44, h: 40, color: 0xf2e9d8, label: 'COW', crash: true },
  bus: { w: 62, h: 124, color: 0xc0392b, label: 'BUS', crash: true },
  scooter: { w: 26, h: 42, color: 0x3498db, label: 'SCTR', crash: true },
  pothole: { w: 36, h: 26, color: 0x0b0b0b, label: '', crash: false },
  breaker: { w: C.ROAD_RIGHT - C.ROAD_LEFT, h: 12, color: 0xf1c40f, label: '', crash: false },
  cop: { w: 28, h: 42, color: 0xecf0f1, label: 'COP', crash: false },
  baraat: { w: C.LANE_W * 2 - 10, h: 96, color: 0xd63384, label: 'BARAAT', crash: true },
  water: { w: C.LANE_W * 2 - 6, h: 70, color: 0x2471a3, label: '', crash: false },
  truck: { w: 52, h: 92, color: 0x7f8c8d, label: 'TRUCK', crash: true },
};

/** Hazards two lanes wide. Placed on a lane boundary and block both. */
const WIDE: ReadonlySet<Kind> = new Set<Kind>(['baraat', 'water']);

/* ------------------------------------------------------------ missions */

type Mission = {
  id: string;
  text: string;
  check: (st: RunStats, pax: number, combo: number) => boolean;
  done: boolean;
};

/**
 * Each run offers three of these. They're what stops "getting good" from
 * meaning "every run is the same": a run where you're trying to carry six
 * plays nothing like one where you're chasing five clean drops.
 */
const MISSION_POOL: Omit<Mission, 'done'>[] = [
  { id: 'carry6', text: 'Carry 6 at once', check: (st) => st.maxAboard >= 6 },
  { id: 'carry4', text: 'Carry 4 at once', check: (st) => st.maxAboard >= 4 },
  { id: 'drop3', text: 'Drop 3 riders', check: (st) => st.dropped >= 3 },
  { id: 'drop6', text: 'Drop 6 riders', check: (st) => st.dropped >= 6 },
  { id: 'combo3', text: '3 clean drops in a row', check: (st) => st.maxCombo >= 3 },
  { id: 'combo5', text: '5 clean drops in a row', check: (st) => st.maxCombo >= 5 },
  { id: 'cows8', text: 'Dodge 8 cows', check: (st) => st.cowsDodged >= 8 },
  { id: 'cows15', text: 'Dodge 15 cows', check: (st) => st.cowsDodged >= 15 },
  { id: 'km1', text: 'Drive 1 km', check: (st) => st.distPx >= 10000 },
  { id: 'km2', text: 'Drive 2 km', check: (st) => st.distPx >= 20000 },
  { id: 'fare300', text: 'Earn ₹300', check: (st) => st.fare >= 300 },
  { id: 'fare600', text: 'Earn ₹600', check: (st) => st.fare >= 600 },
  { id: 'tips100', text: '₹100 in tips', check: (st) => st.tips >= 100 },
  { id: 'live45', text: 'Survive 45 seconds', check: (st) => st.seconds >= 45 },
  { id: 'live90', text: 'Survive 90 seconds', check: (st) => st.seconds >= 90 },
];

const MISSIONS_KEY = 'auto_missions_done';

function missionsDone(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(MISSIONS_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function markMissionDone(id: string) {
  try {
    const done = missionsDone();
    done.add(id);
    localStorage.setItem(MISSIONS_KEY, JSON.stringify([...done]));
  } catch {
    // storage blocked — the run still pays out, it just won't remember
  }
}

/** Three not-yet-completed missions; once the pool is exhausted it cycles. */
function pickMissions(): Mission[] {
  let done = missionsDone();
  let pool = MISSION_POOL.filter((m) => !done.has(m.id));
  if (pool.length < C.MISSIONS_PER_RUN) {
    try {
      localStorage.removeItem(MISSIONS_KEY);
    } catch {
      // ignore
    }
    pool = [...MISSION_POOL];
  }
  return Phaser.Utils.Array.Shuffle([...pool])
    .slice(0, C.MISSIONS_PER_RUN)
    .map((m) => ({ ...m, done: false }));
}

function freshStats(): RunStats {
  return {
    fare: 0, distPx: 0, carried: 0, maxAboard: 0, cowsDodged: 0, dropped: 0, tips: 0,
    maxCombo: 0, seconds: 0, missionsDone: [], missions: [],
    route: { slug: '', title: '', city: '', lengthM: 0, done: false },
  };
}

export type RunStats = {
  fare: number;
  distPx: number;
  carried: number;
  maxAboard: number;
  cowsDodged: number;
  dropped: number;
  tips: number;
  maxCombo: number;
  seconds: number;
  /** Ids of missions completed this run. */
  missionsDone: string[];
  /** The three missions offered this run, for the crash screen. */
  missions: { id: string; text: string; done: boolean }[];
  route: { slug: string; title: string; city: string; lengthM: number; done: boolean };
};

export class Game extends Phaser.Scene {
  private controls!: Controls;
  private auto!: Phaser.GameObjects.Container;
  private autoPaxText!: Phaser.GameObjects.Text;
  private laneTween?: Phaser.Tweens.Tween;

  private lane = 1;
  private riders: Rider[] = [];
  private stops: Stop[] = [];
  private alive = true;
  private elapsed = 0;
  private speed = C.SPEED_START;

  private stats: RunStats = freshStats();
  private combo = 0;
  private wet = false;
  private seen = new Set<Kind>();
  private missions: Mission[] = [];
  private route!: Route;
  /** Current horizontal lean of the world, in px. Eased toward the route's curvature. */
  private swayX = 0;
  private landmarkSigns: { node: Phaser.GameObjects.Container; label: string; passed: boolean }[] = [];
  private landmarksSpawned = new Set<string>();
  private hudRoute!: Phaser.GameObjects.Text;

  private get pax(): number {
    return this.riders.length;
  }

  private obstacles: Obstacle[] = [];
  private passengers: Passenger[] = [];
  private ground: Phaser.GameObjects.TileSprite[] = [];
  private scenery: Phaser.GameObjects.Image[] = [];
  private nextSceneryAt = 0;

  private nextObstacleAt = 0;
  private nextPaxAt = 0;

  private hudFare!: Phaser.GameObjects.Text;
  private hudDist!: Phaser.GameObjects.Text;
  private hudPax!: Phaser.GameObjects.Text;
  private hudNext!: Phaser.GameObjects.Text;
  private hudMissions!: Phaser.GameObjects.Text;
  /** Bottom strip: one slot per seat showing who's aboard and their mood. */
  private seats: { bg: Phaser.GameObjects.Rectangle; dest: Phaser.GameObjects.Text; face: Phaser.GameObjects.Text }[] = [];
  /** Heads poking out of the auto itself, so mood is visible where you're looking. */
  private heads: { dot: Phaser.GameObjects.Arc; mark: Phaser.GameObjects.Text }[] = [];
  private lastTickFare = 0;
  private muteBtn!: Phaser.GameObjects.Text;
  private hudBrake!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private everBoarded = false;

  constructor() {
    super('Game');
  }

  create() {
    this.lane = 1;
    this.riders = [];
    this.stops = [];
    this.alive = true;
    this.elapsed = 0;
    this.speed = C.SPEED_START;
    this.stats = freshStats();
    this.combo = 0;
    this.wet = false;
    this.seen = new Set(['cow', 'bus', 'scooter', 'pothole', 'breaker', 'cop']);
    this.missions = pickMissions();
    this.stats.missions = this.missions.map((m) => ({ id: m.id, text: m.text, done: false }));
    this.route = pickRoute();
    this.stats.route = { slug: this.route.slug, title: this.route.title, city: this.route.city, lengthM: this.route.lengthM, done: false };
    this.swayX = 0;
    this.landmarkSigns = [];
    this.landmarksSpawned = new Set();
    this.cameras.main.scrollX = 0;
    this.obstacles = [];
    this.passengers = [];
    this.ground = [];
    this.scenery = [];
    this.nextSceneryAt = 0;
    this.everBoarded = false;
    buildTextures(this);

    this.drawRoad();
    this.drawAuto();
    this.drawHud();

    this.controls = new Controls(this, (dir) => this.changeLane(dir));

    // Browsers gate audio behind a gesture. The first tap or key of the run
    // unlocks it; every later call is a no-op.
    this.input.once('pointerdown', () => sfx.unlock());
    this.input.keyboard?.once('keydown', () => sfx.unlock());
    this.lastTickFare = 0;

    this.nextObstacleAt = C.GRACE_MS;
    this.nextPaxAt = 900;

    this.events.once('shutdown', () => this.controls.destroy());
  }

  /* ------------------------------------------------------------ drawing */

  private drawRoad() {
    // Tile-scrolled ground. Verges extend well past the canvas so the camera
    // lean into bends reveals dirt, not black.
    const roadW = C.ROAD_RIGHT - C.ROAD_LEFT;
    const vergeW = 260;
    this.ground = [
      this.add.tileSprite(C.ROAD_LEFT - vergeW / 2, C.H / 2, vergeW, C.H, 'verge').setDepth(0),
      this.add.tileSprite(C.ROAD_RIGHT + vergeW / 2, C.H / 2, vergeW, C.H, 'verge').setDepth(0),
      this.add.tileSprite((C.ROAD_LEFT + C.ROAD_RIGHT) / 2, C.H / 2, roadW, C.H, 'road').setDepth(0),
    ];
    this.ground[1].tilePositionX = 100;
  }

  /** Trees, shops, lampposts and chai stalls, scattered along both verges. */
  private spawnScenery() {
    if (this.stats.distPx < this.nextSceneryAt) return;
    this.nextSceneryAt = this.stats.distPx + Phaser.Math.Between(55, 150);

    const total = SCENERY.reduce((a, b) => a + b.weight, 0);
    let r = Math.random() * total;
    let pick = SCENERY[0];
    for (const sc of SCENERY) {
      r -= sc.weight;
      if (r <= 0) { pick = sc; break; }
    }
    const side = Math.random() < 0.5 ? -1 : 1;
    const base = side < 0 ? C.ROAD_LEFT : C.ROAD_RIGHT;
    const x = base + side * (pick.sideOffset + Phaser.Math.Between(0, 40));
    const img = this.add.image(x, -60, pick.key).setDepth(2);
    if (side > 0 && (pick.key === 'shop' || pick.key === 'shop2')) img.setFlipY(true);
    this.scenery.push(img);
  }

  private scrollScenery(move: number) {
    for (let i = this.scenery.length - 1; i >= 0; i--) {
      const img = this.scenery[i];
      img.y += move;
      if (img.y > C.H + 60) {
        img.destroy();
        this.scenery.splice(i, 1);
      }
    }
  }


  private drawAuto() {
    const body = this.add.image(0, 0, 'auto');
    this.autoPaxText = this.add
      .text(0, 23, '0', { fontFamily: 'monospace', fontSize: '10px', color: '#f5c518', fontStyle: 'bold' })
      .setOrigin(0.5);

    // Six heads in a 2×3 grid on the canopy. Hidden until someone's aboard;
    // red with a "!!" when they're angry.
    this.heads = [];
    const headParts: Phaser.GameObjects.GameObject[] = [];
    for (let i = 0; i < C.MAX_PAX; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = -7 + col * 14;
      const y = -4 + row * 10;
      const dot = this.add.circle(x, y, 4, 0xf5cba7).setStrokeStyle(1, 0x1c1c1e, 0.8).setVisible(false);
      const mark = this.add
        .text(x, y - 11, '!!', { fontFamily: 'monospace', fontSize: '9px', color: '#e74c3c', fontStyle: 'bold', stroke: '#000', strokeThickness: 2 })
        .setOrigin(0.5)
        .setVisible(false);
      this.heads.push({ dot, mark });
      headParts.push(dot, mark);
    }

    this.auto = this.add.container(C.laneX(this.lane), C.AUTO_Y, [body, ...headParts, this.autoPaxText]);
    this.auto.setDepth(10);
  }


  private drawHud() {
    const style = { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff', fontStyle: 'bold' };
    // Translucent bars so the HUD reads over scenery.
    this.add.rectangle(C.W / 2, 27, C.W, 54, 0x000000, 0.42).setDepth(19).setScrollFactor(0);
    this.add.rectangle(C.W / 2, C.H - 30, C.W, 60, 0x000000, 0.42).setDepth(19).setScrollFactor(0);
    this.hudFare = this.add.text(12, 10, '₹0', style).setDepth(20).setScrollFactor(0);
    this.hudDist = this.add.text(C.W - 12, 10, '0.00 km', style).setOrigin(1, 0).setDepth(20).setScrollFactor(0);
    this.hudMissions = this.add
      .text(C.W - 12, 32, '', { ...style, fontSize: '10px', color: '#f1c40f' })
      .setOrigin(1, 0)
      .setDepth(20)
      .setScrollFactor(0);

    // Route header: which real road, how far along.
    this.hudRoute = this.add
      .text(12, 32, '', { ...style, fontSize: '10px', color: '#bdbdbd' })
      .setDepth(20)
      .setScrollFactor(0);

    // This run's three missions, shown for a few seconds and then out of the way.
    const lines = this.missions.map((m) => `○ ${m.text}`).join('\n');
    const panel = this.add
      .text(C.W / 2, 150, `TODAY'S MISSIONS\n${lines}`, {
        ...style, fontSize: '12px', color: '#f1c40f', align: 'center', lineSpacing: 5,
        backgroundColor: '#111111cc', padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(25)
      .setScrollFactor(0);
    this.tweens.add({ targets: panel, alpha: 0, delay: 4200, duration: 600, onComplete: () => panel.destroy() });
    this.hudPax = this.add
      .text(C.W / 2, C.H - 48, `0 / ${C.MAX_PAX} · meter OFF`, { ...style, fontSize: '12px', color: '#7f8c8d' })
      .setOrigin(0.5)
      .setDepth(20)
      .setScrollFactor(0);

    // One slot per seat along the bottom: destination on top, a face below.
    // Orange and ":)" while riding; red and ">:(" once they've missed a stop.
    this.seats = [];
    const slotW = 54;
    const startX = C.W / 2 - ((C.MAX_PAX - 1) * (slotW + 3)) / 2;
    for (let i = 0; i < C.MAX_PAX; i++) {
      const x = startX + i * (slotW + 3);
      const y = C.H - 22;
      const bg = this.add.rectangle(x, y, slotW, 30, 0x2a2a2a).setStrokeStyle(1, 0x000000, 0.6).setDepth(20).setScrollFactor(0);
      const dest = this.add
        .text(x, y - 7, '', { fontFamily: 'monospace', fontSize: '8px', color: '#111', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(21)
        .setScrollFactor(0);
      const face = this.add
        .text(x, y + 7, '', { fontFamily: 'monospace', fontSize: '11px', color: '#111', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(21)
        .setScrollFactor(0);
      this.seats.push({ bg, dest, face });
    }

    this.muteBtn = this.add
      .text(C.W / 2 - 34, 12, sfx.muted ? 'SOUND OFF' : 'SOUND ON', { ...style, fontSize: '10px', color: '#7f8c8d' })
      .setOrigin(0.5, 0)
      .setDepth(20)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    this.muteBtn.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      sfx.unlock();
      const muted = sfx.toggleMute();
      this.muteBtn.setText(muted ? 'SOUND OFF' : 'SOUND ON');
      track('sound_toggle', { on: !muted });
    });

    const musicBtn = this.add
      .text(C.W / 2 + 34, 12, sfx.musicOn ? 'MUSIC ON' : 'MUSIC OFF', { ...style, fontSize: '10px', color: '#7f8c8d' })
      .setOrigin(0.5, 0)
      .setDepth(20)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    musicBtn.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      sfx.unlock();
      const on = sfx.toggleMusic();
      musicBtn.setText(on ? 'MUSIC ON' : 'MUSIC OFF');
      track('music_toggle', { on });
    });

    // Where the next stop is. Shares the hint's row; the hint is gone by the
    // time anyone is aboard.
    this.hudNext = this.add
      .text(C.W / 2, 62, '', { ...style, fontSize: '12px', color: '#2ecc71' })
      .setOrigin(0.5)
      .setDepth(20)
      .setScrollFactor(0);
    this.hudBrake = this.add
      .text(C.W / 2, C.H - 66, 'BRAKE', { ...style, fontSize: '13px', color: '#f1c40f' })
      .setOrigin(0.5)
      .setDepth(20)
      .setScrollFactor(0)
      .setVisible(false);

    // Two lines of onboarding that never block play. Controls fade on their
    // own; the meter hint stays until the first pickup, because that was the
    // thing nobody found.
    const controls = this.add
      .text(C.W / 2, C.AUTO_Y - 84, 'swipe ← → to steer · hold to brake', { ...style, fontSize: '12px', color: '#bdbdbd' })
      .setOrigin(0.5)
      .setDepth(20)
      .setScrollFactor(0);
    this.tweens.add({ targets: controls, alpha: 0, delay: 3500, duration: 600, onComplete: () => controls.destroy() });

    this.hint = this.add
      .text(C.W / 2, 62, 'meter is off — pick up someone waving AUTO!', {
        ...style, fontSize: '12px', color: '#111', backgroundColor: '#f1c40f', padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setScrollFactor(0)
      .setVisible(false);
  }

  /* ------------------------------------------------------------ loop */

  update(time: number, delta: number) {
    if (!this.alive) return;
    const dt = delta / 1000;
    this.elapsed += delta;

    const t = this.elapsed / 1000;
    this.speed = Math.min(C.SPEED_MAX, C.SPEED_START + t * C.SPEED_RAMP + t * t * C.SPEED_RAMP2);
    this.stats.seconds = t;
    const braking = this.controls.braking;
    const move = this.speed * (braking ? C.BRAKE_FACTOR : 1) * (this.wet ? 0.6 : 1) * dt;
    this.wet = false;
    this.hudBrake.setVisible(braking);
    if (!this.everBoarded && this.elapsed > 4000) this.hint.setVisible(true);

    const speedRatio = (this.speed - C.SPEED_START) / (C.SPEED_MAX - C.SPEED_START);
    sfx.setEngine(speedRatio, braking, true);

    this.stats.distPx += move;
    // Angry riders have stopped paying. They still take a seat.
    this.stats.fare += move * C.FARE_PER_PX * this.riders.filter((r) => !r.angry).length;
    // A quiet tick every ₹10 earned — you can hear the meter running.
    if (Math.floor(this.stats.fare / 10) > Math.floor(this.lastTickFare / 10)) sfx.tick();
    this.lastTickFare = this.stats.fare;

    this.scrollDashes(move);
    this.spawnScenery();
    this.scrollScenery(move);
    this.scrollObstacles(move, dt);
    this.scrollPassengers(move);
    this.scrollStops(move);
    this.spawnStops();
    this.followRoute(move);
    this.resolveCollisions(braking);
    this.spawn(time);
    this.checkMissions();
    this.updateHud();
  }

  private scrollDashes(move: number) {
    // Decreasing the tile offset moves the texture down the screen — toward you.
    for (const t of this.ground) t.tilePositionY -= move;
  }

  private scrollObstacles(move: number, dt: number) {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.node.y += move + o.vy * dt;
      if (o.drift) {
        o.node.x = Phaser.Math.Clamp(
          o.node.x + o.drift * dt,
          C.ROAD_LEFT + o.w / 2,
          C.ROAD_RIGHT - o.w / 2,
        );
      }
      if (o.node.y - o.h / 2 > C.H + 20) {
        if (o.kind === 'cow' && !o.hit) this.stats.cowsDodged++;
        o.node.destroy();
        this.obstacles.splice(i, 1);
      }
    }
  }

  private scrollPassengers(move: number) {
    for (let i = this.passengers.length - 1; i >= 0; i--) {
      const p = this.passengers[i];
      p.node.y += move;
      const mark = p.node.getData('mark') as Phaser.GameObjects.Rectangle | undefined;
      if (mark) mark.y = p.node.y;
      if (p.node.y - p.h / 2 > C.H + 20) {
        mark?.destroy();
        p.node.destroy();
        this.passengers.splice(i, 1);
      }
    }
  }

  /**
   * The road leans into the route's real bends. Purely cosmetic: the whole
   * world shifts under a fixed HUD, lanes stay straight relative to each
   * other, and collision never knows. Outrun did it this way in 1986.
   */
  private followRoute(move: number) {
    const metres = this.stats.distPx / 10;
    const target = C.SWAY_PX * swayAt(this.route, metres);
    this.swayX += (target - this.swayX) * 0.05;
    this.cameras.main.scrollX = -this.swayX;

    // Landmark signs land beside the auto at their true distance — same
    // geometry as stops.
    for (const lm of this.route.landmarks) {
      if (this.landmarksSpawned.has(lm.label)) continue;
      const remaining = lm.atM * 10 - this.stats.distPx;
      if (remaining > C.AUTO_Y + C.LANDMARK_H) continue;
      this.landmarksSpawned.add(lm.label);
      const side = this.landmarkSigns.length % 2 === 0 ? 2 : 0;
      const x = side === 0 ? C.ROAD_LEFT - 30 : C.ROAD_RIGHT + 30;
      const sign = this.add.image(0, 0, 'landmark');
      const text = this.add
        .text(0, -9, lm.label.toUpperCase(), { fontFamily: 'monospace', fontSize: '7px', color: '#ecf0f1', fontStyle: 'bold', align: 'center', wordWrap: { width: 58 } })
        .setOrigin(0.5);
      const node = this.add.container(x, C.AUTO_Y - remaining, [sign, text]).setDepth(4);
      this.landmarkSigns.push({ node, label: lm.label, passed: false });
    }
    for (let i = this.landmarkSigns.length - 1; i >= 0; i--) {
      const lm = this.landmarkSigns[i];
      lm.node.y += move;
      if (!lm.passed && lm.node.y >= C.AUTO_Y) {
        lm.passed = true;
        this.pop(`📍 ${lm.label}`, '#ecf0f1');
      }
      if (lm.node.y > C.H + 60) {
        lm.node.destroy();
        this.landmarkSigns.splice(i, 1);
      }
    }

    if (!this.stats.route.done && metres >= this.route.lengthM) {
      this.stats.route.done = true;
      this.stats.fare += C.ROUTE_BONUS;
      this.pop(`${this.route.title.toUpperCase()} COMPLETE · +₹${C.ROUTE_BONUS}`, '#f1c40f');
      track('route_done', { route: this.route.slug, seconds: Math.round(this.stats.seconds) });
      sfx.drop(200);
      try {
        const done = new Set(JSON.parse(localStorage.getItem('auto_routes_done') ?? '[]') as string[]);
        done.add(this.route.slug);
        localStorage.setItem('auto_routes_done', JSON.stringify([...done]));
      } catch {
        // storage blocked
      }
    }
  }

  private scrollStops(move: number) {
    for (const st of this.stops) {
      st.node.y += move;
      st.mark.y = st.node.y;
    }
  }

  /**
   * A rider's stop marker appears at the top of the screen at exactly the
   * moment that scrolling it down will land it beside the auto when
   * stats.distPx reaches rider.dropAt. No timers — it's pure geometry.
   */
  private spawnStops() {
    for (const r of this.riders) {
      if (r.stop) continue;
      const remaining = r.dropAt - this.stats.distPx;
      if (remaining > C.AUTO_Y + C.STOP_H) continue;

      const x = r.side === 0 ? C.ROAD_LEFT - 18 : C.ROAD_RIGHT + 18;
      const y = C.AUTO_Y - remaining;

      const sign = this.add.image(0, 0, 'stopsign');
      const label = this.add
        .text(0, -12, r.dest, { fontFamily: 'monospace', fontSize: '9px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5);
      const node = this.add.container(x, y, [sign, label]).setDepth(6);

      // Green box in the kerb lane = drop here. Orange box = pick up. Same
      // visual grammar as boarding so it needs no explaining.
      const mark = this.add
        .rectangle(C.laneX(r.side), y, C.LANE_W - 14, 40)
        .setStrokeStyle(2, 0x2ecc71, 0.9)
        .setFillStyle(0x2ecc71, 0.12)
        .setDepth(1);

      const stop: Stop = { rider: r, node, mark, lane: r.side };
      r.stop = stop;
      this.stops.push(stop);
    }
  }

  /* ------------------------------------------------------------ collisions */

  private autoRect(): Phaser.Geom.Rectangle {
    // Slightly forgiving hitbox: a near-miss should feel like a near-miss.
    const shrink = 6;
    return new Phaser.Geom.Rectangle(
      this.auto.x - C.AUTO_W / 2 + shrink,
      this.auto.y - C.AUTO_H / 2 + shrink,
      C.AUTO_W - shrink * 2,
      C.AUTO_H - shrink * 2,
    );
  }

  private resolveCollisions(braking: boolean) {
    const me = this.autoRect();

    for (const o of this.obstacles) {
      // Resolved hazards are done — except water, which keeps slowing you for
      // as long as you're in it.
      if (o.hit && o.kind !== 'water') continue;
      const box = new Phaser.Geom.Rectangle(o.node.x - o.w / 2, o.node.y - o.h / 2, o.w, o.h);
      if (!Phaser.Geom.Intersects.RectangleToRectangle(me, box)) continue;

      if (LOOK[o.kind].crash) {
        this.crash(o.kind);
        return;
      }

      // Water slows you for as long as you're in it; the splash only happens once.
      if (o.kind === 'water') {
        this.wet = true;
        if (!o.hit) {
          o.hit = true;
          this.splash();
        }
        continue;
      }

      o.hit = true;
      switch (o.kind) {
        case 'pothole':
          this.bump('pothole!');
          break;
        case 'breaker':
          if (braking) this.pop('smooth', '#2ecc71');
          else this.bump('speed breaker!');
          break;
        case 'cop':
          this.stats.fare = Math.max(0, this.stats.fare - C.CHALLAN);
          this.pop(`-₹${C.CHALLAN} challan`, '#e74c3c');
          this.cameras.main.flash(120, 255, 255, 255, false);
          break;
      }
    }

    // Pickup is decided by lane and vertical overlap only. Being in the edge
    // lane *is* being at the kerb — checking x as well was a bug that made
    // pickups impossible, because the auto's hitbox never reaches the kerb.
    for (let i = this.passengers.length - 1; i >= 0; i--) {
      const p = this.passengers[i];
      if (this.lane !== p.lane || this.laneTween?.isPlaying()) continue;
      const top = p.node.y - p.h / 2;
      const bottom = p.node.y + p.h / 2;
      if (bottom >= me.top && top <= me.bottom) {
        this.board(p);
        this.passengers.splice(i, 1);
      }
    }

    for (let i = this.stops.length - 1; i >= 0; i--) {
      const st = this.stops[i];
      const top = st.node.y - C.STOP_H / 2;
      const bottom = st.node.y + C.STOP_H / 2;

      const inLane = this.lane === st.lane && !this.laneTween?.isPlaying();
      if (inLane && bottom >= me.top && top <= me.bottom) {
        this.dropOff(st);
        this.stops.splice(i, 1);
        continue;
      }
      // Fully past the auto without a drop: they missed it.
      if (top > me.bottom + 8) {
        this.missStop(st);
        this.stops.splice(i, 1);
      }
    }
  }

  /* ------------------------------------------------------------ events */

  private changeLane(dir: SwipeDir) {
    if (!this.alive) return;
    const next = Phaser.Math.Clamp(this.lane + dir, 0, C.LANES - 1);
    if (next === this.lane) return;
    this.lane = next;
    sfx.swipe();
    this.dust(-dir);

    // A new swipe interrupts the current one from wherever the auto is.
    this.laneTween?.stop();
    const duration = C.LANE_TWEEN_BASE + C.LANE_TWEEN_PER_PAX * this.pax;
    const tilt = dir * C.WOBBLE_PER_PAX * this.pax;

    this.laneTween = this.tweens.add({
      targets: this.auto,
      x: C.laneX(this.lane),
      duration,
      ease: 'Quad.easeOut',
    });
    this.tweens.add({
      targets: this.auto,
      angle: { from: tilt, to: 0 },
      duration: duration * 1.6,
      ease: 'Back.easeOut',
    });
  }

  private board(p: Passenger) {
    (p.node.getData('mark') as Phaser.GameObjects.Rectangle | undefined)?.destroy();
    p.node.destroy();
    if (this.pax >= C.MAX_PAX) {
      this.pop('full!', '#f1c40f');
      return;
    }

    const type = Phaser.Math.RND.pick(RIDERS);
    const ride = Phaser.Math.Linear(C.DROP_MIN_PX, C.DROP_MAX_PX, type.far) * Phaser.Math.FloatBetween(0.85, 1.15);
    this.riders.push({
      name: type.name,
      dest: type.dest,
      boardedAt: this.stats.distPx,
      dropAt: this.stats.distPx + ride,
      side: Math.random() < 0.5 ? 0 : 2,
      angry: false,
      bumped: false,
    });
    this.stats.carried++;
    this.stats.maxAboard = Math.max(this.stats.maxAboard, this.pax);
    sfx.board();
    track('pickup', { aboard: this.pax, km: +(this.stats.distPx / 10000).toFixed(2) });

    // The first pickup is the tutorial: say what just happened and why it matters.
    const first = !this.everBoarded;
    this.everBoarded = true;
    this.hint.setVisible(false);
    this.pop(
      first ? `${type.name} → ${type.dest} · meter ON` : this.pax === C.MAX_PAX ? 'FULL!' : `${type.name} → ${type.dest}`,
      '#2ecc71',
    );
    this.tweens.add({ targets: this.hudFare, scale: { from: 1.5, to: 1 }, duration: 260, ease: 'Back.easeOut' });
    this.hudFare.setColor('#2ecc71');
    this.time.delayedCall(700, () => this.hudFare.setColor('#ffffff'));
    this.tweens.add({ targets: this.auto, scaleX: 1.12, scaleY: 0.92, duration: 80, yoyo: true });
  }

  private dropOff(st: Stop) {
    const r = st.rider;
    const km = (this.stats.distPx - r.boardedAt) / 10000;
    const mult = Math.min(C.COMBO_MAX, 1 + C.COMBO_STEP * this.combo);
    const tip = r.angry ? 0 : Math.round((C.TIP_BASE + km * C.TIP_PER_KM) * (r.bumped ? 0.5 : 1) * mult);
    this.stats.fare += tip;
    this.stats.tips += tip;
    if (tip > 0) {
      this.combo++;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    }
    this.stats.dropped++;

    this.riders.splice(this.riders.indexOf(r), 1);
    st.node.destroy();
    st.mark.destroy();
    track('drop', { tip, combo: this.combo, angry: r.angry, ride_m: Math.round((this.stats.distPx - r.boardedAt) / 10) });

    const comboTag = this.combo >= 2 ? ` · ×${mult.toFixed(2).replace(/\.?0+$/, '')} combo` : '';
    this.pop(tip > 0 ? `${r.name} dropped · +₹${tip}${comboTag}` : `${r.name} off. no tip.`, tip > 0 ? '#2ecc71' : '#bdbdbd');
    if (tip > 0) {
      sfx.drop(tip);
      this.coins(Math.min(8, 3 + Math.floor(tip / 15)));
    } else sfx.swipe();
    this.tweens.add({ targets: this.auto, scaleX: 0.92, scaleY: 1.08, duration: 80, yoyo: true });
  }

  private missStop(st: Stop) {
    const r = st.rider;
    r.angry = true;
    r.stop = undefined;
    this.breakCombo();
    r.dropAt = this.stats.distPx + C.MISS_RETRY_PX;
    st.node.destroy();
    st.mark.destroy();
    this.pop(`${r.name} missed stop!`, '#e74c3c');
    track('missed_stop', { aboard: this.pax });
    this.cameras.main.flash(90, 231, 76, 60, false);
    sfx.miss();

    // Draw the eye to the seat that just turned: pulse its slot and its head.
    const idx = this.riders.indexOf(r);
    const seat = this.seats[idx];
    const head = this.heads[idx];
    if (seat) this.tweens.add({ targets: seat.bg, scaleX: 1.25, scaleY: 1.35, duration: 120, yoyo: true, repeat: 2 });
    if (head) this.tweens.add({ targets: head.mark, y: head.mark.y - 4, duration: 120, yoyo: true, repeat: 3 });
  }

  /** Lose a passenger out the side. Comedy first, punishment second. */
  private bump(reason: string) {
    this.cameras.main.shake(140, 0.008);
    sfx.bump();
    if (this.pax === 0) {
      this.pop(reason, '#bdbdbd');
      return;
    }
    const gone = this.riders.splice(Phaser.Math.Between(0, this.riders.length - 1), 1)[0];
    if (gone.stop) {
      gone.stop.node.destroy();
      gone.stop.mark.destroy();
      this.stops.splice(this.stops.indexOf(gone.stop), 1);
    }
    // Everyone still aboard got thrown around; they'll tip less.
    for (const r of this.riders) r.bumped = true;
    this.breakCombo();
    this.pop(`${reason} ${gone.name} fell out!`, '#e67e22');
    track('rider_fell', { reason, aboard_after: this.pax });

    const side = Math.random() < 0.5 ? -1 : 1;
    const fallen = this.add.image(this.auto.x, this.auto.y, `pax${Phaser.Math.Between(0, 3)}`).setDepth(9);
    this.tweens.add({
      targets: fallen,
      x: this.auto.x + side * 70,
      y: this.auto.y + 160,
      angle: side * 540,
      alpha: 0,
      duration: 700,
      ease: 'Quad.easeIn',
      onComplete: () => fallen.destroy(),
    });
  }

  /** A puff off the rear wheels on a lane change. */
  private dust(side: number) {
    for (let i = 0; i < 4; i++) {
      const p = this.add
        .image(this.auto.x + side * 16, this.auto.y + 20 + Phaser.Math.Between(-6, 6), 'dot')
        .setTint(0xb9b3a6)
        .setAlpha(0.7)
        .setScale(0.5 + Math.random() * 0.5)
        .setDepth(9);
      this.tweens.add({
        targets: p,
        x: p.x + side * Phaser.Math.Between(10, 26),
        y: p.y + Phaser.Math.Between(14, 30),
        alpha: 0,
        scale: 0.1,
        duration: 320,
        onComplete: () => p.destroy(),
      });
    }
  }

  /** Coins up from the auto on a tipped drop. */
  private coins(n: number) {
    for (let i = 0; i < n; i++) {
      const p = this.add
        .image(this.auto.x + Phaser.Math.Between(-12, 12), this.auto.y - 10, 'dot')
        .setTint(0xf5c518)
        .setScale(0.9)
        .setDepth(30);
      this.tweens.add({
        targets: p,
        y: p.y - Phaser.Math.Between(50, 90),
        x: p.x + Phaser.Math.Between(-20, 20),
        alpha: 0,
        duration: 600 + i * 40,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  private breakCombo() {
    if (this.combo >= 2) this.pop('combo lost', '#e67e22');
    this.combo = 0;
  }

  /** Drove into monsoon water: everyone aboard gets soaked, tips halve. */
  private splash() {
    this.cameras.main.shake(90, 0.005);
    sfx.bump();
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const p = this.add
        .image(this.auto.x + side * 14, this.auto.y + 10, 'dot')
        .setTint(0x9fd1f0)
        .setScale(0.4 + Math.random() * 0.5)
        .setDepth(9);
      this.tweens.add({
        targets: p,
        x: p.x + side * Phaser.Math.Between(16, 40),
        y: p.y - Phaser.Math.Between(10, 40),
        alpha: 0,
        duration: 380,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
    for (const r of this.riders) r.bumped = true;
    this.pop(this.riders.length ? 'splash! everyone soaked' : 'splash!', '#5dade2');
  }

  /** Runs the mission predicates; completes and pays out immediately. */
  private checkMissions() {
    for (const m of this.missions) {
      if (m.done) continue;
      if (m.check(this.stats, this.pax, this.combo)) {
        m.done = true;
        markMissionDone(m.id);
        this.stats.missionsDone.push(m.id);
        const entry = this.stats.missions.find((x) => x.id === m.id);
        if (entry) entry.done = true;
        this.stats.fare += C.MISSION_REWARD;
        this.pop(`✓ ${m.text} · +₹${C.MISSION_REWARD}`, '#f1c40f');
        track('mission_done', { mission: m.id, seconds: Math.round(this.stats.seconds) });
        sfx.drop(100);
      }
    }
  }

  private crash(kind: Kind) {
    this.alive = false;
    this.laneTween?.stop();
    sfx.crash();
    sfx.setEngine(0, false, false);
    track('run_end', {
      killer: kind,
      fare: Math.floor(this.stats.fare),
      seconds: Math.round(this.stats.seconds),
      km: +(this.stats.distPx / 10000).toFixed(2),
      carried: this.stats.carried,
      dropped: this.stats.dropped,
      max_aboard: this.stats.maxAboard,
      max_combo: this.stats.maxCombo,
      missions_done: this.stats.missionsDone.length,
      route: this.route.slug,
      route_done: this.stats.route.done,
      speed_at_end: Math.round(this.speed),
    });
    this.cameras.main.shake(320, 0.022);
    this.cameras.main.flash(200, 255, 80, 60, false);
    this.pop(`hit a ${LOOK[kind].label.toLowerCase()}`, '#e74c3c');
    this.time.delayedCall(700, () => this.scene.start('Over', this.stats));
  }

  private pop(text: string, color: string) {
    const t = this.add
      .text(this.auto.x, this.auto.y - 46, text, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color,
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({
      targets: t,
      y: t.y - 40,
      alpha: 0,
      duration: 650,
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  /* ------------------------------------------------------------ spawning */

  private spawn(time: number) {
    if (time >= this.nextObstacleAt) {
      this.spawnObstacle();
      const t = Math.min(1, this.elapsed / 1000 / C.SPAWN_RAMP_S);
      this.nextObstacleAt = time + Phaser.Math.Linear(C.SPAWN_START, C.SPAWN_MIN, t);
    }
    if (time >= this.nextPaxAt) {
      this.spawnPassenger();
      this.nextPaxAt = time + Phaser.Math.Between(C.PAX_SPAWN_MIN, C.PAX_SPAWN_MAX);
    }
  }

  private pickKind(): Kind {
    const km = this.stats.distPx / 10000;
    const entries = (Object.entries(C.OBSTACLES) as [Kind, { weight: number; unlockKm: number }][])
      .filter(([, v]) => km >= v.unlockKm);
    let r = Math.random() * entries.reduce((s, [, v]) => s + v.weight, 0);
    for (const [k, v] of entries) {
      r -= v.weight;
      if (r <= 0) return k;
    }
    return 'cow';
  }

  /** Lanes that already have a crash obstacle near the top of the screen. */
  private blockedLanes(): Set<number> {
    const blocked = new Set<number>();
    for (const o of this.obstacles) {
      if (!LOOK[o.kind].crash || o.node.y > 280) continue;
      // Mark every lane the obstacle actually overlaps, not just its centre —
      // buses straddle, and the wide hazards block two outright.
      for (let l = 0; l < C.LANES; l++) {
        if (Math.abs(C.laneX(l) - o.node.x) < o.w / 2 + C.LANE_W / 2 - 10) blocked.add(l);
      }
    }
    return blocked;
  }

  private spawnObstacle() {
    let kind = this.pickKind();
    const blocked = this.blockedLanes();

    // Never create a wall: at least one lane must stay open after this spawn.
    const needs = WIDE.has(kind) ? 2 : 1;
    if (LOOK[kind].crash && blocked.size + needs > C.LANES - 1) kind = Math.random() < 0.5 ? 'pothole' : 'cop';

    const look = LOOK[kind];
    const wide = WIDE.has(kind);

    // Wide hazards sit on a lane boundary and cover lanes (lane, lane+1).
    let lane: number;
    if (wide) {
      const pairs = [0, 1].filter((l) => !look.crash || (!blocked.has(l) && !blocked.has(l + 1)));
      lane = pairs.length ? Phaser.Math.RND.pick(pairs) : 0;
    } else if (look.crash) {
      lane = Phaser.Math.RND.pick([0, 1, 2].filter((l) => !blocked.has(l)));
    } else {
      lane = Phaser.Math.Between(0, C.LANES - 1);
    }

    // First sighting of a hazard this run gets announced — that's the reward
    // for having driven far enough to meet it.
    if (!this.seen.has(kind)) {
      this.seen.add(kind);
      this.pop(`NEW: ${look.label || kind} ahead`, '#f1c40f');
    }

    const x = kind === 'breaker' ? (C.ROAD_LEFT + C.ROAD_RIGHT) / 2 : wide ? C.laneX(lane) + C.LANE_W / 2 : C.laneX(lane);
    const y = -look.h;

    const parts: Phaser.GameObjects.GameObject[] = [this.add.image(0, 0, kind)];
    if (kind === 'truck') {
      // The back of a lorry, which is where this always goes.
      parts.push(
        this.add
          .text(0, -38, 'HORN OK PLEASE', { fontFamily: 'monospace', fontSize: '6px', color: '#ffffff', fontStyle: 'bold' })
          .setOrigin(0.5)
          .setAngle(180),
      );
    }
    if (kind === 'bus') {
      parts.push(
        this.add
          .text(0, 0, 'BMTC', { fontFamily: 'monospace', fontSize: '8px', color: '#e9eef5', fontStyle: 'bold' })
          .setOrigin(0.5),
      );
    }

    const flat = kind === 'pothole' || kind === 'breaker' || kind === 'water';
    const node = this.add.container(x, y, parts).setDepth(flat ? 1 : 5);

    this.obstacles.push({
      kind,
      node,
      w: look.w,
      h: look.h,
      // Scooters and trucks come at you; a baraat goes your way, so it
      // approaches slowly and gives you time to find the gap.
      vy: kind === 'scooter' ? 170 : kind === 'truck' ? 240 : kind === 'baraat' ? -110 : 0,
      drift: kind === 'bus' ? (Math.random() < 0.5 ? -1 : 1) * 28 : 0,
      hit: false,
    });
  }

  private spawnPassenger() {
    const lane: 0 | 2 = Math.random() < 0.5 ? 0 : 2;
    const x = lane === 0 ? C.ROAD_LEFT - 18 : C.ROAD_RIGHT + 18;
    const w = 16;
    const h = 24;

    // A person on the kerb, one of four outfits, arm up. Flipped so the
    // raised arm is always on the road side.
    const sprite = this.add.image(0, 0, `pax${Phaser.Math.Between(0, 3)}`).setFlipX(lane === 2);
    const shout = this.add
      .text(0, -26, 'AUTO!', {
        fontFamily: 'monospace', fontSize: '10px', color: '#111', fontStyle: 'bold',
        backgroundColor: '#ffffff', padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5);

    const node = this.add.container(x, -h, [sprite, shout]).setDepth(6);
    this.tweens.add({ targets: sprite, y: -2, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: shout, y: -30, duration: 320, yoyo: true, repeat: -1 });

    // Painted marking in the kerb lane beside them: this is where you drive.
    const mark = this.add
      .rectangle(C.laneX(lane), 0, C.LANE_W - 14, 40)
      .setStrokeStyle(2, 0xe67e22, 0.9)
      .setFillStyle(0xe67e22, 0.12)
      .setDepth(1);
    node.setData('mark', mark);

    this.passengers.push({ node, lane, w, h });
  }


  /* ------------------------------------------------------------ hud */

  private updateHud() {
    this.hudFare.setText(`₹${Math.floor(this.stats.fare)}`);
    const km = this.stats.distPx / 10000;
    const routeKm = this.route.lengthM / 1000;
    this.hudDist.setText(km < routeKm ? `${km.toFixed(2)} / ${routeKm.toFixed(2)} km` : `${km.toFixed(2)} km`);
    this.hudRoute.setText(
      km < routeKm ? `${this.route.title.toUpperCase()} · ${this.route.city.toUpperCase()}` : `BEYOND ${this.route.title.toUpperCase()}`,
    );
    const done = this.missions.filter((m) => m.done).length;
    const comboTxt = this.combo >= 2 ? `  ×${Math.min(C.COMBO_MAX, 1 + C.COMBO_STEP * this.combo).toFixed(1)}` : '';
    this.hudMissions.setText(`${done}/${this.missions.length} missions${comboTxt}`);
    this.autoPaxText.setText(String(this.pax));

    // Meter mode is a colour, not a number: green while anyone's paying.
    const earning = this.riders.some((r) => !r.angry);
    this.hudPax.setText(`${this.pax} / ${C.MAX_PAX} · meter ${earning ? 'ON' : 'OFF'}`);
    this.hudPax.setColor(earning ? '#2ecc71' : '#7f8c8d');
    if (this.hudFare.style.color === '#ffffff' || this.hudFare.style.color === '#7f8c8d') {
      this.hudFare.setColor(earning ? '#ffffff' : '#7f8c8d');
    }

    for (let i = 0; i < C.MAX_PAX; i++) {
      const r = this.riders[i];
      const seat = this.seats[i];
      const head = this.heads[i];
      if (!r) {
        seat.bg.setFillStyle(0x2a2a2a);
        seat.dest.setText('');
        seat.face.setText('');
        head.dot.setVisible(false);
        head.mark.setVisible(false);
        continue;
      }
      seat.bg.setFillStyle(r.angry ? 0xe74c3c : 0xe67e22);
      seat.dest.setText(r.dest);
      seat.face.setText(r.angry ? '>:(' : ':)');
      head.dot.setVisible(true).setFillStyle(r.angry ? 0xe74c3c : 0xf5cba7);
      head.mark.setVisible(r.angry);
    }

    const next = this.riders.reduce<Rider | null>(
      (best, r) => (!best || r.dropAt < best.dropAt ? r : best),
      null,
    );
    if (next) {
      const m = Math.max(0, Math.round((next.dropAt - this.stats.distPx) / 10));
      this.hudNext.setText(`${next.dest} ${m}m ${next.side === 0 ? '←' : '→'}`);
    } else {
      this.hudNext.setText('');
    }
  }
}
