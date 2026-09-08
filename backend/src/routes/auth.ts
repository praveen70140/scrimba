import { Hono, Context, Next } from 'hono';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { db } from '../db';
import { JwtPayload } from '../middleware/auth';

const authRouter = new Hono<{ Variables: { user: JwtPayload } }>();

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET must be configured");
  return secret;
};

const rateLimitMap = new Map<string, { count: number, resetAt: number }>();
const rateLimitMiddleware = async (c: Context, next: Next) => {
  // Use the platform-provided client address; fall back to a constant so rate-limiting still works
  const ip = (c.req.raw as any).socket?.remoteAddress || c.req.header('x-forwarded-for') || 'unknown';
  const now = Date.now();

  // Evict expired entries to prevent unbounded memory growth
  for (const [key, rec] of rateLimitMap) {
    if (rec.resetAt < now) rateLimitMap.delete(key);
  }

  let record = rateLimitMap.get(ip);
  if (!record || record.resetAt < now) {
    record = { count: 0, resetAt: now + 60000 };
  }
  record.count++;
  rateLimitMap.set(ip, record);
  if (record.count > 10) return c.json({ error: 'Too many requests' }, 429);
  await next();
};

authRouter.post('/register', rateLimitMiddleware, async (c) => {
  const { email, username, password } = await c.req.json();
  
  if (!email || !username || !password) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // Validate JWT_SECRET before any database writes to avoid orphaned users
  let jwtSecret: string;
  try {
    jwtSecret = getJwtSecret();
  } catch (e: any) {
    return c.json({ error: 'Server configuration error' }, 500);
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
  const token = jwt.sign(payload, jwtSecret, { expiresIn: '7d' });

  return c.json({ token, user: { id: user.id, email: user.email, username: user.username } });
});

authRouter.post('/login', rateLimitMiddleware, async (c) => {
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

import { authMiddleware } from '../middleware/auth';
authRouter.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  const dbUser = await db.user.findUnique({
    where: { id: user.sub },
    select: { id: true, email: true, username: true, role: true }
  });
  if (!dbUser) return c.json({ error: 'User not found' }, 404);
  return c.json(dbUser);
});
