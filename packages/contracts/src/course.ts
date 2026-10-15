import { CourseStructureSchema } from './structure';

export const CourseSchema = CourseStructureSchema.superRefine((course, ctx) => {
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
    if (!q.options.some(o => o.id === q.correctOptionId)) error(`Invalid correct option ${q.id}`);
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
      for (const id of module.exam.questionIds) {
        if (questions.get(id)?.moduleId !== module.id) error(`Invalid exam question ${id}`);
      }
    }
  }
});
