import React, { useReducer } from 'react';
import { View, Text, TextInput, Switch } from 'react-native';
import { CourseSchema } from '@formazione/contracts';
import { draftRequest, type Draft } from '../api/generation';
import {
  createEditorState,
  editorReducer,
  erroriDomande,
  erroriSoglia,
  strictPositive,
} from '../state/editor';
import { DomandaEditor } from '../components/DomandaEditor';
import { Button, Card, Notice, styles } from '../components/ui';
export function EditorScreen({
  draft,
  onChange,
  onPreview,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onPreview: () => void;
}) {
  const [{ course, dirty, reviewed, busy, error }, dispatch] = useReducer(
    editorReducer,
    draft.course,
    createEditorState,
  );
  const published = draft.status === 'published';
  // Una soglia sotto il minimo blocca salvataggio e pubblicazione finché non viene corretta.
  const soglie = erroriSoglia(course);
  const sogliaNonValida = Object.keys(soglie).length > 0;
  // Lo stesso per le regole dei tipi di domanda: errore sotto il campo, salvataggio bloccato.
  const domande = erroriDomande(course);
  const bloccata = sogliaNonValida || Object.keys(domande).length > 0;
  function change(path: (string | number)[], value: unknown) {
    dispatch({ type: 'change', path, value });
  }
  function field(label: string, path: (string | number)[], value: string, multiline = false) {
    return (
      <View key={path.join('.')} style={{ gap: 6 }}>
        <Text style={styles.muted}>{label}</Text>
        <TextInput
          accessibilityLabel={label}
          editable={!busy && !published}
          style={[styles.input, multiline && { minHeight: 100, textAlignVertical: 'top' }]}
          multiline={multiline}
          value={value}
          onChangeText={(text) => change(path, text)}
        />
      </View>
    );
  }
  async function save() {
    dispatch({ type: 'start' });
    try {
      const validated = CourseSchema.safeParse(course);
      if (!validated.success)
        throw new Error(
          `Bozza non valida: ${validated.error.issues.map((i) => i.message).join('; ')}`,
        );
      const next = await draftRequest(`/drafts/${draft.id}`, 'PUT', {
        expectedRevision: draft.revision ?? 1,
        course: validated.data,
      });
      onChange(next);
      dispatch({ type: 'saved', course: next.course });
    } catch (e) {
      dispatch({
        type: 'error',
        message: e instanceof Error ? e.message : 'Salvataggio non riuscito.',
      });
    } finally {
      dispatch({ type: 'end' });
    }
  }
  async function publish() {
    dispatch({ type: 'start' });
    try {
      onChange(
        await draftRequest(`/drafts/${draft.id}/publish`, 'POST', {
          expectedRevision: draft.revision ?? 1,
          confirmReviewed: reviewed,
        }),
      );
    } catch (e) {
      dispatch({
        type: 'error',
        message: e instanceof Error ? e.message : 'Pubblicazione non riuscita.',
      });
    } finally {
      dispatch({ type: 'end' });
    }
  }
  return (
    <View style={{ gap: 20 }}>
      <Text style={styles.title}>{published ? 'Corso pubblicato' : 'Revisione della bozza'}</Text>
      <Notice
        text={`${published ? 'Snapshot pubblicato sul server locale' : 'Bozza non pubblicata'} · ID ${draft.id} · revisione ${draft.revision ?? 1}`}
      />
      {!!error && <Notice error text={error} />}
      {!!draft.warnings?.length && (
        <Card>
          <Text style={styles.subtitle}>Avvisi della bozza</Text>
          {draft.warnings.map((avviso, i) => (
            <Text key={i} style={styles.body}>
              • {avviso}
            </Text>
          ))}
        </Card>
      )}
      <Card>
        {field('Titolo del corso', ['title'], course.title)}
        {field('Descrizione', ['description'], course.description, true)}
      </Card>
      {course.modules.map((module, mi) => (
        <Card key={module.id}>
          <Text style={styles.subtitle}>{module.title}</Text>
          {module.lessons.map((lesson, li) => (
            <View key={lesson.id} style={{ gap: 16 }}>
              {lesson.slides.map((slide, si) => (
                <View key={slide.id} style={{ gap: 12 }}>
                  {field(
                    `Titolo slide ${mi + 1}.${li + 1}.${si + 1}`,
                    ['modules', mi, 'lessons', li, 'slides', si, 'heading'],
                    slide.heading,
                  )}
                  {field(
                    `Testo slide ${mi + 1}.${li + 1}.${si + 1}`,
                    ['modules', mi, 'lessons', li, 'slides', si, 'body'],
                    slide.body,
                    true,
                  )}
                  <Text style={styles.muted}>Fonti: {slide.sourceRefs.join(', ')}</Text>
                </View>
              ))}
            </View>
          ))}
          {module.exam && (
            <View style={{ gap: 12 }}>
              <Text style={styles.subtitle}>Regole esame</Text>
              <View style={styles.row}>
                <Button
                  label="Controllo"
                  secondary={module.exam.mode !== 'practice'}
                  disabled={busy || published}
                  onPress={() => change(['modules', mi, 'exam', 'mode'], 'practice')}
                />
                <Button
                  label="Sbarramento"
                  secondary={module.exam.mode !== 'gate'}
                  disabled={busy || published}
                  onPress={() => change(['modules', mi, 'exam', 'mode'], 'gate')}
                />
              </View>
              <Text style={styles.muted}>
                Risposte corrette richieste (su {module.exam.questionIds.length})
              </Text>
              <TextInput
                accessibilityLabel={`Soglia modulo ${mi + 1}`}
                editable={!busy && !published}
                style={styles.input}
                keyboardType="number-pad"
                defaultValue={String(module.exam.passingScore)}
                onChangeText={(text) =>
                  change(['modules', mi, 'exam', 'passingScore'], strictPositive(text))
                }
              />
              {!!soglie[mi] && <Notice error text={soglie[mi]} />}
              <Text style={styles.muted}>Tentativi massimi · vuoto = illimitati</Text>
              <TextInput
                accessibilityLabel={`Tentativi modulo ${mi + 1}`}
                editable={!busy && !published}
                style={styles.input}
                keyboardType="number-pad"
                defaultValue={
                  module.exam.maxAttempts === null ? '' : String(module.exam.maxAttempts)
                }
                onChangeText={(text) =>
                  change(
                    ['modules', mi, 'exam', 'maxAttempts'],
                    text === '' ? null : strictPositive(text),
                  )
                }
              />
            </View>
          )}
        </Card>
      ))}
      <Card>
        <Text style={styles.subtitle}>Domande e risposte</Text>
        {course.questions.map((question, qi) => (
          <DomandaEditor
            key={question.id}
            question={question}
            qi={qi}
            errori={domande[qi]}
            disabled={busy || published}
            change={change}
          />
        ))}
      </Card>
      <Card>
        <View style={styles.row}>
          <Button
            label={dirty ? 'Salva modifiche' : 'Bozza salvata'}
            disabled={busy || published || !dirty || bloccata}
            onPress={save}
          />
          <Button
            label="Apri anteprima corso"
            secondary
            disabled={busy || dirty}
            onPress={onPreview}
          />
        </View>
        {!published && (
          <>
            <View style={styles.row}>
              <Switch
                accessibilityLabel="Confermo la revisione di lezioni quiz e fonti"
                disabled={busy || dirty}
                value={reviewed}
                onValueChange={(value) => dispatch({ type: 'reviewed', value })}
              />
              <Text style={styles.body}>Confermo la revisione di lezioni, quiz e fonti</Text>
            </View>
            <Button
              label="Pubblica sul server locale"
              disabled={busy || dirty || !reviewed || bloccata}
              onPress={publish}
            />
          </>
        )}
        <Text style={styles.muted}>
          Identità, versione e fonti originali restano protette. La pubblicazione crea una copia non
          modificabile.
        </Text>
      </Card>
    </View>
  );
}
