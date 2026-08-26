import { Hono } from 'hono';
import { db } from '../db';
import { authMiddleware, JwtPayload } from '../middleware/auth';
// Import MinIO client when implemented, for now we will just use a stub for presigned URLs
// import { s3Client } from '../s3'; 

type Env = { Variables: { user: JwtPayload } };
const lessonsRouter = new Hono<Env>();

lessonsRouter.get('/:id/download', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Missing id' }, 400);
  const user = c.get('user');

  const lesson = await db.lesson.findUnique({
    where: { id },
    include: { course: true }
  });

  if (!lesson) {
    return c.json({ error: 'Lesson not found' }, 404);
  }

  // Check enrollment
  const enrollment = await db.enrollment.findUnique({
    where: { user_id_course_id: { user_id: user.sub, course_id: lesson.course_id } }
  });

  if (!enrollment && lesson.course.author_id !== user.sub) {
    return c.json({ error: 'Not enrolled in this course' }, 403);
  }

  // In a real app we'd generate presigned URLs using aws-sdk / S3Client
  // For now we return stub paths that would match a local server or proxy
  const storageBaseUrl = process.env.STORAGE_PUBLIC_URL || 'http://localhost:9000';
  return c.json({
    scrim_url: `${storageBaseUrl}/scrimba/${lesson.scrim_key}`,
    video_url: `${storageBaseUrl}/scrimba/${lesson.video_key}`,
    timecodes_url: `${storageBaseUrl}/scrimba/${lesson.timecodes_key}`
  });
});

export { lessonsRouter };
