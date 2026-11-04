import Phaser from 'phaser';

/**
 * Every sprite in the game, drawn as vector shapes and baked into textures
 * once at startup. No image files, so nothing to load, license or lose — and
 * every colour is a number you can change.
 *
 * Top-down. "Up" is forward. Things that come at you (scooter, truck) are
 * drawn facing down; everything else faces up.
 */

export const PAL = {
  tarmac: 0x3a3a40,
  tarmacDark: 0x333338,
  tarmacLight: 0x45454b,
  paint: 0xe9e6dc,
  kerbA: 0xb9b3a6,
  kerbB: 0x9d978a,
  dirt: 0x8b6b4a,
  dirtDark: 0x7a5c3e,
  grass: 0x6d8c47,
  autoYellow: 0xf5c518,
  autoBlack: 0x1c1c1e,
  glass: 0xbfe6ff,
  skin: 0xd9a066,
  skinDark: 0xb87b4a,
  shadow: 0x000000,
} as const;

/** Small deterministic PRNG so speckle textures are identical every run. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

type Draw = (g: Phaser.GameObjects.Graphics) => void;

function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function shadow(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number, h: number) {
  g.fillStyle(PAL.shadow, 0.28);
  g.fillEllipse(cx + 2, cy + 4, w, h);
}

export function buildTextures(scene: Phaser.Scene) {
  /* ------------------------------------------------------------ ground */

  // Road tile: tarmac, speckles, kerb stones, one dash per lane boundary.
  tex(scene, 'road', 240, 70, (g) => {
    const rnd = lcg(7);
    g.fillStyle(PAL.tarmac);
    g.fillRect(0, 0, 240, 70);
    for (let i = 0; i < 90; i++) {
      g.fillStyle(rnd() < 0.5 ? PAL.tarmacDark : PAL.tarmacLight, 0.9);
      g.fillRect(Math.floor(rnd() * 240), Math.floor(rnd() * 70), 2, 2);
    }
    // Kerb stones down each edge.
    for (let y = 0; y < 70; y += 14) {
      const a = (y / 14) % 2 === 0;
      g.fillStyle(a ? PAL.kerbA : PAL.kerbB);
      g.fillRect(0, y, 6, 14);
      g.fillStyle(a ? PAL.kerbB : PAL.kerbA);
      g.fillRect(234, y, 6, 14);
    }
    g.fillStyle(PAL.paint, 0.95);
    g.fillRect(78, 18, 4, 34);
    g.fillRect(158, 18, 4, 34);
  });

  // Verge tile: dirt with grass and stones.
  tex(scene, 'verge', 200, 70, (g) => {
    const rnd = lcg(21);
    g.fillStyle(PAL.dirt);
    g.fillRect(0, 0, 200, 70);
    for (let i = 0; i < 60; i++) {
      g.fillStyle(PAL.dirtDark, 0.8);
      g.fillRect(Math.floor(rnd() * 200), Math.floor(rnd() * 70), 2, 2);
    }
    for (let i = 0; i < 7; i++) {
      g.fillStyle(PAL.grass, 0.55);
      g.fillEllipse(rnd() * 200, rnd() * 70, 18 + rnd() * 22, 8 + rnd() * 8);
    }
    for (let i = 0; i < 5; i++) {
      g.fillStyle(PAL.kerbB, 0.7);
      g.fillCircle(rnd() * 200, rnd() * 70, 1.5 + rnd() * 1.5);
    }
  });

  /* ------------------------------------------------------------ the auto */

  tex(scene, 'auto', 48, 64, (g) => {
    shadow(g, 24, 32, 42, 58);
    // wheels first so the body sits on them
    g.fillStyle(PAL.autoBlack);
    g.fillRoundedRect(21, 0, 6, 11, 2);
    g.fillRoundedRect(1, 44, 7, 15, 2);
    g.fillRoundedRect(40, 44, 7, 15, 2);
    // body
    g.fillStyle(PAL.autoYellow);
    g.fillRoundedRect(5, 5, 38, 55, 10);
    g.fillStyle(0xd9a90f);
    g.fillRoundedRect(5, 50, 38, 10, { tl: 0, tr: 0, bl: 10, br: 10 });
    // canopy
    g.fillStyle(PAL.autoBlack);
    g.fillRoundedRect(9, 22, 30, 36, 8);
    g.fillStyle(0x2c2c30);
    g.fillRoundedRect(11, 24, 26, 32, 7);
    // windscreen + headlight
    g.fillStyle(PAL.glass);
    g.fillRoundedRect(11, 9, 26, 11, 4);
    g.fillStyle(0xffffff, 0.5);
    g.fillRect(13, 10, 8, 3);
    g.fillStyle(0xfff7c2);
    g.fillCircle(24, 6, 3);
    // tail lights
    g.fillStyle(0xe74c3c);
    g.fillRect(9, 57, 5, 2);
    g.fillRect(34, 57, 5, 2);
  });

  /* ------------------------------------------------------------ traffic */

  tex(scene, 'cow', 52, 48, (g) => {
    shadow(g, 26, 26, 42, 26);
    g.fillStyle(0x3d2b1f);
    for (const [x, y] of [[10, 16], [38, 16], [10, 38], [38, 38]]) g.fillRoundedRect(x, y, 6, 8, 2);
    g.fillStyle(0xf3ead8);
    g.fillEllipse(26, 27, 40, 26);
    g.fillStyle(0x6b4b2a);
    g.fillEllipse(18, 24, 12, 9);
    g.fillEllipse(33, 31, 10, 8);
    // head, ears, horns
    g.fillStyle(0xf3ead8);
    g.fillCircle(26, 10, 8);
    g.fillEllipse(17, 9, 7, 4);
    g.fillEllipse(35, 9, 7, 4);
    g.fillStyle(0xe0c9a6);
    g.fillEllipse(26, 12, 8, 5);
    g.lineStyle(2, 0xd8cfbd);
    g.lineBetween(21, 5, 17, 1);
    g.lineBetween(31, 5, 35, 1);
    g.fillStyle(0x1c1c1e);
    g.fillCircle(23, 8, 1.2);
    g.fillCircle(29, 8, 1.2);
    g.lineStyle(2, 0x3d2b1f);
    g.lineBetween(26, 40, 28, 47);
  });

  tex(scene, 'bus', 70, 132, (g) => {
    shadow(g, 35, 66, 62, 124);
    g.fillStyle(PAL.autoBlack);
    for (const [x, y] of [[1, 14], [63, 14], [1, 60], [63, 60], [1, 106], [63, 106]]) g.fillRoundedRect(x, y, 6, 16, 2);
    g.fillStyle(0x3f6db3);
    g.fillRoundedRect(4, 4, 62, 124, 7);
    g.fillStyle(0x5a86c9);
    g.fillRoundedRect(8, 22, 54, 100, 5);
    g.fillStyle(0xe9eef5);
    g.fillRect(8, 22, 54, 4);
    g.fillRect(8, 118, 54, 4);
    // roof hatches
    g.fillStyle(0x2f5590);
    g.fillRoundedRect(22, 44, 26, 16, 3);
    g.fillRoundedRect(22, 84, 26, 16, 3);
    // windows along the sides
    g.fillStyle(PAL.glass);
    for (let y = 28; y < 118; y += 12) {
      g.fillRect(4, y, 4, 8);
      g.fillRect(62, y, 4, 8);
    }
    g.fillRoundedRect(9, 7, 52, 12, 3);
    g.fillStyle(0xfff7c2);
    g.fillCircle(12, 6, 2.5);
    g.fillCircle(58, 6, 2.5);
    g.fillStyle(0xe74c3c);
    g.fillRect(9, 125, 8, 2);
    g.fillRect(53, 125, 8, 2);
  });

  tex(scene, 'scooter', 32, 48, (g) => {
    shadow(g, 16, 26, 24, 40);
    g.fillStyle(PAL.autoBlack);
    g.fillRoundedRect(13, 2, 6, 10, 2);
    g.fillRoundedRect(13, 38, 6, 10, 2);
    g.fillStyle(0x5b6770);
    g.fillRoundedRect(10, 8, 12, 34, 5);
    g.fillStyle(0x8a97a1);
    g.fillRect(4, 36, 24, 3);
    g.fillStyle(0xfff7c2);
    g.fillCircle(16, 42, 2.5);
    // rider, seen from above: shoulders and a helmet
    g.fillStyle(0xd35400);
    g.fillRoundedRect(7, 16, 18, 14, 5);
    g.fillStyle(PAL.skinDark);
    g.fillCircle(16, 21, 5);
    g.fillStyle(0x2c3e50);
    g.fillCircle(16, 20, 4.5);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(14, 18, 1.2);
  });

  tex(scene, 'truck', 60, 100, (g) => {
    shadow(g, 30, 50, 52, 92);
    g.fillStyle(PAL.autoBlack);
    for (const [x, y] of [[2, 10], [52, 10], [2, 40], [52, 40], [2, 74], [52, 74]]) g.fillRoundedRect(x, y, 6, 14, 2);
    // cargo bed (at the top: this faces down, so the back is up)
    g.fillStyle(0x7d5a3c);
    g.fillRoundedRect(5, 4, 50, 58, 4);
    g.fillStyle(0x2e86c1);
    g.fillRoundedRect(8, 7, 44, 52, 3);
    g.lineStyle(1, 0x1f5f8b, 0.8);
    for (let y = 14; y < 58; y += 9) g.lineBetween(8, y, 52, y);
    // cab
    g.fillStyle(0xc0392b);
    g.fillRoundedRect(6, 62, 48, 34, 5);
    g.fillStyle(0xe8604f);
    g.fillRoundedRect(9, 65, 42, 14, 3);
    g.fillStyle(PAL.glass);
    g.fillRoundedRect(9, 83, 42, 10, 3);
    g.fillStyle(0xfff7c2);
    g.fillCircle(11, 96, 2.5);
    g.fillCircle(49, 96, 2.5);
  });

  tex(scene, 'cop', 32, 48, (g) => {
    shadow(g, 16, 30, 22, 18);
    g.fillStyle(0xc2a878);
    g.fillRoundedRect(8, 16, 16, 24, 5);
    g.fillStyle(0x8e7a55);
    g.fillRect(8, 30, 16, 3);
    // arm out: stop
    g.fillStyle(0xc2a878);
    g.fillRoundedRect(22, 18, 9, 5, 2);
    g.fillStyle(PAL.skin);
    g.fillCircle(31, 20, 3);
    g.fillCircle(16, 11, 6);
    g.fillStyle(0x2c3e50);
    g.fillEllipse(16, 8, 14, 7);
    g.fillRect(9, 8, 14, 3);
    g.fillStyle(0xf1c40f);
    g.fillCircle(16, 7, 1.5);
  });

  tex(scene, 'baraat', 156, 100, (g) => {
    const rnd = lcg(99);
    shadow(g, 78, 52, 140, 80);
    // the horse and groom, front-centre
    g.fillStyle(0xf7f3ea);
    g.fillEllipse(78, 34, 22, 40);
    g.fillCircle(78, 12, 7);
    g.fillStyle(0xc0392b);
    g.fillRoundedRect(68, 26, 20, 18, 4);
    g.fillStyle(0xf1c40f);
    g.fillRect(68, 30, 20, 2);
    g.fillRect(68, 38, 20, 2);
    g.fillStyle(0xc0392b);
    g.fillCircle(78, 34, 6);
    g.fillStyle(0xf1c40f);
    g.fillCircle(78, 31, 4);
    // the band and the crowd
    const cols = [0xffffff, 0x8e44ad, 0xe67e22, 0x27ae60, 0xe74c3c, 0x2980b9];
    for (let i = 0; i < 18; i++) {
      const x = 12 + rnd() * 132;
      const y = 50 + rnd() * 42;
      if (Math.abs(x - 78) < 16 && y < 60) continue;
      g.fillStyle(cols[i % cols.length]);
      g.fillRoundedRect(x - 5, y - 4, 10, 10, 3);
      g.fillStyle(rnd() < 0.5 ? PAL.skin : PAL.skinDark);
      g.fillCircle(x, y - 6, 3.5);
    }
    // a drum and a trumpet
    g.fillStyle(0x8b5a2b);
    g.fillCircle(34, 78, 7);
    g.fillStyle(0xf3ead8);
    g.fillCircle(34, 78, 4.5);
    g.lineStyle(3, 0xf1c40f);
    g.lineBetween(118, 70, 132, 60);
    g.fillStyle(0xf1c40f);
    g.fillCircle(134, 58, 4);
    // confetti
    for (let i = 0; i < 24; i++) {
      g.fillStyle(cols[i % cols.length], 0.9);
      g.fillRect(rnd() * 156, rnd() * 100, 2, 2);
    }
  });

  /* ------------------------------------------------------------ road hazards */

  tex(scene, 'pothole', 40, 30, (g) => {
    g.fillStyle(0x2b2b30);
    g.fillPoints([
      { x: 6, y: 10 }, { x: 14, y: 3 }, { x: 26, y: 2 }, { x: 36, y: 8 }, { x: 38, y: 18 },
      { x: 30, y: 27 }, { x: 16, y: 28 }, { x: 5, y: 22 },
    ], true);
    g.fillStyle(0x151518);
    g.fillPoints([
      { x: 10, y: 12 }, { x: 16, y: 6 }, { x: 26, y: 6 }, { x: 33, y: 11 }, { x: 33, y: 19 },
      { x: 27, y: 24 }, { x: 16, y: 24 }, { x: 9, y: 19 },
    ], true);
    g.fillStyle(0x3d4a55, 0.8);
    g.fillEllipse(22, 17, 12, 6);
    g.fillStyle(0xffffff, 0.35);
    g.fillEllipse(19, 15, 4, 2);
  });

  tex(scene, 'breaker', 240, 14, (g) => {
    g.fillStyle(0xf1c40f);
    g.fillRect(0, 0, 240, 14);
    g.fillStyle(PAL.autoBlack);
    for (let x = -10; x < 250; x += 26) g.fillPoints([{ x, y: 0 }, { x: x + 13, y: 0 }, { x: x + 3, y: 14 }, { x: x - 10, y: 14 }], true);
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(0, 0, 240, 2);
    g.fillStyle(0x000000, 0.35);
    g.fillRect(0, 12, 240, 2);
  });

  tex(scene, 'water', 160, 76, (g) => {
    g.fillStyle(0x3d6f94, 0.6);
    g.fillEllipse(80, 38, 156, 70);
    g.fillStyle(0x4a7fa3, 0.55);
    g.fillEllipse(80, 38, 140, 58);
    g.lineStyle(1.5, 0x9fd1f0, 0.7);
    for (const [x, y, w] of [[40, 30, 30], [90, 22, 36], [120, 46, 28], [60, 52, 34]]) g.strokeEllipse(x, y, w, w * 0.35);
    g.fillStyle(0xffffff, 0.45);
    g.fillEllipse(52, 24, 10, 3);
    g.fillEllipse(110, 50, 8, 2.5);
  });

  /* ------------------------------------------------------------ people */

  const clothes = [0xe74c3c, 0x27ae60, 0x8e44ad, 0xf39c12];
  clothes.forEach((c, i) => {
    tex(scene, `pax${i}`, 26, 32, (g) => {
      shadow(g, 13, 24, 14, 6);
      g.fillStyle(0x2c3e50);
      g.fillRect(9, 24, 3, 6);
      g.fillRect(14, 24, 3, 6);
      g.fillStyle(c);
      g.fillRoundedRect(7, 12, 12, 14, 4);
      if (i % 2 === 1) {
        // a sari drape
        g.fillStyle(0xffffff, 0.35);
        g.fillTriangle(7, 26, 19, 12, 19, 26);
      }
      const skin = i % 2 === 0 ? PAL.skin : PAL.skinDark;
      g.fillStyle(skin);
      g.fillCircle(13, 7, 5);
      // raised arm
      g.lineStyle(3, skin);
      g.lineBetween(18, 14, 24, 4);
      g.fillCircle(24, 4, 2);
      // hair
      g.fillStyle(0x1c1c1e);
      g.fillEllipse(13, 4, 9, 5);
    });
  });

  /* ------------------------------------------------------------ signs */

  tex(scene, 'stopsign', 60, 50, (g) => {
    g.fillStyle(0x9a9a9a);
    g.fillRect(28, 20, 4, 30);
    g.fillStyle(0x1e8449);
    g.fillRoundedRect(2, 2, 56, 22, 4);
    g.fillStyle(0x27ae60);
    g.fillRoundedRect(4, 4, 52, 18, 3);
    g.lineStyle(2, 0xffffff, 0.9);
    g.strokeRoundedRect(3, 3, 54, 20, 3);
  });

  tex(scene, 'landmark', 68, 46, (g) => {
    g.fillStyle(0x9a9a9a);
    g.fillRect(32, 24, 4, 22);
    g.fillStyle(0x1f2d3d);
    g.fillRoundedRect(2, 2, 64, 24, 3);
    g.lineStyle(2, 0xecf0f1);
    g.strokeRoundedRect(3, 3, 62, 22, 3);
  });

  /* ------------------------------------------------------------ scenery */

  tex(scene, 'tree', 44, 44, (g) => {
    shadow(g, 22, 22, 36, 30);
    g.fillStyle(0x1b5e20);
    g.fillCircle(22, 22, 18);
    g.fillStyle(0x2e7d32);
    g.fillCircle(18, 19, 13);
    g.fillCircle(27, 24, 11);
    g.fillStyle(0x43a047, 0.8);
    g.fillCircle(17, 16, 6);
    g.fillStyle(0x5d4037);
    g.fillCircle(22, 23, 3);
  });

  tex(scene, 'tree2', 36, 36, (g) => {
    shadow(g, 18, 18, 30, 24);
    g.fillStyle(0x556b2f);
    g.fillCircle(18, 18, 15);
    g.fillStyle(0x6b8e23);
    g.fillCircle(15, 15, 10);
    g.fillStyle(0x8fbc4a, 0.7);
    g.fillCircle(13, 13, 4);
    g.fillStyle(0x5d4037);
    g.fillCircle(18, 19, 2.5);
  });

  tex(scene, 'lamp', 16, 32, (g) => {
    g.fillStyle(0x6d6d72);
    g.fillRect(6, 4, 4, 26);
    g.fillStyle(0xfff3b0, 0.35);
    g.fillCircle(8, 6, 8);
    g.fillStyle(0xfff3b0);
    g.fillCircle(8, 6, 4);
  });

  tex(scene, 'shop', 52, 36, (g) => {
    shadow(g, 26, 18, 46, 30);
    g.fillStyle(0xd7ccc8);
    g.fillRoundedRect(3, 3, 46, 30, 3);
    g.fillStyle(0xbcaaa4);
    g.fillRect(3, 3, 46, 10);
    // striped awning on the road-facing side
    for (let x = 3; x < 49; x += 8) {
      g.fillStyle(((x - 3) / 8) % 2 === 0 ? 0xe74c3c : 0xfafafa);
      g.fillRect(x, 26, 8, 8);
    }
    g.fillStyle(0x5d4037);
    g.fillRect(21, 14, 10, 12);
  });

  tex(scene, 'shop2', 52, 36, (g) => {
    shadow(g, 26, 18, 46, 30);
    g.fillStyle(0xcfd8dc);
    g.fillRoundedRect(3, 3, 46, 30, 3);
    g.fillStyle(0x90a4ae);
    g.fillRect(3, 3, 46, 10);
    for (let x = 3; x < 49; x += 8) {
      g.fillStyle(((x - 3) / 8) % 2 === 0 ? 0x2980b9 : 0xfafafa);
      g.fillRect(x, 26, 8, 8);
    }
    g.fillStyle(0xf1c40f);
    g.fillRect(8, 15, 14, 8);
  });

  tex(scene, 'chai', 34, 30, (g) => {
    shadow(g, 17, 15, 28, 22);
    g.fillStyle(0x2980b9);
    g.fillRoundedRect(4, 4, 26, 20, 3);
    g.fillStyle(0x1f618d);
    g.fillRect(4, 4, 26, 4);
    g.fillStyle(0xbdbdbd);
    g.fillCircle(17, 15, 4);
    g.fillStyle(PAL.skin);
    g.fillCircle(8, 27, 2.5);
    g.fillCircle(26, 27, 2.5);
    g.fillStyle(PAL.skinDark);
    g.fillCircle(17, 28, 2.5);
  });

  tex(scene, 'hoarding', 56, 26, (g) => {
    g.fillStyle(0x6d6d72);
    g.fillRect(6, 16, 3, 10);
    g.fillRect(47, 16, 3, 10);
    g.fillStyle(0xfafafa);
    g.fillRoundedRect(2, 2, 52, 16, 2);
    g.fillStyle(0xe74c3c);
    g.fillRect(5, 5, 20, 10);
    g.fillStyle(0xf1c40f);
    g.fillRect(27, 5, 24, 4);
    g.fillStyle(0x2c3e50);
    g.fillRect(27, 11, 18, 3);
  });

  tex(scene, 'auto-stand', 30, 34, (g) => {
    g.fillStyle(0x6d6d72);
    g.fillRect(13, 14, 4, 20);
    g.fillStyle(PAL.autoYellow);
    g.fillRoundedRect(2, 2, 26, 14, 2);
    g.fillStyle(PAL.autoBlack);
    g.fillRoundedRect(7, 5, 16, 8, 3);
  });

  /* ------------------------------------------------------------ particles */

  tex(scene, 'dot', 8, 8, (g) => {
    g.fillStyle(0xffffff);
    g.fillCircle(4, 4, 4);
  });
}

/** Scenery that scrolls past on the verges, with spawn weights. */
export const SCENERY: { key: string; weight: number; sideOffset: number }[] = [
  { key: 'tree', weight: 30, sideOffset: 30 },
  { key: 'tree2', weight: 20, sideOffset: 26 },
  { key: 'lamp', weight: 18, sideOffset: 12 },
  { key: 'shop', weight: 12, sideOffset: 34 },
  { key: 'shop2', weight: 10, sideOffset: 34 },
  { key: 'chai', weight: 10, sideOffset: 24 },
  { key: 'hoarding', weight: 8, sideOffset: 34 },
  { key: 'auto-stand', weight: 6, sideOffset: 20 },
];
