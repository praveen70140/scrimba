import { Hono } from 'hono';

const coursesRouter = new Hono();

coursesRouter.get('/', async (c) => {
  return c.json({ courses: [] });
});

coursesRouter.get('/:id', async (c) => {
  const { id } = c.req.param();
  return c.json({ id, message: 'Course details' });
});

coursesRouter.post('/', async (c) => {
  return c.json({ message: 'Course created' }, 201);
});

coursesRouter.patch('/:id', async (c) => {
  const { id } = c.req.param();
  return c.json({ id, message: 'Course updated' });
});

coursesRouter.delete('/:id', async (c) => {
  const { id } = c.req.param();
  return c.json({ id, message: 'Course deleted' });
});

export { coursesRouter };
