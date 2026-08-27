import { Hono } from 'hono';
import { db } from '../db';
import { authMiddleware, JwtPayload } from '../middleware/auth';

type Env = { Variables: { user: JwtPayload } };
const coursesRouter = new Hono<Env>();

// Get all published courses
coursesRouter.get('/', async (c) => {
  const courses = await db.course.findMany({
    where: { published: true },
    include: { author: { select: { username: true } } },
    orderBy: { created_at: 'desc' }
  });
  return c.json(courses);
});

// Create a new course (requires auth)
coursesRouter.post('/', authMiddleware, async (c) => {
  const user = c.get('user') as JwtPayload;
  const { title, description, tags, level } = await c.req.json();

  if (!title) {
    return c.json({ error: 'Title is required' }, 400);
  }

  const course = await db.course.create({
    data: {
      author_id: user.sub,
      title,
      description,
      tags: tags || [],
      level
    }
  });

  return c.json(course, 201);
});

// Get a specific course
coursesRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const course = await db.course.findFirst({
    where: { id, published: true },
    include: { lessons: { orderBy: { order_index: 'asc' } } }
  });

  if (!course) {
    return c.json({ error: 'Course not found' }, 404);
  }
  return c.json(course);
});

export { coursesRouter };

// Create a new lesson in a course
coursesRouter.post('/:id/lessons', authMiddleware, async (c) => {
  const courseId = c.req.param('id');
  const user = c.get('user');
  const { title } = await c.req.json();

  if (!title) {
    return c.json({ error: 'Title is required' }, 400);
  }

  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return c.json({ error: 'Course not found' }, 404);
  }

  if (course.author_id !== user.sub) {
    return c.json({ error: 'Only the author can create lessons' }, 403);
  }

  // Use a transaction to safely compute the next order_index
  const lesson = await db.$transaction(async (tx) => {
    const maxLesson = await tx.lesson.findFirst({
      where: { course_id: courseId },
      orderBy: { order_index: 'desc' },
      select: { order_index: true }
    });
    const next_order = maxLesson ? maxLesson.order_index + 1 : 0;

    return tx.lesson.create({
      data: {
        course_id: courseId,
        title,
        order_index: next_order,
      }
    });
  }, {
    isolationLevel: 'Serializable'
  });

  return c.json(lesson, 201);
});
