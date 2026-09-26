import Phaser from 'phaser';
import { W, H } from '../config';
import type { RunStats } from './Game';
import { recordRun, summary } from '../stats';
import { PIXEL } from '../fonts';
import { track, setSuper } from '../analytics';

const BEST_KEY = 'auto_best_fare';

/** Crash screen. Stats, best, share, tap to go again. */
export class Over extends Phaser.Scene {
  constructor() {
    super('Over');
  }

  create(stats: RunStats) {
    const fare = Math.floor(stats.fare);
    const km = (stats.distPx / 10000).toFixed(2);
    const lifetime = recordRun(stats);
    setSuper({ runs_before: lifetime.runs, best_fare: lifetime.bestFare });

    let prevBest = 0;
    let best = 0;
    try {
      prevBest = Number(localStorage.getItem(BEST_KEY) ?? 0);
      best = Math.max(prevBest, fare);
      if (fare > prevBest) localStorage.setItem(BEST_KEY, String(fare));
    } catch {
      // Private mode or blocked storage — the run still shows, just no best.
    }
    const isBest = fare > 0 && fare > prevBest;

    this.add.rectangle(W / 2, H / 2, W, H, 0x111111, 0.92);

    const mono = { fontFamily: PIXEL, color: '#ffffff', fontStyle: 'bold' };

    this.add.text(W / 2, 110, 'RUN OVER', { ...mono, fontSize: '22px', color: '#e74c3c' }).setOrigin(0.5);
    const rt = stats.route;
    const routeLine = rt.done
      ? `${rt.title}, ${rt.city} · completed ✓`
      : `${rt.title}, ${rt.city} · ${(stats.distPx / 10000).toFixed(2)} of ${(rt.lengthM / 1000).toFixed(2)} km`;
    this.add.text(W / 2, 136, routeLine, { ...mono, fontSize: '11px', color: rt.done ? '#2ecc71' : '#7f8c8d' }).setOrigin(0.5);
    this.add
      .text(W / 2, H - 14, 'roads © OpenStreetMap contributors', { ...mono, fontSize: '9px', color: '#4a4a4a' })
      .setOrigin(0.5);

    // The number is the whole reward, so it counts up rather than appearing.
    const fareText = this.add.text(W / 2, 190, '₹0', { ...mono, fontSize: '56px', color: '#f4d03f' }).setOrigin(0.5);
    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: fare,
      duration: Math.min(1400, 300 + fare * 3),
      ease: 'Cubic.easeOut',
      onUpdate: () => fareText.setText(`₹${Math.floor(counter.v)}`),
      onComplete: () => {
        fareText.setText(`₹${fare}`);
        this.tweens.add({ targets: fareText, scale: { from: 1.18, to: 1 }, duration: 220, ease: 'Back.easeOut' });
      },
    });

    const bestLine = isBest
      ? prevBest > 0 ? `NEW BEST  (+₹${fare - prevBest})` : 'NEW BEST'
      : fare > 0 ? `₹${best - fare} short of your best` : `best ₹${best}`;
    this.add
      .text(W / 2, 236, bestLine, { ...mono, fontSize: '14px', color: isBest ? '#2ecc71' : '#7f8c8d' })
      .setOrigin(0.5);

    const lines = [
      `${km} km`,
      `${stats.carried} carried · ${stats.maxAboard} at once`,
      `${stats.dropped} dropped · ₹${stats.tips} tips · best combo ×${stats.maxCombo}`,
      `${stats.cowsDodged} cow${stats.cowsDodged === 1 ? '' : 's'} dodged`,
    ];
    lines.forEach((line, i) => {
      this.add.text(W / 2, 290 + i * 24, line, { ...mono, fontSize: '15px', color: '#bdbdbd' }).setOrigin(0.5);
    });

    // Missions: what you were chasing, and whether you got it.
    stats.missions.forEach((m, i) => {
      this.add
        .text(W / 2, 400 + i * 20, `${m.done ? '✓' : '○'} ${m.text}`, {
          ...mono, fontSize: '13px', color: m.done ? '#f1c40f' : '#7f8c8d',
        })
        .setOrigin(0.5);
    });

    const shareText = [
      `🛺 Auto · ${stats.route.title}, ${stats.route.city} · ₹${fare} fare`,
      `${km} km · ${stats.maxAboard} in a 3-seater · ${stats.dropped} dropped · ${stats.cowsDodged} cows`,
      `How many can you fit?`,
    ].join('\n');

    const shareBtn = this.button(W / 2, 490, 'SHARE', 0xf4d03f, '#111');
    shareBtn.on('pointerdown', async (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      let label = 'COPIED';
      try {
        if (navigator.share) {
          await navigator.share({ text: shareText });
          label = 'SHARED';
        } else {
          await navigator.clipboard.writeText(shareText);
        }
      } catch {
        label = 'SHARE';
      }
      (shareBtn.getAt(1) as Phaser.GameObjects.Text).setText(label);
      track('share_click', { how: label.toLowerCase(), fare });
    });

    this.add
      .text(W / 2, 545, 'tap anywhere to go again', { ...mono, fontSize: '14px', color: '#7f8c8d' })
      .setOrigin(0.5);

    // Instrumentation without a server: the tester WhatsApps you their numbers.
    const send = this.add
      .text(W / 2, 578, `send my stats (${lifetime.runs} run${lifetime.runs === 1 ? '' : 's'}) →`, { ...mono, fontSize: '11px', color: '#25d366' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    send.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      track('stats_send', { runs: lifetime.runs });
      window.open(`https://wa.me/?text=${encodeURIComponent(summary(lifetime))}`, '_blank');
    });

    // Short guard so the crash tap doesn't immediately restart.
    this.time.delayedCall(400, () => {
      this.input.once('pointerdown', () => this.scene.start('Game'));
      this.input.keyboard?.once('keydown', () => this.scene.start('Game'));
    });
  }

  private button(x: number, y: number, label: string, fill: number, color: string) {
    const bg = this.add.rectangle(0, 0, 160, 44, fill);
    const text = this.add
      .text(0, 0, label, { fontFamily: PIXEL, fontSize: '16px', color, fontStyle: 'bold' })
      .setOrigin(0.5);
    const c = this.add.container(x, y, [bg, text]);
    c.setSize(160, 44).setInteractive({ useHandCursor: true });
    return c;
  }
}
