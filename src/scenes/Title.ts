import Phaser from 'phaser';
import { W, H } from '../config';
import { buildTextures } from '../art';
import { sfx } from '../audio';
import { readStats } from '../stats';
import { pickRoute } from '../routes';
import { track, setSuper } from '../analytics';

/**
 * Start screen. Exists for two reasons: a stranger shouldn't be dropped into
 * traffic the instant the page loads, and browsers won't play audio until
 * the user has tapped something — so the tap that starts the game is also
 * the tap that unlocks the sound.
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

    // A still frame of the road, dimmed.
    this.add.tileSprite(W / 2, H / 2, 240, H, 'road');
    this.add.tileSprite(-70, H / 2, 260, H, 'verge');
    this.add.tileSprite(W + 70, H / 2, 260, H, 'verge');
    this.add.image(300, 120, 'tree');
    this.add.image(40, 250, 'shop');
    this.add.image(320, 400, 'chai');
    this.add.image(50, 480, 'tree2');
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55);

    const auto = this.add.image(W / 2, 250, 'auto').setScale(2.6);
    this.tweens.add({ targets: auto, y: 246, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const mono = { fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' };
    this.add.text(W / 2, 120, 'AUTO', { ...mono, fontSize: '52px', color: '#f5c518', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    this.add.text(W / 2, 166, 'how many can you fit?', { ...mono, fontSize: '14px', color: '#e9e6dc' }).setOrigin(0.5);

    this.add
      .text(W / 2, 350, `${route.title.toUpperCase()} · ${route.city.toUpperCase()}\n${(route.lengthM / 1000).toFixed(2)} km`, {
        ...mono, fontSize: '12px', color: '#bdbdbd', align: 'center', lineSpacing: 4,
      })
      .setOrigin(0.5);

    const tap = this.add
      .text(W / 2, 430, 'TAP TO DRIVE', { ...mono, fontSize: '20px', color: '#f5c518', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5);
    this.tweens.add({ targets: tap, alpha: 0.35, duration: 650, yoyo: true, repeat: -1 });

    this.add
      .text(W / 2, 480, 'swipe ← → to steer · hold to brake\npick up anyone waving AUTO! · drop them at the green sign', {
        ...mono, fontSize: '10px', color: '#9a9a9a', align: 'center', lineSpacing: 4,
      })
      .setOrigin(0.5);

    if (stats.runs > 0) {
      this.add
        .text(W / 2, 560, `best ₹${stats.bestFare} · ${stats.runs} run${stats.runs === 1 ? '' : 's'}`, { ...mono, fontSize: '12px', color: '#7f8c8d' })
        .setOrigin(0.5);
    }

    this.add
      .text(W / 2, H - 12, 'roads © OpenStreetMap contributors', { ...mono, fontSize: '8px', color: '#4a4a4a' })
      .setOrigin(0.5);

    const go = () => {
      sfx.unlock();
      track('run_start', { route: route.slug, run_number: stats.runs + 1 });
      this.scene.start('Game');
    };
    this.input.once('pointerdown', go);
    this.input.keyboard?.once('keydown', go);
  }
}
