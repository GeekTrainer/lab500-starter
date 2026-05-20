# Workshop starter

A minimal scaffold that handles the starter plumbing — [Copilot SDK][copilot-sdk] session, auth, WebSocket bridge, and [Hydra][hydra] canvas setup — so you can spend the workshop on the creative work.

## What's done for you

- **Copilot SDK** server with a working session, streaming event subscriptions, and a `/ws/agent` WebSocket route.
- **Auth gate** UI that runs `copilot auth login` and waits for sign-in before launching the app.
- **Hydra** installed and attached to a canvas. After init, Hydra's globals (`osc`, `noise`, `shape`, `gradient`, `solid`, `src`, `o0..o3`, `s0..s3`, `render`, `width`, `height`, `time`, etc.) are available on `window`.
- A typed `CopilotConnection` client with handlers for every assistant event (status, intent, reasoning, tokens, tool calls).
- A placeholder system prompt with a TODO.

## What you'll build

Everything else — chat UI, code editor, the protocol the model follows, visuals, music, whatever your project needs. Nothing is rendered into `<main id="app">` until you put something there.

## Prerequisites

- Node.js 20 or newer.
- The [Copilot CLI][copilot-cli] available on `PATH` (`npm i -g @github/copilot`). The starter spawns `copilot auth login` for the device-flow sign-in.

## Run it

```bash
npm install
npm run dev
```

Web app: <http://localhost:5173>. Server: <http://localhost:5174>.

## Where to start

| File | What it is |
| --- | --- |
| `apps/server/system-prompt.md` | The instructions the model sees. **Replace the TODO with your real prompt.** |
| `apps/server/src/system-prompt.ts` | Tiny loader that reads the markdown above. You usually won't touch this. |
| `apps/web/src/main.ts` | App boot. After auth + Hydra init, the rest is yours. |
| `apps/web/src/copilot.ts` | `CopilotConnection` — import this from your UI to talk to the assistant. |
| `apps/web/src/hydra.ts` | `initHydra(canvas)` and `evalHydra(code)` — drive visuals however you want. |
| `packages/shared/src/index.ts` | The full `AgentEvent` union — every kind of message the server can send. |
| `apps/server/src/agent.ts` | SDK session wiring. You usually won't need to touch this. |

## Layout

```
workshop-starter/
├── apps/
│   ├── web/          # browser app (Hydra canvas + auth gate, no UI yet)
│   └── server/       # Copilot SDK session + WebSocket bridge
├── packages/
│   └── shared/       # types shared by both
├── .mcp.json         # MCP servers (Playwright + Microsoft Learn) for AI tooling
└── README.md
```

## MCP servers

`.mcp.json` configures two [Model Context Protocol][mcp] servers any MCP-aware client (Copilot CLI, Claude Code, etc.) can use:

- **Playwright** — browser automation. Useful for letting an assistant drive your app while you build it.
- **Microsoft Learn** — fetch official Microsoft documentation.

## Verify

```bash
npm run typecheck
npm run build
```

[copilot-sdk]: https://github.com/github/copilot-sdk
[copilot-cli]: https://github.com/github/copilot-cli
[hydra]: https://hydra.ojack.xyz
[mcp]: https://modelcontextprotocol.io
