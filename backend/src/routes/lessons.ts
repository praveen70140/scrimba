import { Hono } from 'hono';

const lessonsRouter = new Hono();

lessonsRouter.get('/:id', async (c) => {
  const { id } = c.req.param();
  return c.json({ id, message: 'Lesson details' });
});

lessonsRouter.patch('/:id', async (c) => {
  const { id } = c.req.param();
  return c.json({ id, message: 'Lesson updated' });
});

lessonsRouter.delete('/:id', async (c) => {
  const { id } = c.req.param();
  return c.json({ id, message: 'Lesson deleted' });
});

lessonsRouter.post('/:id/upload-urls', async (c) => {
  const { id } = c.req.param();
  return c.json({
    scrim_url: 'mock-presigned-put-url',
    video_url: 'mock-presigned-put-url',
    timecodes_url: 'mock-presigned-put-url',
  });
});

lessonsRouter.get('/:id/download-urls', async (c) => {
  const { id } = c.req.param();
  return c.json({
    scrim_url: 'mock-presigned-get-url',
    video_url: 'mock-presigned-get-url',
    timecodes_url: 'mock-presigned-get-url',
  });
});

lessonsRouter.post('/:id/publish', async (c) => {
  const { id } = c.req.param();
  return c.json({ id, message: 'Lesson published' });
});

export { lessonsRouter };
