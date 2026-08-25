import { Hono } from 'hono';

const authRouter = new Hono();

authRouter.post('/register', async (c) => {
  return c.json({ message: 'Register endpoint' });
});

authRouter.post('/login', async (c) => {
  return c.json({ token: 'mock-token', refresh: 'mock-refresh' });
});

authRouter.post('/refresh', async (c) => {
  return c.json({ token: 'mock-new-token' });
});

authRouter.delete('/logout', async (c) => {
  return c.json({ message: 'Logout successful' });
});

export { authRouter };
