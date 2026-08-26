import { Hono } from 'hono';
import { db } from '../db';
import { authMiddleware, JwtPayload } from '../middleware/auth';

type Env = { Variables: { user: JwtPayload } };
const progressRouter = new Hono<Env>();

progressRouter.post('/:lessonId', authMiddleware, async (c) => {
  const lessonId = c.req.param('lessonId');
  if (!lessonId) return c.json({ error: 'Missing lessonId' }, 400);
  const user = c.get('user');
  const { completed } = await c.req.json();

  if (typeof completed !== 'boolean') {
    return c.json({ error: 'completed must be a boolean' }, 400);
  }

  const lesson = await db.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) {
    return c.json({ error: 'Lesson not found' }, 404);
  }

  try {
    const progress = await db.progress.upsert({
      where: { user_id_lesson_id: { user_id: user.sub, lesson_id: lessonId } },
      update: { completed, completed_at: completed ? new Date() : null },
      create: { 
        user_id: user.sub, 
        lesson_id: lessonId, 
        completed, 
        completed_at: completed ? new Date() : null 
      }
    });
    return c.json(progress);
  } catch (e) {
    return c.json({ error: 'Failed to update progress' }, 500);
  }
});

export { progressRouter };
