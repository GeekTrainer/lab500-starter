// main.ts — boots the auth gate, then initializes Hydra on the canvas.
// Everything else (UI, copilot wiring, visuals, etc.) is yours to build.

import { showLoginGate } from './auth.js';
import { initHydra } from './hydra.js';
import { mountStatusDisplay, setHydraStatus } from './status-display.js';

async function main(): Promise<void> {
  // 1. Block until the user is signed in to Copilot.
  await showLoginGate();

  // 2. Mount the landing status panel (Copilot SDK + Hydra readout) so the
  //    starter app visibly confirms it booted. Interaction happens in the
  //    Copilot CLI, not here.
  const app = document.getElementById('app');
  if (app) mountStatusDisplay(app);

  // 3. Attach Hydra to the canvas. After this, Hydra's globals (`osc`,
  //    `noise`, `shape`, etc.) are available on `window`.
  const canvas = document.getElementById('hydra') as HTMLCanvasElement | null;
  if (canvas && app) {
    setHydraStatus(app, 'active', 'loading…');
    try {
      initHydra(canvas);
      setHydraStatus(app, 'ok', 'loaded');
    } catch (err) {
      setHydraStatus(app, 'error', String(err));
    }
  }
}

void main();
