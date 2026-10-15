import { z } from 'zod';

const id = z.string().trim().min(1);
const text = z.string().trim().min(1);
const refs = z.array(id).min(1);
export const QuestionSchema = z.object({
  id, moduleId: id, lessonId: id, prompt: text,
  options: z.array(z.object({ id, text })).min(2),
  correctOptionId: id, explanation: text, sourceRefs: refs,
});
export const CourseStructureSchema = z.object({
  schemaVersion: z.literal(1), id, version: z.number().int().min(1), title: text,
  description: text, objectives: z.array(text).min(1),
  sources: z.array(z.object({ id, documentId: id, page: z.number().int().min(1).nullable(), label: text, excerpt: text })).min(1),
  modules: z.array(z.object({
    id, title: text,
    lessons: z.array(z.object({ id, title: text,
      slides: z.array(z.object({ id, heading: text, body: text, highlight: z.string(), sourceRefs: refs })).min(1),
      questionIds: z.array(id),
    })).min(1),
    exam: z.object({ id, questionIds: z.array(id).min(1), mode: z.enum(['practice', 'gate']),
      passingScore: z.number().int().min(1), maxAttempts: z.number().int().min(1).nullable(),
    }).nullable(),
  })).min(1),
  questions: z.array(QuestionSchema),
});
export type Course = z.infer<typeof CourseStructureSchema>;
export type Question = z.infer<typeof QuestionSchema>;

// JSON Schema describes shape; CourseSchema additionally enforces cross references.
export const courseJsonSchema = z.toJSONSchema(CourseStructureSchema);
