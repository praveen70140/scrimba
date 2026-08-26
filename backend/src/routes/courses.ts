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
