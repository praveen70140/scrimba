const fs = require('fs');
let file = fs.readFileSync('backend/src/routes/courses.ts', 'utf8');

const oldGet = `coursesRouter.get('/', async (c) => {
  const courses = await db.course.findMany({
    where: { published: true },
    include: { author: { select: { username: true } } },
    orderBy: { created_at: 'desc' }
  });
  return c.json(courses);
});`;

const newGet = `coursesRouter.get('/', async (c) => {
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
});`;

file = file.replace(oldGet, newGet);
fs.writeFileSync('backend/src/routes/courses.ts', file);
