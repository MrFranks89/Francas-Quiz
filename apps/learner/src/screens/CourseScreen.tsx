import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  canAccessModule,
  completeLesson,
  createProgress,
  type Progress,
} from '@formazione/learning-engine';
import { usePalette } from '@formazione/civis-ui/src/ThemeProvider';
import { useStyles } from '@formazione/civis-ui/src/comune/stili';
import { TESTO } from '@formazione/civis-ui/src/tema';
import { Btn } from '@formazione/civis-ui/src/comune/Btn';
import { Card } from '@formazione/civis-ui/src/comune/Card';
import { ProgressBar } from '@formazione/civis-ui/src/comune/ProgressBar';
import { SlideStep } from '@formazione/civis-ui/src/lezione/SlideStep';
import { course, loadProgress, saveProgress, resetProgress } from '../state/course';
import { slidePerCivis } from '../state/slide';
import { fontiDellaSlide } from '../state/fonti';
import { SourceNote } from '../components/SourceNote';
import { SezioneEsame } from '../components/SezioneEsame';
import { Avviso } from '../components/lettore';
import { BannerTipoSlide, BarraSlideSegmentata, RigaModulo } from '../components/SocrateCorso';
import type { Course } from '@formazione/contracts';

// Il lettore legge da sé titolo e testi delle slide: a SlideStep passa sempre
// `onTesti`, così il pulsante altoparlante (voce sostituita, senza effetto)
// non viene disegnato. Vedi packages/civis-ui/__tests__/nostri/SlideStep.lettore.test.tsx.
const nessunaLettura = () => {};

