import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => {
  return c.text('Scrimba Clone Backend API');
});

export default {
  port: process.env.PORT || 3000,
  fetch: app.fetch,
};
