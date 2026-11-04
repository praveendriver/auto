import Phaser from 'phaser';
import { W } from './config';

export type SteerDir = -1 | 1;

/** Tap either half of the screen to move one lane. Keyboard mirrors it. */
export class Controls {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, onSteer: (dir: SteerDir) => void) {
    this.scene = scene;
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      onSteer(pointer.x < W / 2 ? -1 : 1);
    });

    const kb = scene.input.keyboard;
    if (kb) {
      kb.on('keydown-LEFT', () => onSteer(-1));
      kb.on('keydown-RIGHT', () => onSteer(1));
      kb.on('keydown-A', () => onSteer(-1));
      kb.on('keydown-D', () => onSteer(1));
    }
  }

  destroy() {
    this.scene.input.removeAllListeners();
    this.scene.input.keyboard?.removeAllListeners();
  }
}
