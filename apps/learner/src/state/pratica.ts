import {
  CorsoLeggibileSchema,
  sogliaMinima,
  type Course,
  type BranchQuizResponse,
} from '@formazione/contracts';

export { sogliaMinima };

export function corsoDiPratica(
  quiz: BranchQuizResponse,
  branchTitle: string,
): Course {
  const docId = quiz.extractionId || 'doc-practice';
  const sources =
    quiz.sources && quiz.sources.length > 0
      ? quiz.sources.map((s) => ({
          id: s.blockId,
          documentId: docId,
          page: null,
          label: s.ref || s.blockId,
          excerpt: s.ref || s.blockId,
        }))
      : [
          {
            id: 'source-practice',
            documentId: docId,
            page: null,
            label: branchTitle,
            excerpt: branchTitle,
          },
        ];

  const firstSourceId = sources[0].id;
  const questions = (quiz.questions || []).map((q, idx) => ({
    ...q,
    id: q.id || `q-${idx + 1}`,
    moduleId: q.moduleId || 'module-practice',
    lessonId: q.lessonId || 'lesson-practice',
    kind: q.kind || 'single',
    prompt: q.prompt || (q as unknown as { stem?: string }).stem || 'Domanda di verifica',
    options: (q.options || []).map((opt, oIdx) => ({
      id: opt.id || `opt-${oIdx + 1}`,
      text: opt.text || '',
      ...(opt.rationale ? { rationale: opt.rationale } : {}),
    })),
    correctOptionId: q.correctOptionId || (q.options && q.options[0]?.id) || 'opt-1',
    explanation: q.explanation || 'Spiegazione della risposta corretta.',
    sourceRefs: q.sourceRefs && q.sourceRefs.length > 0 ? q.sourceRefs : [firstSourceId],
  }));

  const questionIds = questions.map((q) => q.id);
  const minScore = Math.max(1, sogliaMinima(questions.length));

  const rawCourse: Course = {
    schemaVersion: 1,
    id: `practice-${quiz.quizId}`,
    version: 1,
    title: `Quiz: ${branchTitle}`,
    description: `Esercitazione mirata sul ramo: ${branchTitle}`,
    objectives: [`Verificare e consolidare la comprensione di: ${branchTitle}`],
    sources,
    modules: [
      {
        id: 'module-practice',
        title: branchTitle,
        lessons: [
          {
            id: 'lesson-practice',
            title: 'Introduzione all’esercitazione',
            slides: [
              {
                id: 'slide-practice-1',
                heading: branchTitle,
                body: 'Le domande di questa esercitazione provengono dalla mappa concettuale del documento.',
                highlight: '',
                sourceRefs: [firstSourceId],
              },
            ],
            questionIds,
          },
        ],
        exam: {
          id: 'exam-practice',
          questionIds,
          mode: 'practice',
          passingScore: minScore,
          maxAttempts: null,
        },
      },
    ],
    questions,
  };

  return CorsoLeggibileSchema.parse(rawCourse);
}
