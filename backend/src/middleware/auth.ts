import { Context, Next } from 'hono';
import * as jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub: string; // user ID
  email: string;
  role: string;
}

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return secret;
};

export const authMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as JwtPayload;
    c.set('user', payload);
  } catch (e) {
    return c.json({ error: 'Invalid token' }, 401);
  }
  
  await next();
};
