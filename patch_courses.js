const fs = require('fs');
let file = fs.readFileSync('backend/src/routes/courses.ts', 'utf8');

// Replace the GET /:id route
const oldRoute = `coursesRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const course = await db.course.findFirst({
    where: { id, published: true },
    include: { lessons: { orderBy: { order_index: 'asc' } } }
  });

  if (!course) {
    return c.json({ error: 'Course not found' }, 404);
  }
  return c.json(course);
});`;

const newRoute = `coursesRouter.get('/:id', async (c) => {
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
});`;

if (file.includes('where: { id, published: true }')) {
  file = file.replace(oldRoute, newRoute);
  fs.writeFileSync('backend/src/routes/courses.ts', file);
  console.log('Patched');
} else {
  console.log('Not found');
}
