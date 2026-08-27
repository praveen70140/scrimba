import { Hono } from 'hono';
import { db } from '../db';
import { authMiddleware, JwtPayload } from '../middleware/auth';

type Env = { Variables: { user: JwtPayload } };
const coursesRouter = new Hono<Env>();

// Get all published courses
coursesRouter.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');
  const skip = (page - 1) * limit;

  const [courses, total] = await Promise.all([
    db.course.findMany({
      where: { published: true },
      include: { author: { select: { username: true } } },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit
    }),
    db.course.count({ where: { published: true } })
  ]);

  return c.json({ data: courses, meta: { page, limit, total } });
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
  const course = await db.course.findUnique({
    where: { id },
    include: { lessons: { orderBy: { order_index: 'asc' } } }
  });

  if (!course) {
    return c.json({ error: 'Course not found' }, 404);
  }

  // If published, it's visible. If not published, check if user is author.
  if (!course.published) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ error: 'Course not found' }, 404);
    
    try {
      const jwt = require('jsonwebtoken');
      const token = authHeader.substring(7);
      const secret = process.env.JWT_SECRET;
      const payload = jwt.verify(token, secret) as any;
      if (payload.sub !== course.author_id) {
        return c.json({ error: 'Course not found' }, 404);
      }
    } catch {
      return c.json({ error: 'Course not found' }, 404);
    }
  }

  return c.json(course);
});

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
        course_id: courseId as string,
        title,
        order_index: next_order,
      }
    });
  }, {
    isolationLevel: 'Serializable'
  });

  return c.json(lesson, 201);
});

// Update a course
coursesRouter.put('/:id', authMiddleware, async (c) => {
  const courseId = c.req.param('id');
  const user = c.get('user');
  const { title, description, tags, level, published } = await c.req.json();

  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) return c.json({ error: 'Course not found' }, 404);
  if (course.author_id !== user.sub) return c.json({ error: 'Forbidden' }, 403);

  const updated = await db.course.update({
    where: { id: courseId },
    data: { title, description, tags, level, published }
  });
  return c.json(updated);
});

// Delete a course
coursesRouter.delete('/:id', authMiddleware, async (c) => {
  const courseId = c.req.param('id');
  const user = c.get('user');

  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) return c.json({ error: 'Course not found' }, 404);
  if (course.author_id !== user.sub) return c.json({ error: 'Forbidden' }, 403);

  await db.course.delete({ where: { id: courseId } });
  return c.json({ success: true });
});

// Reorder lessons
coursesRouter.put('/:id/lessons/order', authMiddleware, async (c) => {
  const courseId = c.req.param('id');
  const user = c.get('user');
  const { lessonIds } = await c.req.json(); // Array of lesson IDs in new order

  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) return c.json({ error: 'Course not found' }, 404);
  if (course.author_id !== user.sub) return c.json({ error: 'Forbidden' }, 403);

  if (!Array.isArray(lessonIds)) return c.json({ error: 'lessonIds must be an array' }, 400);

  await db.$transaction(
    lessonIds.map((id: string, index: number) =>
      db.lesson.update({
        where: { id },
        data: { order_index: index }
      })
    )
  );

  return c.json({ success: true });
});

export { coursesRouter };
