import Phaser from 'phaser';

export type SwipeDir = -1 | 1;

/**
 * One-finger controls: swipe left/right to change lane, hold to brake.
 * Keyboard mirrors it (arrows / A,D / S) so the feel can be tested on a desktop.
 *
 * A hold only becomes a brake after HOLD_MS with no lateral movement, so a
 * slow swipe is never misread as braking. A swipe cancels any pending hold.
 */
export class Controls {
  braking = false;

  private startX = 0;
  private swiped = false;
  private holdTimer?: Phaser.Time.TimerEvent;

  private static readonly SWIPE_PX = 26;
  private static readonly HOLD_MS = 140;

  private scene: Phaser.Scene;
  private onSwipe: (dir: SwipeDir) => void;

  constructor(scene: Phaser.Scene, onSwipe: (dir: SwipeDir) => void) {
    this.scene = scene;
    this.onSwipe = onSwipe;
    const input = scene.input;

    input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.startX = p.x;
      this.swiped = false;
      this.holdTimer?.remove();
      this.holdTimer = scene.time.delayedCall(Controls.HOLD_MS, () => {
        if (!this.swiped) this.braking = true;
      });
    });

    input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.swiped) return;
      const dx = p.x - this.startX;
      if (Math.abs(dx) >= Controls.SWIPE_PX) {
        this.swiped = true;
        this.braking = false;
        this.holdTimer?.remove();
        this.onSwipe(dx < 0 ? -1 : 1);
      }
    });

    const release = () => {
      this.braking = false;
      this.holdTimer?.remove();
    };
    input.on('pointerup', release);
    input.on('pointerupoutside', release);

    const kb = scene.input.keyboard;
    if (kb) {
      kb.on('keydown-LEFT', () => this.onSwipe(-1));
      kb.on('keydown-RIGHT', () => this.onSwipe(1));
      kb.on('keydown-A', () => this.onSwipe(-1));
      kb.on('keydown-D', () => this.onSwipe(1));
      kb.on('keydown-DOWN', () => (this.braking = true));
      kb.on('keyup-DOWN', () => (this.braking = false));
      kb.on('keydown-S', () => (this.braking = true));
      kb.on('keyup-S', () => (this.braking = false));
    }
  }

  destroy() {
    this.holdTimer?.remove();
    this.scene.input.removeAllListeners();
    this.scene.input.keyboard?.removeAllListeners();
  }
}
