import React, { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  descriviValutazione,
  displayOptions,
  submitExam,
  valutaTentativo,
  type Progress,
} from '@formazione/learning-engine';
import type { Course } from '@formazione/contracts';
import { usePalette } from '@formazione/civis-ui/src/ThemeProvider';
import { useStyles } from '@formazione/civis-ui/src/comune/stili';
import { TESTO } from '@formazione/civis-ui/src/tema';
import { Btn } from '@formazione/civis-ui/src/comune/Btn';
import { Card } from '@formazione/civis-ui/src/comune/Card';
import { riepilogoUltimoTentativo } from '../state/riepilogo';
import { completa, risposta } from '../state/risposte';
import type { CoppieAttive, RisposteInCorso } from '../state/risposte';
import { presentazione } from '../state/presentazione';
import { RiepilogoDomanda } from './ExamView';
import { DomandaEsame } from './DomandaEsame';
import { Avviso } from './lettore';

type Esame = NonNullable<Course['modules'][number]['exam']>;
// Costante: una domanda senza risposta riceve sempre lo stesso array (serve al memo).
const NESSUNA: (string | null)[] = [];
const RigaRiepilogo = memo(RiepilogoDomanda);

/**
 * Test e riepilogo di un modulo. Le risposte in corso vivono qui: un tocco
 * ridisegna questa sezione e una sola domanda, non l'intero lettore.
 * Il padre rimonta la sezione (key) al cambio di modulo e a «Azzera».
 * `onSalva` salva i progressi e dice se è andata bene; `onErrore` mostra l'errore.
 */
export function SezioneEsame({
  course,
  exam,
  progress,
  lessonsDone,
  ready,
  saving,
  onSalva,
  onErrore,
}: {
  course: Course;
  exam: Esame;
  progress: Progress;
  lessonsDone: boolean;
  ready: boolean;
  saving: boolean;
  onSalva: (next: Progress) => Promise<boolean>;
  onErrore: (messaggio: string) => void;
}) {
  const C = usePalette(),
    s = useStyles();
  const [answers, setAnswers] = useState<RisposteInCorso>({}),
    [coppiaAttiva, setCoppiaAttiva] = useState<CoppieAttive>({}),
    // Nuovo tentativo avviato dopo il riepilogo.
    [retrying, setRetrying] = useState(false);
  const attempts = useMemo(
    () => progress.attempts.filter((a) => a.examId === exam.id),
    [progress.attempts, exam.id],
  );
  const last = attempts.at(-1);
  const gatePassed = exam.mode === 'gate' && attempts.some((a) => a.passed);
  const exhausted = exam.maxAttempts !== null && attempts.length >= exam.maxAttempts;
  // Si risponde al primo tentativo, oppure dopo «Nuovo tentativo»; altrimenti si vede il riepilogo.
  const answering = lessonsDone && !gatePassed && !exhausted && (!last || retrying);
  const valutazione = last ? valutaTentativo(last, exam) : null;
  const righe = useMemo(
    () =>
      exam.questionIds.map((id) => {
        const q = course.questions.find((x) => x.id === id)!;
        const opzioni = displayOptions(course, exam.id, attempts.length, id).map((o) => ({
          id: o.id,
          text: o.text,
        }));
        return { id, q, pres: presentazione(q), opzioni };
      }),
    [course, exam, attempts.length],
  );
  const riepilogo = useMemo(
    () => (last && !answering ? riepilogoUltimoTentativo(course, exam, attempts) : []),
    [course, exam, attempts, last, answering],
  );
  const azzera = useCallback(() => {
    setAnswers({});
    setCoppiaAttiva({});
  }, []);
  const incompleta = righe.some((r) => !completa(r.q, answers[r.id]));

  async function consegna() {
    try {
      const risposte = righe
        .filter((r) => completa(r.q, answers[r.id]))
        .map((r) => risposta(r.q, answers[r.id]));
      const id = `attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const salvato = await onSalva(submitExam(course, progress, exam.id, id, risposte));
      if (!salvato) return; // salvataggio fallito: le risposte restano
      azzera();
      setRetrying(false);
    } catch (e) {
      onErrore(e instanceof Error ? e.message : 'Valutazione non riuscita.');
    }
  }

  return (
    <Card>
      <Text style={s.eyebrow}>
        {exam.mode === 'gate' ? 'Esame di sbarramento' : 'Test di controllo'}
      </Text>
      <Text style={{ color: C.textDim, fontSize: TESTO.minuscolo, marginTop: 4, marginBottom: 14 }}>
        Soglia: {exam.passingScore}/{exam.questionIds.length} risposte corrette ·{' '}
        {exam.maxAttempts === null
          ? 'tentativi illimitati'
          : `${attempts.length}/${exam.maxAttempts} tentativi usati`}
      </Text>
      {!lessonsDone && (
        <Avviso testo="Completa tutte le lezioni del modulo per sostenere il test." />
      )}
      {answering && (
        <>
          {righe.map((r, qi) => (
            <DomandaEsame
              key={r.id}
              q={r.q}
              numero={qi + 1}
              totale={righe.length}
              domanda={r.pres}
              opzioni={r.opzioni}
              scelte={answers[r.id] ?? NESSUNA}
              coppia={coppiaAttiva[r.id]}
              disabled={saving}
              setAnswers={setAnswers}
              setCoppiaAttiva={setCoppiaAttiva}
            />
          ))}
          <Btn
            label="Consegna il test"
            primary
            color={C.indigo}
            disabled={!ready || saving || incompleta}
            onPress={consegna}
          />
          {last && (
            <Pressable
              onPress={() => {
                setRetrying(false);
                azzera();
              }}
              accessibilityRole="button"
              accessibilityLabel="Torna al riepilogo"
              hitSlop={8}
              style={{ alignSelf: 'center' }}
            >
              <Text style={{ color: C.textDim, fontSize: TESTO.piccolo, fontWeight: '700' }}>
                Torna al riepilogo del tentativo precedente
              </Text>
            </Pressable>
          )}
        </>
      )}
      {last && valutazione && !answering && (
        <>
          <Text
            style={{
              color: valutazione.superato ? C.greenText : C.redText,
              fontSize: TESTO.occhiello,
              fontWeight: '800',
              letterSpacing: 1.1,
              marginBottom: 4,
            }}
          >
            {valutazione.superato ? 'TEST SUPERATO' : 'TEST NON SUPERATO'} · TENTATIVO{' '}
            {attempts.length}
          </Text>
          <Text accessibilityRole="header" style={[s.slideHeading, { marginBottom: 2 }]}>
            {descriviValutazione(valutazione)}
          </Text>
          <Text
            style={{ color: C.textDim, fontSize: TESTO.corpoPiccolo, marginBottom: 16 }}
          >{`${last.correct}/${last.total} risposte corrette${gatePassed ? ' · modulo successivo sbloccato' : ''}`}</Text>
          {riepilogo.map((riga, qi) => (
            <RigaRiepilogo key={riga.questionId} numero={qi + 1} riga={riga} />
          ))}
          {lessonsDone && !gatePassed && !exhausted && (
            <Btn
              label="Nuovo tentativo"
              primary
              color={C.indigo}
              disabled={!ready || saving}
              onPress={() => {
                azzera();
                setRetrying(true);
              }}
            />
          )}
        </>
      )}
      {exhausted && !gatePassed && (
        <View style={{ marginTop: 8 }}>
          <Avviso
            testo="Tentativi terminati. Il modulo successivo rimane bloccato. Nel corso dimostrativo puoi azzerare i progressi."
            errore
          />
        </View>
      )}
    </Card>
  );
}
