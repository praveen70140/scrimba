import { Hono } from 'hono';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { db } from '../db';
import { JwtPayload } from '../middleware/auth';

const authRouter = new Hono();

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET must be configured");
  return secret;
};

authRouter.post('/register', async (c) => {
  const { email, username, password } = await c.req.json();
  
  if (!email || !username || !password) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const existing = await db.user.findFirst({
    where: { OR: [{ email }, { username }] }
  });

  if (existing) {
    return c.json({ error: 'User already exists' }, 400);
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await db.user.create({
    data: { email, username, password_hash: hash }
  });

  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });

  return c.json({ token, user: { id: user.id, email: user.email, username: user.username } });
});

authRouter.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  
  if (!email || !password) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });

  return c.json({ token, user: { id: user.id, email: user.email, username: user.username } });
});

export { authRouter };
