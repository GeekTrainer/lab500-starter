// status-display.ts — landing page status panel that confirms the starter
// app booted: shows Copilot SDK connection progress and Hydra load state.
// No prompt UI — interaction happens via the Copilot CLI, not this page.

import { CopilotConnection } from './copilot.js';

type State = 'pending' | 'active' | 'ok' | 'error';

type Line = {
  key: string;
  label: string;
  state: State;
  detail?: string;
};

export function mountStatusDisplay(container: HTMLElement): void {
  const lines: Line[] = [
    { key: 'copilot', label: 'Copilot SDK', state: 'pending', detail: 'connecting…' },
    { key: 'hydra', label: 'Hydra', state: 'pending', detail: 'loading…' },
  ];

  container.innerHTML = `
    <section class="status-display">
      <header class="status-display__header">
        <h1>workshop starter</h1>
        <p class="status-display__sub">Use the <strong>Copilot CLI</strong> in your terminal to build this app.</p>
      </header>
      <ul class="status-display__list" data-role="list"></ul>
    </section>
  `;

  const listEl = container.querySelector<HTMLElement>('[data-role="list"]')!;

  const render = (): void => {
    listEl.innerHTML = lines
      .map(
        (l) => `
          <li class="status-line status-line--${l.state}" data-key="${l.key}">
            <span class="status-line__icon" aria-hidden="true"></span>
            <span class="status-line__label">${l.label}</span>
            <span class="status-line__detail">${l.detail ?? ''}</span>
          </li>
        `,
      )
      .join('');
  };

  const update = (key: string, patch: Partial<Line>): void => {
    const line = lines.find((l) => l.key === key);
    if (!line) return;
    Object.assign(line, patch);
    render();
  };

  render();

  // Mark Copilot SDK as actively connecting.
  update('copilot', { state: 'active', detail: 'connecting…' });

  const copilot = new CopilotConnection({
    onReady: ({ model }) => {
      update('copilot', {
        state: 'ok',
        detail: model ? `connected · ${model}` : 'connected',
      });
    },
    onError: (msg) => {
      update('copilot', { state: 'error', detail: msg });
    },
    onStatus: () => {},
    onIntent: () => {},
    onToken: () => {},
    onReasoning: () => {},
    onToolCall: () => {},
    onToolProgress: () => {},
    onToolDone: () => {},
    onDone: () => {},
  });
  copilot.connect();

  // Hydra status is driven by main.ts via the returned setter.
  (container as HTMLElement & { __setHydraStatus?: (s: State, detail?: string) => void }).__setHydraStatus =
    (s, detail) => update('hydra', { state: s, detail });
}

export function setHydraStatus(
  container: HTMLElement,
  state: State,
  detail?: string,
): void {
  const setter = (container as HTMLElement & {
    __setHydraStatus?: (s: State, detail?: string) => void;
  }).__setHydraStatus;
  setter?.(state, detail);
}
