import { z } from 'zod';

export const LessonSchema = z.object({
  id: z.string().uuid(),
  order: z.number().int(),
  title: z.string(),
  duration_ms: z.number().int().optional(),
  has_challenge: z.boolean().default(false),
  published: z.boolean().default(false).optional(),
});

export type Lesson = z.infer<typeof LessonSchema>;

export const CourseSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
  title: z.string(),
  description: z.string(),
  author: z.string(),
  tags: z.array(z.string()),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  created_at: z.string().datetime(),
  published: z.boolean().default(false),
  lessons: z.array(LessonSchema),
});

export type Course = z.infer<typeof CourseSchema>;

export const ScrimEventSchema = z.discriminatedUnion('type', [
  z.object({ t: z.number().int(), type: z.literal('file_open'), path: z.string() }),
  z.object({ t: z.number().int(), type: z.literal('file_focus'), path: z.string() }),
  z.object({
    t: z.number().int(),
    type: z.literal('edit'),
    path: z.string(),
    range: z.tuple([
      z.tuple([z.number().int(), z.number().int()]),
      z.tuple([z.number().int(), z.number().int()]),
    ]),
    text: z.string(),
  }),
  z.object({
    t: z.number().int(),
    type: z.literal('cursor'),
    path: z.string(),
    line: z.number().int(),
    col: z.number().int(),
  }),
  z.object({
    t: z.number().int(),
    type: z.literal('selection'),
    path: z.string(),
    anchor: z.tuple([z.number().int(), z.number().int()]),
    active: z.tuple([z.number().int(), z.number().int()]),
  }),
  z.object({
    t: z.number().int(),
    type: z.literal('scroll'),
    path: z.string(),
    top_line: z.number().int(),
  }),
  z.object({ t: z.number().int(), type: z.literal('terminal_cmd'), text: z.string() }),
  z.object({ t: z.number().int(), type: z.literal('terminal_out'), text: z.string() }),
  z.object({ t: z.number().int(), type: z.literal('browser_navigate'), url: z.string() }),
  z.object({
    t: z.number().int(),
    type: z.literal('chapter'),
    title: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    t: z.number().int(),
    type: z.literal('challenge'),
    id: z.string(),
    prompt: z.string(),
    hint: z.string().optional(),
    test_cmd: z.string().optional(),
    time_limit_s: z.number().int().nullable().optional(),
  }),
]);

export type ScrimEvent = z.infer<typeof ScrimEventSchema>;

export const LessonScrimSchema = z.object({
  version: z.number().int(),
  meta: z.object({
    id: z.string(),
    title: z.string(),
    duration_ms: z.number().int().optional(),
    language_hint: z.string().optional(),
    runtime_hint: z.string().optional(),
  }),
  workspace: z.object({
    files: z.record(z.string(), z.string()),
  }),
  media: z.object({
    audio: z.object({ file: z.string(), duration_ms: z.number().int() }).optional(),
    webcam: z.object({ file: z.string(), duration_ms: z.number().int() }).optional(),
    browser_preview: z.object({ file: z.string(), duration_ms: z.number().int() }).optional(),
  }).optional(),
  events: z.array(ScrimEventSchema),
});

export type LessonScrim = z.infer<typeof LessonScrimSchema>;
