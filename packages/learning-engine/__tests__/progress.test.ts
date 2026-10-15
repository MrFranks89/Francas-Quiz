import { readFileSync } from 'node:fs';
import { CourseSchema } from '@formazione/contracts';
import { adaptQuestions, gradeQuestions, createProgress, completeLesson, canAccessModule, submitExam } from '@formazione/learning-engine';
const sample = () => CourseSchema.parse(JSON.parse(readFileSync(new URL('../../contracts/fixtures/sample-course.json', import.meta.url), 'utf8')));
const correct = [{ questionId: 'question-1', optionId: 'option-1-a' }];
const wrong = [{ questionId: 'question-1', optionId: 'option-1-b' }];

it('grades through Civis with stable question and option IDs', () => {
  const course = sample();
  expect(adaptQuestions(course, ['question-2'])[0]).toMatchObject({ id: 'question-2', moduloId: 2, correct: 0 });
  expect(gradeQuestions(course, ['question-1'], correct)).toMatchObject({ correct: 1, grade: 10, total: 1 });
});
it('requires lessons and a passing gate, supports retry and preserves the old state', () => {
  const course = sample(); const initial = createProgress(course);
  expect(canAccessModule(course, initial, 'module-2')).toBe(false);
  expect(() => submitExam(course, initial, 'exam-1', 'attempt-1', correct)).toThrow('Incomplete');
  const completed = completeLesson(course, initial, 'lesson-1');
  const failed = submitExam(course, completed, 'exam-1', 'attempt-1', wrong);
  expect(canAccessModule(course, failed, 'module-2')).toBe(false);
  const passed = submitExam(course, failed, 'exam-1', 'attempt-2', correct);
  expect(canAccessModule(course, passed, 'module-2')).toBe(true);
  expect(completeLesson(course, passed, 'lesson-2').completedLessonIds).toHaveLength(2);
  expect(initial.completedLessonIds).toEqual([]); expect(completed.attempts).toEqual([]);
  expect(submitExam(course, passed, 'exam-1', 'attempt-2', correct)).toBe(passed);
  expect(() => submitExam(course, passed, 'exam-1', 'attempt-3', correct)).toThrow();
});
it('does not consume another attempt on duplicate submission, enforces retry limit', () => {
  const course = sample(); const ready = completeLesson(course, createProgress(course), 'lesson-1');
  const failed = submitExam(course, ready, 'exam-1', 'a', wrong);
  expect(submitExam(course, failed, 'exam-1', 'a', wrong)).toBe(failed);
  expect(() => submitExam(course, failed, 'exam-1', 'a', correct)).toThrow('conflict');
  const exhausted = submitExam(course, failed, 'exam-1', 'b', wrong);
  expect(() => submitExam(course, exhausted, 'exam-1', 'c', correct)).toThrow('limit');
});
it('practice exams do not block the next module and allow configured repeated attempts', () => {
  const course = sample(); course.modules[0].exam!.mode = 'practice'; course.modules[0].exam!.maxAttempts = null;
  const ready = completeLesson(course, createProgress(course), 'lesson-1');
  expect(canAccessModule(course, ready, 'module-2')).toBe(true);
  const first = submitExam(course, ready, 'exam-1', 'a', correct);
  expect(submitExam(course, first, 'exam-1', 'b', wrong).attempts).toHaveLength(2);
});
it('rejects unknown and duplicate answers, invalid options, stale versions and locked lessons', () => {
  const course = sample(); const initial = createProgress(course);
  const ready = completeLesson(course, initial, 'lesson-1');
  for (const answers of [[...correct, ...correct], [{ questionId: 'missing', optionId: 'x' }], [{ questionId: 'question-1', optionId: 'missing' }]]) {
    expect(() => submitExam(course, ready, 'exam-1', 'a', answers)).toThrow();
  }
  expect(() => completeLesson(course, initial, 'lesson-2')).toThrow('locked');
  expect(() => completeLesson({ ...course, version: 2 }, ready, 'lesson-1')).toThrow('version');
  expect(gradeQuestions(course, ['question-1'], [])).toMatchObject({ correct: 0, unanswered: 1 });
});
