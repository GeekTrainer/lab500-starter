import type { FastifyInstance } from 'fastify';
import type { ClientMessage, ServerMessage, AgentEvent } from '@workshop/shared';
import { CopilotClient, approveAll } from '@github/copilot-sdk';
import { SYSTEM_PROMPT } from './system-prompt.js';

// /ws/agent — one WebSocket per browser tab. The server owns the Copilot SDK
// session and forwards SDK events to the client as `AgentEvent` messages.
//
// Notable SDK config we set here so the model behaves well for a chat UI:
//   - `availableTools: []` — don't expose the Copilot CLI's built-in tools
//     (bash, edit, grep, etc.). Workshop apps don't need them and they
//     confuse the model into trying to use them instead of replying.
//   - `systemMessage: { mode: 'replace' }` — fully replace the CLI's default
//     prompt with ours (otherwise both are concatenated).
//   - `enableConfigDiscovery: false` — skip scanning for repo config files.
//   - `streaming: true` — receive `assistant.message_delta` events as the
//     model types, instead of waiting for the full reply.
//   - Prefer a reasoning-capable model so `assistant.reasoning_delta` and
//     `assistant.intent` events fire.
export async function registerAgentRoute(app: FastifyInstance): Promise<void> {
  app.get('/ws/agent', { websocket: true }, async (socket) => {
    let client: CopilotClient | null = null;
    let session: Awaited<ReturnType<CopilotClient['createSession']>> | null = null;

    const sendServer = (msg: ServerMessage): void => {
      try {
        socket.send(JSON.stringify(msg));
      } catch (err) {
        app.log.error(err, 'failed to send to ws');
      }
    };
    const sendEvent = (payload: AgentEvent): void => sendServer({ type: 'event', payload });

    try {
      client = new CopilotClient();
      await client.start();

      let model: string | undefined;
      let reasoningSupported = false;
      let pickedReasoningEffort: string | undefined;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const models: any[] = await (client as any).listModels?.();
        if (Array.isArray(models) && models.length > 0) {
          const reasoner = models.find(
            (m) => m?.capabilities?.supports?.reasoningEffort === true,
          );
          const picked = reasoner ?? models[0];
          model = picked?.id ?? picked?.name;
          reasoningSupported = !!reasoner;
          if (reasoner) {
            const efforts: string[] | undefined = reasoner?.supportedReasoningEfforts;
            pickedReasoningEffort =
              (efforts && (efforts.includes('low') ? 'low' : efforts[0])) ??
              reasoner?.defaultReasoningEffort;
          }
          app.log.info({ model, reasoningSupported, pickedReasoningEffort }, 'model selected');
        }
      } catch (err) {
        app.log.warn(err, 'listModels failed; using SDK default');
      }

      session = await client.createSession({
        ...(model ? { model } : {}),
        ...(pickedReasoningEffort
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({ reasoningEffort: pickedReasoningEffort } as any)
          : {}),
        systemMessage: { mode: 'replace', content: SYSTEM_PROMPT },
        availableTools: [],
        enableConfigDiscovery: false,
        streaming: true,
        onPermissionRequest: approveAll,
      });

      let streamedAny = false;
      let respondingSent = false;
      const toolNames = new Map<string, string>();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.on('assistant.message_delta', (event: any) => {
        const text: string = event?.data?.deltaContent ?? '';
        streamedAny = streamedAny || !!text;
        if (text) {
          if (!respondingSent) {
            sendEvent({ type: 'status', phase: 'responding' });
            respondingSent = true;
          }
          sendEvent({ type: 'token', text });
        }
      });

      // Non-streaming models only emit a final assistant.message; forward it
      // as a single token chunk if nothing streamed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.on('assistant.message', (event: any) => {
        const text: string = event?.data?.content ?? '';
        if (!streamedAny && text) {
          if (!respondingSent) {
            sendEvent({ type: 'status', phase: 'responding' });
            respondingSent = true;
          }
          sendEvent({ type: 'token', text });
        }
        streamedAny = false;
      });

      session.on('assistant.turn_start', () => {
        if (!respondingSent) {
          sendEvent({ type: 'status', phase: 'responding' });
          respondingSent = true;
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.on('assistant.intent', (event: any) => {
        const text: string = event?.data?.intent ?? '';
        if (text) sendEvent({ type: 'intent', text });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.on('assistant.reasoning_delta', (event: any) => {
        const delta: string = event?.data?.deltaContent ?? '';
        const reasoningId: string = event?.data?.reasoningId ?? 'default';
        if (delta) sendEvent({ type: 'reasoning', reasoningId, delta });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.on('tool.execution_start', (event: any) => {
        const name: string = event?.data?.toolName ?? 'unknown';
        const callId: string | undefined = event?.data?.toolCallId;
        if (callId) toolNames.set(callId, name);
        sendEvent({ type: 'status', phase: 'tool', label: name });
        sendEvent({ type: 'tool_call', name, args: event?.data?.arguments });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.on('tool.execution_progress', (event: any) => {
        const callId: string | undefined = event?.data?.toolCallId;
        const name = (callId && toolNames.get(callId)) || 'tool';
        const message: string | undefined = event?.data?.progressMessage;
        sendEvent({ type: 'tool_progress', name, message });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.on('tool.execution_complete', (event: any) => {
        const callId: string | undefined = event?.data?.toolCallId;
        const name = (callId && toolNames.get(callId)) || 'tool';
        const ok = !event?.data?.error;
        if (callId) toolNames.delete(callId);
        sendEvent({ type: 'tool_done', name, ok });
        respondingSent = false;
        sendEvent({ type: 'status', phase: 'thinking' });
      });

      session.on('session.idle', () => {
        respondingSent = false;
        sendEvent({ type: 'done' });
      });

      sendServer({ type: 'ready', model, reasoning: reasoningSupported });
    } catch (err) {
      app.log.error(err, 'failed to start Copilot SDK');
      sendEvent({
        type: 'error',
        message:
          'Could not initialize Copilot SDK. Run `copilot auth login`, or set GITHUB_TOKEN.',
      });
      socket.close();
      return;
    }

    socket.on('message', async (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        sendEvent({ type: 'error', message: 'Invalid JSON message' });
        return;
      }

      if (!session) return;
      try {
        if (msg.type === 'prompt') {
          sendEvent({ type: 'status', phase: 'thinking' });
          await session.send({ prompt: msg.payload.prompt });
        } else if (msg.type === 'cancel') {
          await session.abort();
        }
      } catch (err) {
        app.log.error(err, 'agent send failed');
        sendEvent({ type: 'error', message: String(err) });
      }
    });

    socket.on('close', async () => {
      try {
        await session?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        await client?.stop();
      } catch {
        /* ignore */
      }
    });
  });
}
