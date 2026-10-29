import { z } from 'zod';
import { DIFFICOLTA, TIPI_DOMANDA } from './tipi';

const id = z.string().trim().min(1);
const text = z.string().trim().min(1);
const refs = z.array(id).min(1);
// `kind` è facoltativo con predefinito 'single': i corsi scritti prima dei tipi restano validi.
// I campi di presentazione (situation, sentence, wrong) valgono ciascuno per un solo tipo:
// le regole per tipo sono in tipi.ts e le applica CourseSchema (course.ts).
export const QuestionSchema = z.object({
  id, moduleId: id, lessonId: id, kind: z.enum(TIPI_DOMANDA).default('single'), prompt: text,
  situation: text.optional(), sentence: text.optional(), wrong: text.optional(),
  difficulty: z.enum(DIFFICOLTA).optional(),
  // `rationale`: perché l'opzione è (o non è) quella giusta, il `perche` di Civis.
  options: z.array(z.object({ id, text, rationale: text.optional() })).min(2),
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
