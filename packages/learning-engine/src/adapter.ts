import { CourseSchema, type Course } from '@formazione/contracts';
import { valutaEsame, type DomandaEsame } from '@formazione/civis-engine';

export type Answer = { questionId: string; optionId: string };
export function adaptQuestions(course: Course, questionIds: string[]): DomandaEsame[] {
  CourseSchema.parse(course);
  if (new Set(questionIds).size !== questionIds.length) throw new Error('Duplicate question id');
  return questionIds.map(id => {
    const question = course.questions.find(q => q.id === id);
    if (!question) throw new Error(`Unknown question ${id}`);
    return { id: question.id, lezioneId: question.lessonId, stepIdx: 0,
      moduloId: course.modules.findIndex(m => m.id === question.moduleId) + 1,
      q: question.prompt, options: question.options.map(o => o.text),
      correct: question.options.findIndex(o => o.id === question.correctOptionId), explanation: question.explanation };
  });
}
export function gradeQuestions(course: Course, questionIds: string[], answers: Answer[]) {
  const adapted = adaptQuestions(course, questionIds);
  const seen = new Set<string>();
  for (const answer of answers) {
    if (seen.has(answer.questionId)) throw new Error('Duplicate answer');
    seen.add(answer.questionId);
    if (!questionIds.includes(answer.questionId)) throw new Error('Unknown answer question');
    const question = course.questions.find(q => q.id === answer.questionId)!;
    if (!question.options.some(o => o.id === answer.optionId)) throw new Error('Unknown answer option');
  }
  const result = valutaEsame(adapted, questionIds.map(id => {
    const answer = answers.find(a => a.questionId === id);
    return answer ? course.questions.find(q => q.id === id)!.options.findIndex(o => o.id === answer.optionId) : null;
  }));
  return { correct: result.corrette, total: result.totale, unanswered: result.senzaRisposta,
    grade: result.voto, rows: result.righe.map(r => ({ questionId: r.domanda.id, correct: r.corretta })) };
}
