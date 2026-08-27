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

enrollRouter.get('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const enrollments = await db.enrollment.findMany({
    where: { user_id: user.sub },
    include: { course: { include: { lessons: true } } }
  });
  
  const progressList = await db.progress.findMany({
    where: { user_id: user.sub, completed: true }
  });
  const completedLessonIds = new Set(progressList.map(p => p.lesson_id));

  const result = enrollments.map(e => {
    let completedCount = 0;
    const lessons = e.course.lessons.map(l => {
      const isCompleted = completedLessonIds.has(l.id);
      if (isCompleted) completedCount++;
      return { ...l, completed: isCompleted };
    });
    return {
      ...e,
      course: { ...e.course, lessons },
      completedCount,
      totalCount: lessons.length
    };
  });
  
  return c.json(result);
});

enrollRouter.delete('/:courseId', authMiddleware, async (c) => {
  const courseId = c.req.param('courseId');
  const user = c.get('user');
  await db.enrollment.deleteMany({
    where: { user_id: user.sub, course_id: courseId }
  });
  return c.json({ success: true });
});

export { enrollRouter };
