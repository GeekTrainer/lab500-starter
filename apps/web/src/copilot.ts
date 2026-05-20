// copilot.ts — typed WebSocket client for the /ws/agent route.
//
// Instantiate this with handlers that map each AgentEvent to whatever your UI
// should do (append to a chat log, show a thinking indicator, render tool
// activity, etc.). The starter doesn't wire it to any UI — that's yours.
//
// Usage:
//   const copilot = new CopilotConnection({
//     onReady: ({ model }) => console.log('connected:', model),
//     onToken: (text) => /* append streaming reply text */,
//     onStatus: (phase) => /* show "thinking" / "responding" / etc. */,
//     onDone: () => /* re-enable input */,
//     onError: (msg) => /* surface error */,
//     // ...
//   });
//   copilot.connect();
//   copilot.prompt('hello!');

import type { AgentEvent, ClientMessage, ServerMessage } from '@workshop/shared';

export type AgentHandlers = {
  onToken: (text: string) => void;
  onToolCall: (name: string, args: unknown) => void;
  onToolProgress: (name: string, message?: string) => void;
  onToolDone: (name: string, ok: boolean) => void;
  onStatus: (phase: 'thinking' | 'responding' | 'tool', label?: string) => void;
  onIntent: (text: string) => void;
  onReasoning: (reasoningId: string, delta: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  onReady: (info: { model?: string; reasoning?: boolean }) => void;
};

export class CopilotConnection {
  private ws: WebSocket | null = null;
  constructor(private handlers: AgentHandlers) {}

  connect(): void {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${window.location.host}/ws/agent`);
    this.ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        if (msg.type === 'ready') {
          this.handlers.onReady({ model: msg.model, reasoning: msg.reasoning });
        } else if (msg.type === 'event') {
          this.dispatch(msg.payload);
        }
      } catch (err) {
        this.handlers.onError(`bad ws message: ${String(err)}`);
      }
    });
    this.ws.addEventListener('close', () => {
      this.handlers.onError('Copilot connection closed.');
    });
    this.ws.addEventListener('error', () => {
      this.handlers.onError('Copilot connection error.');
    });
  }

  private dispatch(ev: AgentEvent): void {
    switch (ev.type) {
      case 'token':
        this.handlers.onToken(ev.text);
        break;
      case 'tool_call':
        this.handlers.onToolCall(ev.name, ev.args);
        break;
      case 'tool_progress':
        this.handlers.onToolProgress(ev.name, ev.message);
        break;
      case 'tool_done':
        this.handlers.onToolDone(ev.name, ev.ok);
        break;
      case 'status':
        this.handlers.onStatus(ev.phase, ev.label);
        break;
      case 'intent':
        this.handlers.onIntent(ev.text);
        break;
      case 'reasoning':
        this.handlers.onReasoning(ev.reasoningId, ev.delta);
        break;
      case 'done':
        this.handlers.onDone();
        break;
      case 'error':
        this.handlers.onError(ev.message);
        break;
    }
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // Add fields to `context` as your app grows — anything in here is forwarded
  // to the server and (optionally) into the prompt.
  prompt(prompt: string, context: Record<string, unknown> = {}): void {
    this.send({ type: 'prompt', payload: { prompt, context } });
  }

  cancel(): void {
    this.send({ type: 'cancel' });
  }
}
