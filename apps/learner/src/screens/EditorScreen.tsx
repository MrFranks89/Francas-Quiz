import React, { useReducer, useState } from 'react';
import { View, Text, TextInput, Switch } from 'react-native';
import { draftRequest, type Draft } from '../api/generation';
import {
  createEditorState,
  editorReducer,
  erroriDomande,
  erroriSoglia,
  strictPositive,
} from '../state/editor';
import {
  bozzaBloccata,
  messaggioErrore,
  richiestaPubblicazione,
  richiestaSalvataggio,
  validaBozza,
} from '../state/bozza';
import { DomandaEditor } from '../components/DomandaEditor';
import { EditorTabs, type TabItem } from '../components/EditorTabs';
import { Button, Card, Notice, useUiStyles } from '../components/ui';

export function EditorScreen({
  draft,
  onChange,
  onPreview,
  initialTab,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onPreview: () => void;
  initialTab?: string;
}) {
  const styles = useUiStyles();
  const [{ course, dirty, reviewed, busy, error }, dispatch] = useReducer(
    editorReducer,
    draft.course,
    createEditorState,
  );
  const defaultTab = course.modules.length > 0 ? 'modulo-1' : 'panoramica';
  const [activeTab, setActiveTab] = useState<string>(initialTab ?? defaultTab);
  const published = draft.status === 'published';

  // Una soglia sotto il minimo blocca salvataggio e pubblicazione finché non viene corretta.
  const soglie = erroriSoglia(course);
  // Lo stesso per le regole dei tipi di domanda: errore sotto il campo, salvataggio bloccato.
  const domande = erroriDomande(course);
  const bloccata = bozzaBloccata(soglie, domande);

  const tabs: TabItem[] = [
    { id: 'panoramica', label: 'Panoramica' },
    ...course.modules.map((_, i) => ({
      id: `modulo-${i + 1}`,
      label: `Modulo ${i + 1}`,
    })),
    {
      id: 'domande',
      label: 'Domande & Quiz',
      badge: course.questions.length,
    },
    { id: 'tutto', label: 'Tutto' },
  ];

  function isTabActive(tabId: string) {
    return activeTab === 'tutto' || activeTab === tabId;
  }

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
      const richiesta = richiestaSalvataggio(draft, validaBozza(course));
      const next = await draftRequest(richiesta.path, richiesta.method, richiesta.body);
      onChange(next);
      dispatch({ type: 'saved', course: next.course });
    } catch (e) {
      dispatch({
        type: 'error',
        message: messaggioErrore(e, 'Salvataggio non riuscito.'),
      });
    } finally {
      dispatch({ type: 'end' });
    }
  }

  async function publish() {
    dispatch({ type: 'start' });
    try {
      const richiesta = richiestaPubblicazione(draft, reviewed);
      onChange(await draftRequest(richiesta.path, richiesta.method, richiesta.body));
    } catch (e) {
      dispatch({
        type: 'error',
        message: messaggioErrore(e, 'Pubblicazione non riuscita.'),
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

      <EditorTabs tabs={tabs} activeTab={activeTab} onSelectTab={setActiveTab} />

      <View style={{ display: isTabActive('panoramica') ? 'flex' : 'none', gap: 20 }}>
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
      </View>

      {course.modules.map((module, mi) => (
        <View
          key={module.id}
          style={{ display: isTabActive(`modulo-${mi + 1}`) ? 'flex' : 'none' }}
        >
          <Card>
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
        </View>
      ))}

      <View style={{ display: isTabActive('domande') ? 'flex' : 'none' }}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.subtitle}>Domande e risposte</Text>
            <Text style={styles.muted}>{course.questions.length} totali</Text>
          </View>
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
      </View>

      <Card>
        <Text style={styles.subtitle}>Azioni sulla bozza</Text>
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
