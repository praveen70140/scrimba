import { Context, Next } from 'hono';
import * as jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub: string; // user ID
  email: string;
  role: string;
}

export const authMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.substring(7);
  const secret = process.env.JWT_SECRET || 'fallback-secret-for-dev';

  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    c.set('user', payload);
    await next();
  } catch (e) {
    return c.json({ error: 'Invalid token' }, 401);
  }
};
