import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { registerHealthRoute } from './health.js';
import { registerAgentRoute } from './agent.js';
import { registerAuthRoutes } from './auth.js';

const PORT = Number(process.env.PORT ?? 5174);

const app = Fastify({
  logger: { transport: { target: 'pino-pretty' } },
});

await app.register(websocket);
await registerHealthRoute(app);
await registerAuthRoutes(app);
await registerAgentRoute(app);

try {
  await app.listen({ port: PORT, host: '127.0.0.1' });
  app.log.info(`server listening on http://127.0.0.1:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
