import Phaser from 'phaser';
import { W, TAP_DEAD_ZONE } from './config';

export type SteerDir = -1 | 1;

/**
 * One-finger controls, tuned for a thumb on a phone.
 *
 * **Tapping the left or right of the screen changes lane**, and it fires on
 * touch-*down* rather than on release, so there is no latency and no minimum
 * distance for a thumb to travel. This is the primary input: a 3-lane road
 * with 80px lanes is too tight for swipe, where under-travelling the gesture
 * silently does nothing and you find out by crashing.
 *
 * Swipe still works for people who reach for it, but **only from the dead zone
 * in the middle**. A pointer that has already spent its tap on a side zone is
 * barred from swiping, which is what stops a leftward swipe that begins on the
 * left from stepping two lanes at once.
 *
 * Holding anywhere brakes. The HOLD_MS delay keeps a slow swipe from being
 * misread as a brake, and holding in the dead zone brakes without steering.
 *
 * Keyboard mirrors all of it (arrows / A,D / S) so the feel can be checked on
 * a desktop.
 */
export class Controls {
  braking = false;

  private startX = 0;
  /** This pointer consumed a tap-steer, so it may not also swipe. */
  private spent = false;
  private swiped = false;
  private holdTimer?: Phaser.Time.TimerEvent;

  private static readonly SWIPE_PX = 26;
  private static readonly HOLD_MS = 140;

  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, onSteer: (dir: SteerDir) => void) {
    this.scene = scene;
    const input = scene.input;
    const edge = (W - TAP_DEAD_ZONE) / 2;

    input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.startX = p.x;
      this.swiped = false;

      if (p.x < edge) {
        this.spent = true;
        onSteer(-1);
      } else if (p.x > W - edge) {
        this.spent = true;
        onSteer(1);
      } else {
        this.spent = false;
      }

      this.holdTimer?.remove();
      this.holdTimer = scene.time.delayedCall(Controls.HOLD_MS, () => {
        if (!this.swiped) this.braking = true;
      });
    });

    input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.spent || this.swiped) return;
      const dx = p.x - this.startX;
      if (Math.abs(dx) >= Controls.SWIPE_PX) {
        this.swiped = true;
        this.braking = false;
        this.holdTimer?.remove();
        onSteer(dx < 0 ? -1 : 1);
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
      kb.on('keydown-LEFT', () => onSteer(-1));
      kb.on('keydown-RIGHT', () => onSteer(1));
      kb.on('keydown-A', () => onSteer(-1));
      kb.on('keydown-D', () => onSteer(1));
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
