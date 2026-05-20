// hydra.ts — sets up a Hydra-synth instance on the given canvas.
//
// `initHydra(canvas)` creates the instance and resizes it to fill the
// viewport. After init, the global Hydra functions (`osc`, `noise`,
// `shape`, `gradient`, `solid`, `src`, `o0..o3`, `s0..s3`, `render`,
// `speed`, `bpm`, `width`, `height`, `time`, `mouse`) are available on
// `window` because we pass `makeGlobal: true`.
//
// No sample visual is rendered. Call `evalHydra(code)` with a string of
// Hydra code (ending in `.out()`) to draw something.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHydra = any;

import HydraSynth from 'hydra-synth';

let hydra: AnyHydra | null = null;

export function initHydra(canvas: HTMLCanvasElement): void {
  if (hydra) return;
  hydra = new HydraSynth({
    canvas,
    detectAudio: false,
    enableStreamCapture: false,
    makeGlobal: true,
    width: canvas.width,
    height: canvas.height,
  });

  const onResize = (): void => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    hydra?.setResolution?.(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);
  onResize();

  hydra.setFPS?.(30);
}

export function evalHydra(code: string): { ok: boolean; error?: string } {
  if (!hydra) return { ok: false, error: 'hydra not initialized' };
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const fn = new Function(code);
    fn();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
