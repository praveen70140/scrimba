import { Hono } from 'hono';
import { authRouter } from './routes/auth';
import { coursesRouter } from './routes/courses';
import { lessonsRouter } from './routes/lessons';

const app = new Hono();

app.get('/', (c) => {
  return c.text('Scrimba Clone Backend API');
});

app.route('/auth', authRouter);
app.route('/courses', coursesRouter);
app.route('/lessons', lessonsRouter);

export default {
  port: process.env.PORT || 3000,
  fetch: app.fetch,
};
