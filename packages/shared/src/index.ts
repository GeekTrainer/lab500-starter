// Shared types between the Copilot SDK server and the web client.
//
// You'll send `ClientMessage` from the browser and receive `ServerMessage`
// back. Each `ServerMessage` of type 'event' wraps an `AgentEvent` describing
// something the assistant did (started thinking, streamed a token, called a
// tool, finished, etc.). Use these for whatever UI you decide to build.

export type AgentRequest = {
  prompt: string;
  // Anything you want the assistant to know about the current editor state.
  // The starter leaves this open — add fields as your workshop project grows.
  context: Record<string, unknown>;
};

export type AgentEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_progress'; name: string; message?: string }
  | { type: 'tool_done'; name: string; ok: boolean }
  | { type: 'status'; phase: 'thinking' | 'responding' | 'tool'; label?: string }
  | { type: 'intent'; text: string }
  | { type: 'reasoning'; reasoningId: string; delta: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'prompt'; payload: AgentRequest }
  | { type: 'cancel' };

export type ServerMessage =
  | { type: 'event'; payload: AgentEvent }
  | { type: 'ready'; model?: string; reasoning?: boolean };

export type HealthStatus = {
  ok: boolean;
  copilotAuth: 'authenticated' | 'unauthenticated' | 'unknown';
  message?: string;
};
