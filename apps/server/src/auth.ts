// auth.ts — wraps `copilot auth login` and streams device-flow prompts to the
// browser via Server-Sent Events. Also exposes /api/auth/logout.

import type { FastifyInstance } from 'fastify';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { refreshAuthState } from './health.js';

type LoginEvent =
  | { type: 'output'; text: string }
  | { type: 'prompt'; url: string; code?: string }
  | { type: 'done'; success: boolean }
  | { type: 'error'; message: string };

let activeProc: ChildProcessWithoutNullStreams | null = null;

// Heuristic parser for Copilot CLI auth output. We look for a github device
// URL and a one-time user code. Output formats may differ across versions, so
// we are forgiving.
function parsePrompt(line: string): { url?: string; code?: string } {
  const out: { url?: string; code?: string } = {};
  const urlMatch = line.match(/https:\/\/github\.com\/login\/device[^\s]*/);
  if (urlMatch) out.url = urlMatch[0];
  // Codes look like ABCD-1234 (4 alphanumerics, dash, 4 alphanumerics)
  const codeMatch = line.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/);
  if (codeMatch) out.code = codeMatch[1];
  return out;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/login', async (_req, reply) => {
    if (activeProc) {
      reply.code(409).send({ error: 'login already in progress' });
      return;
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (ev: LoginEvent): void => {
      reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    };

    let proc: ChildProcessWithoutNullStreams;
    try {
      // We rely on `copilot` being on PATH (the SDK's bundled copy is internal).
      // If unavailable, the user can install it via `npm i -g @github/copilot`
      // or use the user-installed CLI.
      proc = spawn('copilot', ['auth', 'login'], {
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      });
    } catch (err) {
      send({ type: 'error', message: `Could not spawn copilot CLI: ${String(err)}` });
      reply.raw.end();
      return;
    }
    activeProc = proc;

    let buf = '';
    const handleChunk = (chunk: Buffer): void => {
      const text = chunk.toString('utf8');
      buf += text;
      // Always forward raw text so the UI can show whatever the CLI says.
      send({ type: 'output', text });
      // Try to extract a URL/code from any newly-completed line.
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const parsed = parsePrompt(line);
        if (parsed.url) {
          send({ type: 'prompt', url: parsed.url, code: parsed.code });
        }
      }
      // Also try the trailing partial line (user code may be on its own line
      // without a trailing newline).
      const partial = parsePrompt(buf);
      if (partial.url) send({ type: 'prompt', url: partial.url, code: partial.code });
    };

    proc.stdout.on('data', handleChunk);
    proc.stderr.on('data', handleChunk);

    proc.on('close', async (code) => {
      activeProc = null;
      const success = code === 0;
      if (success) await refreshAuthState();
      send({ type: 'done', success });
      reply.raw.end();
    });

    proc.on('error', (err) => {
      activeProc = null;
      send({ type: 'error', message: String(err) });
      reply.raw.end();
    });

    // If the client disconnects, kill the child.
    _req.raw.on('close', () => {
      if (activeProc) {
        try {
          activeProc.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      }
    });
  });

  app.post('/api/auth/cancel', async () => {
    if (activeProc) {
      try {
        activeProc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      activeProc = null;
      return { ok: true, cancelled: true };
    }
    return { ok: true, cancelled: false };
  });
}
