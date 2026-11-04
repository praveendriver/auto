/**
 * Typography.
 *
 * Phaser rasterises text to the canvas at creation time. If a web font hasn't
 * finished loading by then it silently falls back to the system font and
 * never re-renders — so `readyFonts()` must resolve before the game boots.
 * `font-display: block` in index.html keeps the DOM from flashing a fallback
 * in the meantime.
 */

/**
 * The wordmark, and nothing else. Honk is a COLRv1 chromatic display face: it
 * paints its own colours, so a `color` set alongside it has no effect. Its
 * MORF axis defaults to 15, which is the instance we want.
 */
export const DISPLAY = '"Honk", "Geist Pixel", ui-monospace, monospace';

/** Pixel face. HUD, numbers, buttons — anything that should read as UI. */
export const PIXEL = '"Geist Pixel", ui-monospace, monospace';

/** Humanist sans. Sentences people actually read. */
export const SANS = '"DM Sans", system-ui, -apple-system, sans-serif';

/**
 * Resolves once both families are usable. `document.fonts.ready` alone isn't
 * enough — it settles for fonts already requested, and a face that nothing has
 * used yet may not have started loading. Each weight is asked for explicitly.
 */
export async function readyFonts(): Promise<void> {
  if (!document.fonts?.load) return;
  // The second argument matters: a @font-face is only fetched when a character
  // in its unicode-range is actually requested. '₹' (U+20B9) lives in
  // latin-ext, so without asking for it that file stays unloaded and the
  // rupee sign — which is on every screen — silently falls back.
  const wanted: [string, string][] = [
    ['400 40px "Honk"', 'RIKSHA'],
    ['400 16px "Geist Pixel"', 'A₹←→'],
    ['400 16px "DM Sans"', 'A₹'],
    ['700 16px "DM Sans"', 'A₹'],
  ];
  try {
    // Never let a font failure stop the game from starting; a 2s ceiling
    // covers a bad connection without leaving anyone on a blank screen.
    await Promise.race([
      Promise.all(wanted.map(([f, text]) => document.fonts.load(f, text))).then(() => document.fonts.ready),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch {
    // Fall back to system fonts rather than failing to boot.
  }
}
