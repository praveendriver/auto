import Phaser from 'phaser';
import { W, H } from './config';
import { initAnalytics } from './analytics';
import { readyFonts } from './fonts';
import { Title } from './scenes/Title';
import { Game } from './scenes/Game';
import { Over } from './scenes/Over';

initAnalytics();

// Phaser bakes text into the canvas when it's created, so a font that lands
// late is never picked up. Wait for both faces (with a 2s ceiling) and only
// then boot.
await readyFonts();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'app',
  backgroundColor: '#111111',
  // Fixed logical size, scaled to whatever phone it lands on.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 1 },
  scene: [Title, Game, Over],
});

// Dev only: lets the loop be stepped by hand from the console, which is how
// the mechanics get verified when the tab isn't visible and rAF is paused.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
