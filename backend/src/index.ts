import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRouter } from './routes/auth';
import { coursesRouter } from './routes/courses';
import { lessonsRouter } from './routes/lessons';
import { enrollRouter } from './routes/enroll';
import { progressRouter } from './routes/progress';

import { initS3 } from './s3';

const app = new Hono();
initS3();

app.use('*', cors());

app.get('/', (c) => {
  return c.text('Scrimba Clone Backend API');
});

app.get('/health', async (c) => {
  try {
    const { db } = require('./db');
    await db.$queryRaw`SELECT 1`;
    return c.json({ status: 'ok', db: 'connected' });
  } catch (e: any) {
    return c.json({ status: 'error', error: e.message }, 500);
  }
});

app.route('/auth', authRouter);
app.route('/courses', coursesRouter);
app.route('/lessons', lessonsRouter);
app.route('/enroll', enrollRouter);
app.route('/progress', progressRouter);

const server = {
  port: process.env.PORT || 4000,
  fetch: app.fetch,
};

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  const { db } = require('./db');
  await db.$disconnect();
  process.exit(0);
});

export default server;
