import Phaser from 'phaser';
import { W, H, ROAD_LEFT, ROAD_RIGHT } from '../config';
import { buildTextures, SCENERY } from '../art';
import { sfx } from '../audio';
import { readStats } from '../stats';
import { pickRoute } from '../routes';
import { track, setSuper } from '../analytics';

/**
 * Start screen, and the only tutorial the game gets.
 *
 * Two jobs. A stranger shouldn't be dropped into traffic on page load — and
 * browsers won't play audio until a gesture, so the tap that starts the game
 * is also the tap that unlocks the sound.
 *
 * The how-to-play uses the *actual game textures* rather than describing
 * things in words. A sentence saying "pick up anyone waving AUTO!" teaches
 * nothing; seeing the passenger sprite here means it's recognised on the road
 * two seconds later. Same for the green stop sign, which is otherwise the
 * least obvious thing in the game.
 */
export class Title extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    buildTextures(this);
    const route = pickRoute();
    const stats = readStats();
    setSuper({ runs_before: stats.runs, best_fare: stats.bestFare, first_played: stats.firstPlayed || null });
    track('app_open', { route: route.slug, returning: stats.runs > 0 });

    this.drawBackdrop();

    const mono = { fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' };

    /* ---------------------------------------------------------- title */

    this.add
      .text(W / 2, 58, 'AUTO', { ...mono, fontSize: '54px', color: '#f5c518', stroke: '#000000', strokeThickness: 7 })
      .setOrigin(0.5);
    this.add
      .text(W / 2, 96, 'how many can you fit?', { ...mono, fontSize: '13px', color: '#e9e6dc', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5);

    /* ------------------------------------------------- the hero sprite */

    // The auto with a full load, because that's the pitch in one image.
    const hero = this.add.container(W / 2, 168);
    hero.add(this.add.image(0, 0, 'auto').setScale(1.9));
    for (let i = 0; i < 6; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      hero.add(
        this.add
          .circle(-13 + col * 26, -8 + row * 19, 7.5, 0xf5cba7)
          .setStrokeStyle(2, 0x1c1c1e, 0.85),
      );
    }
    this.tweens.add({ targets: hero, y: 163, duration: 950, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    /* ----------------------------------------------------- route badge */

    const badge = this.add.container(W / 2, 246);
    badge.add(this.add.rectangle(0, 0, 250, 40, 0x000000, 0.55).setStrokeStyle(1, 0xf5c518, 0.5));
    badge.add(
      this.add
        .text(0, -8, `${route.title.toUpperCase()} · ${route.city.toUpperCase()}`, { ...mono, fontSize: '12px', color: '#f5c518' })
        .setOrigin(0.5),
    );
    badge.add(
      this.add
        .text(0, 8, `${(route.lengthM / 1000).toFixed(2)} km of real road`, { ...mono, fontSize: '10px', color: '#9a9a9a' })
        .setOrigin(0.5),
    );

    /* --------------------------------------------------- how to play */

    this.add
      .text(W / 2, 292, 'HOW TO PLAY', { ...mono, fontSize: '11px', color: '#9a9a9a' })
      .setOrigin(0.5);

    this.step(322, 'swipe', 'Swipe ← → to change lane.\nHold anywhere to brake.');
    this.step(382, 'pax0', 'Pick up anyone waving.\nMore aboard = more fare.');
    this.step(442, 'stopsign', 'Drop them at their green\nsign for a tip.');
    this.step(502, 'cow', 'Hit anything solid and\nthe run is over.');

    /* --------------------------------------------------------- start */

    const btn = this.add.container(W / 2, 570);
    const plate = this.add.rectangle(0, 0, 210, 44, 0xf5c518).setStrokeStyle(3, 0x000000, 0.85);
    btn.add(plate);
    btn.add(this.add.text(0, 0, 'TAP TO DRIVE', { ...mono, fontSize: '18px', color: '#1c1c1e' }).setOrigin(0.5));
    this.tweens.add({ targets: btn, scale: 1.045, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const footer = stats.runs > 0
      ? `best ₹${stats.bestFare}  ·  ${stats.runs} run${stats.runs === 1 ? '' : 's'}`
      : 'roads © OpenStreetMap contributors';
    this.add
      .text(W / 2, H - 16, footer, { ...mono, fontSize: '10px', color: '#6f6f6f' })
      .setOrigin(0.5);

    /* ---------------------------------------------------------- input */

    const go = () => {
      sfx.unlock();
      track('run_start', { route: route.slug, run_number: stats.runs + 1 });
      this.scene.start('Game');
    };
    this.input.once('pointerdown', go);
    this.input.keyboard?.once('keydown', go);
  }

  /**
   * One how-to-play row: the real in-game sprite on the left, two lines of
   * text on the right, on a panel so it stays readable over the scenery.
   */
  private step(y: number, icon: string, text: string) {
    const mono = { fontFamily: 'monospace', fontStyle: 'bold' };
    this.add.rectangle(W / 2, y, 300, 50, 0x000000, 0.5).setStrokeStyle(1, 0xffffff, 0.08);

    if (icon === 'swipe') {
      // No sprite for a gesture, so draw one: an auto between two arrows.
      const g = this.add.container(70, y);
      g.add(this.add.image(0, 0, 'auto').setScale(0.62));
      const left = this.add.text(-24, 0, '←', { ...mono, fontSize: '17px', color: '#f5c518' }).setOrigin(0.5);
      const right = this.add.text(24, 0, '→', { ...mono, fontSize: '17px', color: '#f5c518' }).setOrigin(0.5);
      g.add([left, right]);
      this.tweens.add({ targets: [left, right], alpha: 0.25, duration: 620, yoyo: true, repeat: -1 });
    } else {
      const img = this.add.image(70, y, icon);
      // Normalise wildly different sprite sizes to a consistent icon slot.
      const fit = 40 / Math.max(img.width, img.height);
      img.setScale(Math.min(1.25, fit * 1.15));
      if (icon === 'pax0') {
        this.tweens.add({ targets: img, y: y - 3, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    }

    this.add
      .text(102, y, text, { ...mono, fontSize: '11px', color: '#e9e6dc', lineSpacing: 4 })
      .setOrigin(0, 0.5);
  }

  /** A still, denser-than-usual stretch of street behind the menu. */
  private drawBackdrop() {
    const roadW = ROAD_RIGHT - ROAD_LEFT;
    this.add.tileSprite(ROAD_LEFT - 130, H / 2, 260, H, 'verge');
    this.add.tileSprite(ROAD_RIGHT + 130, H / 2, 260, H, 'verge');
    this.add.tileSprite((ROAD_LEFT + ROAD_RIGHT) / 2, H / 2, roadW, H, 'road');

    // Deterministic so the menu looks the same every load.
    const rnd = new Phaser.Math.RandomDataGenerator(['auto-title']);
    for (let y = -20; y < H + 40; y += 58) {
      for (const side of [-1, 1]) {
        if (rnd.frac() < 0.22) continue;
        const pick = SCENERY[rnd.between(0, SCENERY.length - 1)];
        const base = side < 0 ? ROAD_LEFT : ROAD_RIGHT;
        const img = this.add.image(base + side * (pick.sideOffset + rnd.between(0, 34)), y + rnd.between(-14, 14), pick.key);
        if (side > 0 && (pick.key === 'shop' || pick.key === 'shop2')) img.setFlipY(true);
      }
    }

    // Dark wash so white text stays legible over all of it.
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a0c, 0.62);
  }
}
