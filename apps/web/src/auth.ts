import type { HealthStatus } from '@workshop/shared';

export type LoginEvent =
  | { type: 'output'; text: string }
  | { type: 'prompt'; url: string; code?: string }
  | { type: 'done'; success: boolean }
  | { type: 'error'; message: string };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  if (!text) {
    throw new Error('empty response');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('invalid JSON response');
  }
}

async function fetchJsonWithRetry<T>(
  url: string,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 8;
  const delayMs = opts.delayMs ?? 400;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchJson<T>(url);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchHealth(): Promise<HealthStatus> {
  // Server may still be starting (tsx watch restart, cold start). Retry briefly.
  return fetchJsonWithRetry<HealthStatus>('/api/health');
}

export async function refreshAuth(): Promise<HealthStatus> {
  return fetchJsonWithRetry<HealthStatus>('/api/auth/status', { attempts: 4 });
}

export type LoginHandlers = {
  onOutput?: (text: string) => void;
  onPrompt: (url: string, code?: string) => void;
  onDone: (success: boolean) => void;
  onError: (msg: string) => void;
};

export function startLogin(handlers: LoginHandlers): EventSource {
  const es = new EventSource('/api/auth/login');
  es.addEventListener('message', (ev: MessageEvent<string>) => {
    let parsed: LoginEvent;
    try {
      parsed = JSON.parse(ev.data) as LoginEvent;
    } catch (err) {
      handlers.onError(`bad event: ${String(err)}`);
      return;
    }
    switch (parsed.type) {
      case 'output':
        handlers.onOutput?.(parsed.text);
        break;
      case 'prompt':
        handlers.onPrompt(parsed.url, parsed.code);
        break;
      case 'done':
        handlers.onDone(parsed.success);
        es.close();
        break;
      case 'error':
        handlers.onError(parsed.message);
        es.close();
        break;
    }
  });
  es.addEventListener('error', () => {
    // Fired on close too — don't double-report unless still open.
    if (es.readyState === EventSource.CLOSED) return;
    handlers.onError('connection lost');
  });
  return es;
}

export async function cancelLogin(): Promise<void> {
  await fetch('/api/auth/cancel', { method: 'POST' });
}

/**
 * Render a login overlay. Resolves when the user is authenticated or the
 * caller dismisses (currently we always wait for success).
 */
export function showLoginGate(): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    overlay.innerHTML = `
      <div class="login-card">
        <h1>workshop starter</h1>
        <p class="login-sub" id="login-sub">checking authentication…</p>
        <div id="login-body"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const sub = overlay.querySelector<HTMLElement>('#login-sub')!;
    const body = overlay.querySelector<HTMLElement>('#login-body')!;

    const renderUnauthenticated = (): void => {
      sub.textContent = 'sign in with github to enable copilot.';
      body.innerHTML = `
        <button id="login-btn" class="primary">Sign in with GitHub</button>
        <p class="hint">
          we'll start a device-flow login through the copilot cli.
          you'll get a one-time code to paste at github.com.
        </p>
      `;
      overlay.querySelector<HTMLButtonElement>('#login-btn')!.addEventListener('click', startFlow);
    };

    const renderPrompt = (url: string, code?: string): void => {
      sub.textContent = 'one more step…';
      body.innerHTML = `
        ${
          code
            ? `<div class="code-box">
                 <div class="code-label">your one-time code</div>
                 <div class="code">${code}</div>
                 <button id="copy-code">copy</button>
               </div>`
            : ''
        }
        <p class="hint">open the url below, paste the code, and authorize.</p>
        <a class="device-url" id="device-url" href="${url}" target="_blank" rel="noreferrer">${url}</a>
        <p class="status" id="poll-status">waiting for github…</p>
        <button id="cancel-btn" class="secondary">cancel</button>
      `;
      overlay.querySelector<HTMLButtonElement>('#copy-code')?.addEventListener('click', () => {
        if (code) navigator.clipboard.writeText(code).catch(() => undefined);
      });
      overlay.querySelector<HTMLButtonElement>('#cancel-btn')!.addEventListener('click', () => {
        cancelLogin().catch(() => undefined);
        renderUnauthenticated();
      });
    };

    const renderError = (msg: string, retry: 'gate' | 'login' = 'gate'): void => {
      sub.textContent = 'something went wrong.';
      body.innerHTML = `
        <p class="error">${msg}</p>
        <p class="hint">make sure the <code>copilot</code> cli is on your PATH and the backend is running.</p>
        <button id="retry-btn" class="primary">try again</button>
      `;
      overlay.querySelector<HTMLButtonElement>('#retry-btn')!.addEventListener('click', () => {
        if (retry === 'gate') {
          void runGateCheck();
        } else {
          startFlow();
        }
      });
    };

    const finish = (): void => {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, 350);
    };

    const startFlow = (): void => {
      sub.textContent = 'starting login…';
      body.innerHTML = `<p class="hint">launching device flow…</p>`;
      startLogin({
        onPrompt: (url, code) => renderPrompt(url, code),
        onDone: async (success) => {
          if (success) {
            try {
              const h = await refreshAuth();
              if (h.copilotAuth === 'authenticated') {
                sub.textContent = 'signed in.';
                body.innerHTML = '';
                finish();
                return;
              }
            } catch (err) {
              renderError(`could not confirm sign-in: ${String(err)}`, 'login');
              return;
            }
          }
          renderError('login did not complete.', 'login');
        },
        onError: (msg) => renderError(msg, 'login'),
      });
    };

    const runGateCheck = async (): Promise<void> => {
      sub.textContent = 'checking authentication…';
      body.innerHTML = `<p class="hint">connecting to the backend…</p>`;
      try {
        const h = await fetchHealth();
        if (h.copilotAuth === 'authenticated') {
          finish();
        } else {
          renderUnauthenticated();
        }
      } catch (err) {
        renderError(`backend unreachable: ${String(err)}`, 'gate');
      }
    };

    // Initial gate check
    void runGateCheck();
  });
}
