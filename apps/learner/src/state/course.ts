import AsyncStorage from '@react-native-async-storage/async-storage';
import { CourseSchema, type Course } from '@formazione/contracts';
import {
  createProgress,
  submitExam,
  completeLesson,
  type Progress,
} from '@formazione/learning-engine';
import sample from '../../../../packages/contracts/fixtures/sample-course.json';
export const course = CourseSchema.parse(sample);
const key = (course: Course) => `formazione:progress:${course.id}:v${course.version}`;
export async function loadProgress(current: Course = course): Promise<Progress> {
  const course = current;
  const raw = await AsyncStorage.getItem(key(course));
  if (!raw) return createProgress(course);
  const stored = JSON.parse(raw) as Progress;
  if (
    stored.courseId !== course.id ||
    stored.courseVersion !== course.version ||
    !Array.isArray(stored.completedLessonIds) ||
    !Array.isArray(stored.attempts)
  )
    throw new Error('Salvataggio incompatibile. Puoi azzerare il corso dimostrativo.');
  // Replay through the engine: storage is untrusted and cannot unlock modules by setting a flag.
  let progress = createProgress(course);
  for (const module of course.modules) {
    for (const lesson of module.lessons)
      if (stored.completedLessonIds.includes(lesson.id))
        progress = completeLesson(course, progress, lesson.id);
    for (const attempt of stored.attempts.filter((a) => a.examId === module.exam?.id))
      progress = submitExam(course, progress, attempt.examId, attempt.id, attempt.answers);
  }
  return progress;
}
export async function saveProgress(progress: Progress) {
  await AsyncStorage.setItem(
    `formazione:progress:${progress.courseId}:v${progress.courseVersion}`,
    JSON.stringify(progress),
  );
}
export async function resetProgress(current: Course = course) {
  await AsyncStorage.removeItem(key(current));
  return createProgress(current);
}
