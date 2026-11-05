import Phaser from 'phaser';
import { W, H } from '../config';
import type { RunStats } from './Game';
import { recordRun, summary } from '../stats';
import { PIXEL } from '../fonts';
import { track, setSuper } from '../analytics';
import { settleShift, SHIFTS } from '../shifts';

const BEST_KEY = 'auto_best_fare';

/** Shift result, payout, and a clear retry/continue action. */
export class Over extends Phaser.Scene {
  constructor() {
    super('Over');
  }

  create(stats: RunStats) {
    const fare = Math.floor(stats.fare);
    const km = (stats.distPx / 10000).toFixed(2);
    const lifetime = recordRun(stats);
    const progress = settleShift(stats.shift.id, fare, stats.shift.completed);
    setSuper({
      runs_before: lifetime.runs,
      best_fare: lifetime.bestFare,
      shift_cash: progress.cash,
      shifts_done: progress.completed.length,
    });

    let prevBest = 0;
    try {
      prevBest = Number(localStorage.getItem(BEST_KEY) ?? 0);
      if (fare > prevBest) localStorage.setItem(BEST_KEY, String(fare));
    } catch {
      // The result still works when storage is unavailable.
    }
    const isBest = fare > 0 && fare > prevBest;
    const completed = stats.shift.completed;
    const shift = stats.shift;
    const nextId = completed && shift.id < SHIFTS.length ? shift.id + 1 : shift.id;

    this.add.rectangle(W / 2, H / 2, W, H, 0x111111, 0.94);
    const mono = { fontFamily: PIXEL, color: '#ffffff', fontStyle: 'bold' };

    this.add
      .text(W / 2, 72, completed ? 'SHIFT COMPLETE!' : 'SHIFT ENDED', {
        ...mono, fontSize: '21px', color: completed ? '#2ecc71' : '#e67e22',
      })
      .setOrigin(0.5);
    this.add.text(W / 2, 105, `SHIFT ${shift.id} · ${shift.name.toUpperCase()}`, { ...mono, fontSize: '13px', color: '#f5c518' }).setOrigin(0.5);
    this.add
      .text(W / 2, 130, `${shift.objective}  ·  ${Math.min(stats.dropped, shift.drops)}/${shift.drops}`, {
        ...mono, fontSize: '10px', color: completed ? '#2ecc71' : '#bdbdbd',
      })
      .setOrigin(0.5);

    const routeLine = stats.route.done
      ? `${stats.route.title}, ${stats.route.city} · road complete`
      : `${stats.route.title}, ${stats.route.city} · ${km} km`;
    this.add.text(W / 2, 158, routeLine, { ...mono, fontSize: '9px', color: '#7f8c8d' }).setOrigin(0.5);

    this.add.text(W / 2, 197, 'SHIFT FARE', { ...mono, fontSize: '10px', color: '#bdbdbd' }).setOrigin(0.5);
    const fareText = this.add.text(W / 2, 238, '₹0', { ...mono, fontSize: '48px', color: '#f4d03f' }).setOrigin(0.5);
    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: fare,
      duration: Math.min(1200, 250 + fare * 2),
      ease: 'Cubic.easeOut',
      onUpdate: () => fareText.setText(`₹${Math.floor(counter.v)}`),
      onComplete: () => {
        fareText.setText(`₹${fare}`);
        this.tweens.add({ targets: fareText, scale: { from: 1.15, to: 1 }, duration: 220, ease: 'Back.easeOut' });
      },
    });

    const payout = completed ? `+ ₹${shift.reward} SHIFT BONUS` : 'Finish the job to earn the shift bonus';
    this.add.text(W / 2, 274, payout, { ...mono, fontSize: '11px', color: completed ? '#2ecc71' : '#7f8c8d' }).setOrigin(0.5);
    this.add.text(W / 2, 302, `WALLET  ₹${progress.cash}${isBest ? '  ·  NEW BEST' : ''}`, {
      ...mono, fontSize: '12px', color: '#f5c518',
    }).setOrigin(0.5);

    const lines = [
      `${stats.carried} picked up  ·  ${stats.dropped} dropped`,
      `₹${stats.tips} tips  ·  best combo ×${stats.maxCombo}`,
      `${km} km driven  ·  ${Math.round(stats.seconds)} sec`,
    ];
    lines.forEach((line, i) => {
      this.add.text(W / 2, 340 + i * 22, line, { ...mono, fontSize: '11px', color: '#bdbdbd' }).setOrigin(0.5);
    });

    const shareText = [
      `🛺 Riksha · Shift ${shift.id}: ${shift.name}`,
      `${completed ? 'Job complete' : `${stats.dropped}/${shift.drops} drop-offs`} · ₹${fare} fare · ${km} km`,
      'Can you finish the shift?',
    ].join('\n');
    const shareBtn = this.button(W / 2, 432, 'SHARE SHIFT', 0xf4d03f, '#111', 190);
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
        label = 'SHARE SHIFT';
      }
      (shareBtn.getAt(1) as Phaser.GameObjects.Text).setText(label);
      track('share_click', { how: label.toLowerCase(), fare, shift_id: shift.id });
    });

    const action = completed ? (shift.id < SHIFTS.length ? 'NEXT SHIFT' : 'PLAY SHIFT 5 AGAIN') : 'RETRY SHIFT';
    const actionBtn = this.button(W / 2, 500, action, 0xf5c518, '#1c1c1e', 240);
    actionBtn.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      this.scene.start('Game', { shiftId: nextId });
    });

    const home = this.add
      .text(W / 2, 554, 'SHIFT BOARD', { ...mono, fontSize: '12px', color: '#9a9a9a' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    home.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      this.scene.start('Title');
    });

    const send = this.add
      .text(W / 2, 588, `send my stats (${lifetime.runs} runs) →`, { ...mono, fontSize: '10px', color: '#25d366' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    send.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      track('stats_send', { runs: lifetime.runs });
      window.open(`https://wa.me/?text=${encodeURIComponent(summary(lifetime))}`, '_blank');
    });

    this.add.text(W / 2, H - 11, 'roads © OpenStreetMap contributors', { ...mono, fontSize: '8px', color: '#4a4a4a' }).setOrigin(0.5);
    if (!completed) this.add.text(W / 2, 614, `Complete the job for ₹${shift.reward} extra`, { ...mono, fontSize: '9px', color: '#9a9a9a' }).setOrigin(0.5);
  }

  private button(x: number, y: number, label: string, fill: number, color: string, width: number) {
    const bg = this.add.rectangle(0, 0, width, 44, fill);
    const text = this.add.text(0, 0, label, { fontFamily: PIXEL, fontSize: '15px', color, fontStyle: 'bold' }).setOrigin(0.5);
    const container = this.add.container(x, y, [bg, text]);
    container.setSize(width, 44).setInteractive({ useHandCursor: true });
    return container;
  }
}
