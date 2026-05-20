// main.ts — boots the auth gate, then initializes Hydra on the canvas.
// Everything else (UI, copilot wiring, visuals, etc.) is yours to build.

import { showLoginGate } from './auth.js';
import { initHydra } from './hydra.js';
// `CopilotConnection` is exported but not instantiated here. Import it from
// your own UI module once you decide how to render the chat.
// import { CopilotConnection } from './copilot.js';

async function main(): Promise<void> {
  // 1. Block until the user is signed in to Copilot.
  await showLoginGate();

  // 2. Attach Hydra to the canvas. After this, Hydra's globals (`osc`,
  //    `noise`, `shape`, etc.) are available on `window`.
  const canvas = document.getElementById('hydra') as HTMLCanvasElement | null;
  if (canvas) initHydra(canvas);

  // 3. Your turn. Render UI into <main id="app">, wire up a
  //    `CopilotConnection`, and decide what the assistant should do.
}

void main();
