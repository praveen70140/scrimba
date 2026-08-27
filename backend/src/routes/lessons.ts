import { Hono } from 'hono';
import { db } from '../db';
import { authMiddleware, JwtPayload } from '../middleware/auth';
import { getPresignedGetUrl, getPresignedPutUrl } from '../s3';

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

  try {
    const scrim_url = lesson.scrim_key ? await getPresignedGetUrl(lesson.scrim_key) : null;
    const audio_url = lesson.video_key ? await getPresignedGetUrl(`${lesson.video_key.replace(/\\.[^./]+$/, '')}_audio.ogg`) : null;
    const video_url = lesson.video_key ? await getPresignedGetUrl(lesson.video_key) : null;
    const screen_url = lesson.screen_key ? await getPresignedGetUrl(lesson.screen_key) : null;

    return c.json({ scrim_url, audio_url, video_url, screen_url });
  } catch (error) {
    console.error('Error generating presigned GET URLs', error);
    return c.json({ error: 'Failed to generate download URLs' }, 500);
  }
});

lessonsRouter.post('/:id/upload-urls', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Missing id' }, 400);
  const user = c.get('user');

  let lesson = await db.lesson.findUnique({
    where: { id },
    include: { course: true }
  });

  if (!lesson) {
    return c.json({ error: 'Lesson not found' }, 404);
  }

  // Check ownership
  if (lesson.course.author_id !== user.sub) {
    return c.json({ error: 'Only the author can upload assets' }, 403);
  }

  // Generate keys if they don't exist
  if (!lesson.scrim_key || !lesson.video_key || !lesson.screen_key) {
    lesson = await db.lesson.update({
      where: { id },
      data: {
        scrim_key: lesson.scrim_key || `scrimba/${lesson.id}/lesson.scrim`,
        video_key: lesson.video_key || `scrimba/${lesson.id}/video.mp4`,
        screen_key: lesson.screen_key || `scrimba/${lesson.id}/screen.mp4` // we use screen_key for screen.mp4 right now
      },
      include: { course: true }
    });
  }

  try {
    const scrim_url = await getPresignedPutUrl(lesson.scrim_key!, 'application/json');
    const audio_url = await getPresignedPutUrl(`${lesson.video_key!.replace(/\\.[^./]+$/, '')}_audio.ogg`, 'audio/ogg');
    const video_url = await getPresignedPutUrl(lesson.video_key!, 'video/mp4');
    const screen_url = await getPresignedPutUrl(lesson.screen_key!, 'video/mp4');

    return c.json({ scrim_url, audio_url, video_url, screen_url });
  } catch (error) {
    console.error('Error generating presigned PUT URLs', error);
    return c.json({ error: 'Failed to generate upload URLs' }, 500);
  }
});

export { lessonsRouter };

lessonsRouter.post('/:id/publish', authMiddleware, async (c) => {
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

  if (lesson.course.author_id !== user.sub) {
    return c.json({ error: 'Only the author can publish the lesson' }, 403);
  }

  const updated = await db.lesson.update({
    where: { id },
    data: { published: true }
  });

  return c.json(updated);
});
