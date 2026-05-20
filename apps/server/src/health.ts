import type { FastifyInstance } from 'fastify';
import type { HealthStatus } from '@workshop/shared';
import { CopilotClient } from '@github/copilot-sdk';

let cachedAuthState: HealthStatus['copilotAuth'] = 'unknown';

async function probeCopilotAuth(): Promise<HealthStatus['copilotAuth']> {
  // Lightweight probe: try to start the client; if it fails we assume unauthenticated.
  try {
    const client = new CopilotClient();
    await client.start();
    await client.stop();
    return 'authenticated';
  } catch {
    return 'unauthenticated';
  }
}

export async function refreshAuthState(): Promise<HealthStatus['copilotAuth']> {
  cachedAuthState = await probeCopilotAuth().catch(() => 'unknown');
  return cachedAuthState;
}

export function buildHealth(): HealthStatus {
  return {
    ok: true,
    copilotAuth: cachedAuthState,
    message:
      cachedAuthState === 'authenticated'
        ? 'Copilot SDK ready.'
        : 'Sign in with GitHub to enable Copilot.',
  };
}

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  // Probe once at startup so the first /health call is fast.
  await refreshAuthState();

  app.get('/api/health', async (): Promise<HealthStatus> => buildHealth());
  app.get('/api/auth/status', async (): Promise<HealthStatus> => {
    await refreshAuthState();
    return buildHealth();
  });
}
