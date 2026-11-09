import { CourseStructureSchema, type Course } from './structure';
import { erroreSogliaMinima } from './soglia';
import { erroriQualitaTipo, erroriStrutturaTipo } from './tipi';
import type { RefinementCtx } from 'zod';

/**
 * Due livelli di validazione del corso (decisione dell'utente del 9 novembre 2026):
 * - CorsoLeggibileSchema, in lettura: forma, riferimenti incrociati, soglia, regole strutturali del
 *   tipo (erroriStrutturaTipo). Si usa per aprire un corso pubblicato, riprendere una bozza,
 *   importare un JSON, mostrare il corso al lettore: un corso salvato prima delle regole di qualità
 *   resta leggibile;
 * - CourseSchema, in scrittura: in più le regole di qualità di singola domanda (erroriQualitaTipo).
 *   Si usa quando si salva o si pubblica, e la pipeline del server le applica quando genera. Come
 *   Course in services/api/formazione_api/generation/corso.py, che il server usa solo in scrittura.
 */
function controlliCorso(course: Course, ctx: RefinementCtx, conQualita: boolean) {
  const error = (message: string) => ctx.addIssue({ code: 'custom', message });
  const unique = (ids: string[], label: string) => {
    if (new Set(ids).size !== ids.length) error(`Duplicate ${label}`);
  };
  unique(course.sources.map(s => s.id), 'source id');
  unique(course.modules.map(m => m.id), 'module id');
  unique(course.modules.flatMap(m => m.lessons.map(l => l.id)), 'lesson id');
  unique(course.modules.flatMap(m => m.lessons.flatMap(l => l.slides.map(s => s.id))), 'slide id');
  unique(course.modules.flatMap(m => m.exam ? [m.exam.id] : []), 'exam id');
  unique(course.questions.map(q => q.id), 'question id');
  const sources = new Set(course.sources.map(s => s.id));
  const checkRefs = (refs: string[]) => {
    unique(refs, 'source reference');
    for (const ref of refs) if (!sources.has(ref)) error(`Unknown source ${ref}`);
  };
  const questions = new Map(course.questions.map(q => [q.id, q]));
  for (const q of course.questions) {
    unique(q.options.map(o => o.id), `option id in ${q.id}`);
    if (q.correctOptionId !== undefined && !q.options.some(o => o.id === q.correctOptionId)) error(`Invalid correct option ${q.id}`);
    const errori = conQualita ? [...erroriStrutturaTipo(q), ...erroriQualitaTipo(q)] : erroriStrutturaTipo(q);
    for (const e of errori) error(`${e.messaggio} (${q.id})`);
    const module = course.modules.find(m => m.id === q.moduleId);
    const lesson = module?.lessons.find(l => l.id === q.lessonId);
    if (!lesson) error(`Invalid question owner ${q.id}`);
    else if (!lesson.questionIds.includes(q.id)) error(`Question missing from lesson ${q.id}`);
    checkRefs(q.sourceRefs);
  }
  for (const module of course.modules) {
    for (const lesson of module.lessons) {
      unique(lesson.questionIds, `lesson question reference ${lesson.id}`);
      for (const slide of lesson.slides) checkRefs(slide.sourceRefs);
      for (const id of lesson.questionIds) {
        const q = questions.get(id);
        if (!q || q.moduleId !== module.id || q.lessonId !== lesson.id) error(`Invalid lesson question ${id}`);
      }
    }
    if (module.exam) {
      unique(module.exam.questionIds, `exam question reference ${module.exam.id}`);
      if (module.exam.passingScore > module.exam.questionIds.length) error(`Passing score exceeds exam size ${module.exam.id}`);
      const sottoMinimo = erroreSogliaMinima(module.exam.passingScore, module.exam.questionIds.length);
      if (sottoMinimo) error(sottoMinimo);
      for (const id of module.exam.questionIds) {
        if (questions.get(id)?.moduleId !== module.id) error(`Invalid exam question ${id}`);
      }
    }
  }
}

export const CourseSchema = CourseStructureSchema.superRefine((course, ctx) => controlliCorso(course, ctx, true));
export const CorsoLeggibileSchema = CourseStructureSchema.superRefine((course, ctx) => controlliCorso(course, ctx, false));
