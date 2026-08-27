const fs = require('fs');
const content = fs.readFileSync('backend/src/routes/courses.ts', 'utf8');

const newContent = content.replace(
  `  // Get current max order_index
  const maxLesson = await db.lesson.findFirst({
    where: { course_id: courseId },
    orderBy: { order_index: 'desc' }
  });
  const order_index = maxLesson ? maxLesson.order_index + 1 : 0;

  const lesson = await db.lesson.create({
    data: {
      course_id: courseId,
      title,
      order_index,
    }
  });`,
  `  // Use a transaction to safely compute the next order_index
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
  });`
);

fs.writeFileSync('backend/src/routes/courses.ts', newContent);
