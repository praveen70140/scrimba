import { z } from "zod";

// --- COURSE SCHEMAS ---

export const LessonMetaSchema = z.object({
  id: z.string().uuid(),
  order: z.number().int(),
  title: z.string(),
  duration_ms: z.number().int().optional(),
  has_challenge: z.boolean().default(false)
});

export const CourseSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().default(1),
  title: z.string(),
  description: z.string().optional(),
  author: z.string(),
  tags: z.array(z.string()).default([]),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  created_at: z.string().datetime(),
  published: z.boolean().default(false),
  lessons: z.array(LessonMetaSchema).default([])
});

export type Course = z.infer<typeof CourseSchema>;
export type LessonMeta = z.infer<typeof LessonMetaSchema>;

// --- SCRIM EVENT SCHEMAS ---

export const BaseEventSchema = z.object({
  t: z.number().int(), // Absolute UNIX timestamp
});

export const FileOpenEventSchema = BaseEventSchema.extend({
  type: z.literal("file_open"),
  path: z.string()
});

export const FileFocusEventSchema = BaseEventSchema.extend({
  type: z.literal("file_focus"),
  path: z.string()
});

export const EditEventSchema = BaseEventSchema.extend({
  type: z.literal("edit"),
  path: z.string(),
  range: z.tuple([
    z.tuple([z.number().int(), z.number().int()]), // startLine, startChar
    z.tuple([z.number().int(), z.number().int()])  // endLine, endChar
  ]),
  text: z.string()
});

export const CursorEventSchema = BaseEventSchema.extend({
  type: z.literal("cursor"),
  path: z.string(),
  line: z.number().int(),
  col: z.number().int()
});

export const SelectionEventSchema = BaseEventSchema.extend({
  type: z.literal("selection"),
  path: z.string(),
  anchor: z.tuple([z.number().int(), z.number().int()]),
  active: z.tuple([z.number().int(), z.number().int()])
});

export const ScrollEventSchema = BaseEventSchema.extend({
  type: z.literal("scroll"),
  path: z.string(),
  top_line: z.number().int()
});

export const TerminalCmdEventSchema = BaseEventSchema.extend({
  type: z.literal("terminal_cmd"),
  text: z.string()
});

export const TerminalOutEventSchema = BaseEventSchema.extend({
  type: z.literal("terminal_out"),
  text: z.string()
});

export const BrowserNavigateEventSchema = BaseEventSchema.extend({
  type: z.literal("browser_navigate"),
  url: z.string()
});

export const ChapterEventSchema = BaseEventSchema.extend({
  type: z.literal("chapter"),
  title: z.string(),
  description: z.string().optional()
});

export const ChallengeEventSchema = BaseEventSchema.extend({
  type: z.literal("challenge"),
  id: z.string(),
  prompt: z.string(),
  hint: z.string().optional(),
  test_cmd: z.string(),
  time_limit_s: z.number().int().nullable().optional()
});

export const ScrimEventSchema = z.discriminatedUnion("type", [
  FileOpenEventSchema,
  FileFocusEventSchema,
  EditEventSchema,
  CursorEventSchema,
  SelectionEventSchema,
  ScrollEventSchema,
  TerminalCmdEventSchema,
  TerminalOutEventSchema,
  BrowserNavigateEventSchema,
  ChapterEventSchema,
  ChallengeEventSchema
]);

export type ScrimEvent = z.infer<typeof ScrimEventSchema>;

export const LessonScrimSchema = z.object({
  version: z.number().int(),
  meta: z.object({
    id: z.string(),
    title: z.string(),
    duration_ms: z.number().int().optional(),
    language_hint: z.string().optional(),
    runtime_hint: z.string().optional()
  }),
  workspace: z.object({
    files: z.record(z.string()) // path -> content
  }),
  events: z.array(ScrimEventSchema)
});

export type LessonScrim = z.infer<typeof LessonScrimSchema>;