export function CourseScreen({
  currentCourse = course,
  kind = 'demo',
}: {
  currentCourse?: Course;
  kind?: 'demo' | 'draft' | 'published' | 'imported';
}) {
  const course = currentCourse;
  const C = usePalette(),
    s = useStyles();
  const [progress, setProgress] = useState<Progress>(createProgress(course)),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const [active, setActive] = useState(course.modules[0].id),
    [saving, setSaving] = useState(false),
    // Cambia a ogni «Azzera»: rimonta SezioneEsame e ne svuota le risposte in corso.
    [epoca, setEpoca] = useState(0);
  // Lezione aperta e slide corrente.
  const [openLesson, setOpenLesson] = useState<string | null>(null),
    [slideIndex, setSlideIndex] = useState(0);
  useEffect(() => {
    let live = true;
    loadProgress(course)
      .then((p) => {
        if (live) setProgress(p);
      })
      .catch((e) => {
        if (live) setError(String(e.message));
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [course]);
  async function update(next: Progress): Promise<boolean> {
    setSaving(true);
    setError('');
    try {
      await saveProgress(next);
      setProgress(next);
      return true;
    } catch {
      setError('Salvataggio non riuscito. Riprova prima di proseguire.');
      return false;
    } finally {
      setSaving(false);
    }
  }
  const module = course.modules.find((m) => m.id === active)!;
  const unlocked = canAccessModule(course, progress, module.id),
    exam = module.exam;
  const lessonsDone = module.lessons.every((l) => progress.completedLessonIds.includes(l.id));
  const totalLessons = course.modules.flatMap((m) => m.lessons).length;
  function chooseModule(id: string) {
    setActive(id);
    setOpenLesson(null);
  }
  function openAt(lessonId: string) {
    setOpenLesson(lessonId);
    setSlideIndex(0);
  }
  function nextSlide(lessonId: string, count: number) {
    if (!ready || saving) return;
    if (slideIndex < count - 1) {
      setSlideIndex(slideIndex + 1);
      return;
    }
    setOpenLesson(null);
    if (!progress.completedLessonIds.includes(lessonId)) {
      try {
        void update(completeLesson(course, progress, lessonId));
      } catch (e) {
        setError(String(e));
      }
    }
  }
  const notice =
    kind === 'demo'
      ? 'Corso dimostrativo sintetico · contenuti e fonti di esempio. Serve a provare lezioni, valutazione Civis e sbarramento; non deriva dai tuoi documenti.'
      : kind === 'published'
        ? 'Corso pubblicato sul server locale · contenuto revisionato.'
        : kind === 'draft'
          ? 'Bozza AI da revisionare · non pubblicata. Verifica testi, risposte e riferimenti alle fonti.'
          : 'Corso importato da JSON · contenuto fornito dall’utente, non generato durante questa sessione.';
  return (
    <View style={{ gap: 18, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      <View style={{ gap: 6 }}>
        <Text style={s.eyebrow}>Corso</Text>
        <Text style={[s.slideHeading, { marginBottom: 0 }]}>{course.title}</Text>
        <Text style={[s.slideBody, { fontSize: TESTO.corpo, lineHeight: 24, marginBottom: 0 }]}>
          {course.description}
        </Text>
      </View>
      <Avviso
        testo={notice}
        colore={kind === 'draft' ? C.scenario : kind === 'demo' ? C.indigoLight : C.teal}
      />
      <View style={{ gap: 4 }}>
        <ProgressBar
          current={progress.completedLessonIds.length}
          total={totalLessons}
          color={C.green}
        />
        <Text style={{ color: C.textDim, fontSize: TESTO.minuscolo }}>
          {progress.completedLessonIds.length}/{totalLessons} lezioni completate · progressi salvati
          su questo dispositivo
        </Text>
      </View>
      {!!error && <Avviso testo={error} errore />}
      <View style={{ gap: 8 }}>
        <Text style={s.eyebrow}>Moduli</Text>
        <View style={{ gap: 8 }}>
          {course.modules.map((m, i) => {
            const available = canAccessModule(course, progress, m.id);
            const doneCount = m.lessons.filter((l) =>
              progress.completedLessonIds.includes(l.id),
            ).length;
            const allModDone = m.lessons.length > 0 && doneCount === m.lessons.length;
            const examPassed = m.exam
              ? progress.attempts.some((a) => a.examId === m.exam!.id && a.passed)
              : true;
            return (
              <RigaModulo
                key={m.id}
                modulo={m}
                indice={i}
                available={available}
                completed={available && allModDone && examPassed}
                selezionato={m.id === active}
                doneCount={doneCount}
                disabled={!ready || !available || saving}
                onPress={() => chooseModule(m.id)}
              />
            );
          })}
        </View>
      </View>
      {unlocked &&
        module.lessons.map((lesson, li) => {
          const done = progress.completedLessonIds.includes(lesson.id);
          if (openLesson === lesson.id) {
            const index = Math.min(slideIndex, lesson.slides.length - 1),
              slide = lesson.slides[index];
            return (
              <Card key={lesson.id}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                    gap: 12,
                  }}
                >
                  <Text style={[s.eyebrow, { flexShrink: 1 }]}>
                    {lesson.title} · slide {index + 1} / {lesson.slides.length}
                  </Text>
                  <Pressable
                    onPress={() => setOpenLesson(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Chiudi la lezione"
                    hitSlop={8}
                  >
                    <Text
                      style={{ color: C.textDim, fontSize: TESTO.minuscolo, fontWeight: '700' }}
                    >
                      Chiudi
                    </Text>
                  </Pressable>
                </View>
                <BarraSlideSegmentata
                  slides={lesson.slides}
                  currentIndex={index}
                  onSelect={setSlideIndex}
                />
                <BannerTipoSlide slide={slide} />
                <SlideStep
                  key={slide.id}
                  step={slidePerCivis(slide)}
                  onNext={() => nextSlide(lesson.id, lesson.slides.length)}
                  moduleColor={C.indigo}
                  onTesti={nessunaLettura}
                />
                {index > 0 && (
                  <Pressable
                    onPress={() => setSlideIndex(index - 1)}
                    accessibilityRole="button"
                    accessibilityLabel="Slide precedente"
                    hitSlop={8}
                    style={{ alignSelf: 'center', marginTop: 2 }}
                  >
                    <Text style={{ color: C.textDim, fontSize: TESTO.piccolo, fontWeight: '700' }}>
                      ← Slide precedente
                    </Text>
                  </Pressable>
                )}
                <SourceNote
                  key={`fonte-${slide.id}`}
                  fonti={fontiDellaSlide(course, slide)}
                  dimostrativa={kind === 'demo'}
                />
              </Card>
            );
          }
          return (
            <Card key={lesson.id}>
              <Text style={s.eyebrow}>
                Lezione {li + 1} · {lesson.slides.length} slide
              </Text>
              <Text
                style={{
                  color: C.text,
                  fontSize: TESTO.corpoGrande,
                  fontWeight: '800',
                  marginTop: 4,
                  marginBottom: 4,
                }}
              >
                {lesson.title}
              </Text>
              <Text
                style={{
                  color: done ? C.greenText : C.textDim,
                  fontSize: TESTO.minuscolo,
                  fontWeight: '700',
                  marginBottom: 12,
                }}
              >
                {done ? '✓ Lezione completata' : 'Da completare'}
              </Text>
              <Btn
                label={done ? 'Rivedi la lezione' : 'Inizia la lezione'}
                primary={!done}
                color={C.indigo}
                disabled={!ready || saving}
                onPress={() => openAt(lesson.id)}
              />
            </Card>
          );
        })}
      {exam && (
        <SezioneEsame
          key={`${module.id}:${epoca}`}
          course={course}
          exam={exam}
          progress={progress}
          lessonsDone={lessonsDone}
          ready={ready}
          saving={saving}
          onSalva={update}
          onErrore={setError}
        />
      )}
      <Btn
        label={kind === 'demo' ? 'Azzera il corso dimostrativo' : 'Azzera i progressi locali'}
        disabled={saving || !ready}
        onPress={() => {
          setSaving(true);
          resetProgress(course)
            .then((p) => {
              setProgress(p);
              chooseModule(course.modules[0].id);
              setEpoca((e) => e + 1);
              setError('');
            })
            .catch(() => setError('Impossibile azzerare i progressi.'))
            .finally(() => setSaving(false));
        }}
      />
    </View>
  );
}
