import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { logger } from 'hono/logger';
import { authController } from './features/auth/auth.controller.ts';
import { userController } from './features/user/user.controller.ts';
import { connectDB } from './lib/db.ts';
import type { AppEnv } from './lib/auth.ts';
import { requireAuth, requireRole } from './middleware/auth.ts';

const app = new Hono<AppEnv>();

app.use('*', logger());

// Cookie auth means the browser sends credentials automatically, so a
// third-party page could trigger authenticated requests. This checks Origin.
app.use('*', csrf());

app.get('/', (c) => c.json({ service: 'yoga-cms-backend', status: 'ok' }));
app.get('/health', (c) => c.json({ status: 'healthy', uptime: process.uptime() }));

app.route('/api/auth', authController);
app.route('/api/users', userController);

// Example of a protected, admin-only route.
app.get('/api/admin/ping', requireAuth, requireRole('admin'), (c) =>
  c.json({ ok: true, you: c.get('user') }),
);

await connectDB();
console.log('Connected to MongoDB');

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});

export default app;
