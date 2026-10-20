import { CourseSchema, type Course } from '@formazione/contracts';
import { gradeQuestions, type Answer } from './adapter';
import { valutaTentativo } from './grade';

export type Attempt = { id: string; examId: string; answers: Answer[]; correct: number; total: number; passed: boolean };
export type Progress = { courseId: string; courseVersion: number; completedLessonIds: string[]; attempts: Attempt[] };
export function createProgress(course: Course): Progress {
  CourseSchema.parse(course);
  return { courseId: course.id, courseVersion: course.version, completedLessonIds: [], attempts: [] };
}
function check(course: Course, progress: Progress) {
  CourseSchema.parse(course);
  if (progress.courseId !== course.id || progress.courseVersion !== course.version) throw new Error('Course version mismatch');
}
export function canAccessModule(course: Course, progress: Progress, moduleId: string): boolean {
  check(course, progress);
  const index = course.modules.findIndex(m => m.id === moduleId);
  if (index < 0) throw new Error('Unknown module');
  return course.modules.slice(0, index).every(m => m.lessons.every(l => progress.completedLessonIds.includes(l.id))
    && (!m.exam || m.exam.mode === 'practice' || progress.attempts.some(a => a.examId === m.exam!.id && a.passed)));
}
export function completeLesson(course: Course, progress: Progress, lessonId: string): Progress {
  check(course, progress);
  const module = course.modules.find(m => m.lessons.some(l => l.id === lessonId));
  if (!module) throw new Error('Unknown lesson');
  if (!canAccessModule(course, progress, module.id)) throw new Error('Module locked');
  return progress.completedLessonIds.includes(lessonId) ? progress
    : { ...progress, completedLessonIds: [...progress.completedLessonIds, lessonId] };
}
export function submitExam(course: Course, progress: Progress, examId: string, attemptId: string, answers: Answer[]): Progress {
  check(course, progress);
  if (!attemptId.trim()) throw new Error('Missing attempt id');
  const module = course.modules.find(m => m.exam?.id === examId);
  if (!module?.exam) throw new Error('Unknown exam');
  // Validate payload even on retries: invalid options and duplicate answers never disappear silently.
  const result = gradeQuestions(course, module.exam.questionIds, answers);
  const previous = progress.attempts.find(a => a.id === attemptId);
  if (previous) {
    const canonical = (items: Answer[]) => JSON.stringify([...items].sort((a, b) => a.questionId.localeCompare(b.questionId)));
    if (previous.examId !== examId || canonical(previous.answers) !== canonical(answers)) throw new Error('Attempt id conflict');
    return progress;
  }
  if (!canAccessModule(course, progress, module.id)) throw new Error('Module locked');
  if (!module.lessons.every(l => progress.completedLessonIds.includes(l.id))) throw new Error('Incomplete lessons');
  const attempts = progress.attempts.filter(a => a.examId === examId);
  if (module.exam.maxAttempts !== null && attempts.length >= module.exam.maxAttempts) throw new Error('Attempt limit reached');
  if (module.exam.mode === 'gate' && attempts.some(a => a.passed)) throw new Error('Gate already passed');
  const attempt: Attempt = { id: attemptId, examId, answers: answers.map(a => ({ ...a })), correct: result.correct,
    total: result.total, passed: valutaTentativo(result, module.exam).superato };
  return { ...progress, attempts: [...progress.attempts, attempt] };
}
