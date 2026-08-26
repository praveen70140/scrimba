import { Hono } from 'hono';
import { db } from '../db';
import { authMiddleware, JwtPayload } from '../middleware/auth';

type Env = { Variables: { user: JwtPayload } };
const enrollRouter = new Hono<Env>();

enrollRouter.post('/:courseId', authMiddleware, async (c) => {
  const courseId = c.req.param('courseId');
  if (!courseId) return c.json({ error: 'Missing courseId' }, 400);
  const user = c.get('user');

  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return c.json({ error: 'Course not found' }, 404);
  }

  try {
    const enrollment = await db.enrollment.upsert({
      where: { user_id_course_id: { user_id: user.sub, course_id: courseId } },
      update: {}, // do nothing if already enrolled
      create: { user_id: user.sub, course_id: courseId }
    });
    return c.json(enrollment, 201);
  } catch (e) {
    return c.json({ error: 'Failed to enroll' }, 500);
  }
});

export { enrollRouter };
