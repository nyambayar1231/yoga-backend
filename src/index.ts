import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { connectDB, syncIndexes } from './lib/db.ts';

await connectDB();
await syncIndexes();
console.log('Connected to MongoDB');

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});
