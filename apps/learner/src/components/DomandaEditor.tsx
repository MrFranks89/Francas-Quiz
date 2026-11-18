import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { DIFFICOLTA, type Question } from '@formazione/contracts';
import { ETICHETTA_PROMPT, facoltativo } from '../state/editor';
import { alternaGiusta, campiDelTipo, etichettaDifficolta, giusteDi } from '../state/editorDomanda';
import { QuizTypeBadge } from './QuizTypeBadge';
import { Button, Notice, useUiStyles } from './ui';

/**
 * Una domanda nell'editor, con i campi del suo tipo. Chi rivede deve vedere
 * tutto quello che l'allievo vedrà (situazione, frase con l'errore, parte
 * sbagliata, motivazioni, difficoltà): altrimenti la conferma «Ho
 * revisionato» coprirebbe contenuti mai visti. Gli errori di validazione per
 * tipo stanno sotto il campo a cui si riferiscono.
 */
export function DomandaEditor({
  question,
  qi,
  errori,
  disabled,
  change,
}: {
  question: Question;
  qi: number;
  errori: Record<string, string[]> | undefined;
  disabled: boolean;
  change: (path: (string | number)[], value: unknown) => void;
}) {
  const C = usePalette(),
    { dark } = useTheme(),
    styles = useUiStyles();
  const [expanded, setExpanded] = useState(true);
  const n = qi + 1;
  const base = ['questions', qi];
  const hasErrors = !!errori && Object.values(errori).some((arr) => arr && arr.length > 0);
  const sotto = (campo: string) => errori?.[campo]?.map((m) => <Notice key={m} error text={m} />);

  function field(
    label: string,
    path: (string | number)[],
    value: string,
    options: { multiline?: boolean; optional?: boolean; editable?: boolean } = {},
  ) {
    return (
      <View key={path.join('.')} style={{ gap: 6 }}>
        <Text style={styles.muted}>{label}</Text>
        <TextInput
          accessibilityLabel={label}
          editable={!disabled && options.editable !== false}
          style={[styles.input, options.multiline && { minHeight: 100, textAlignVertical: 'top' }]}
          multiline={options.multiline}
          value={value}
          onChangeText={(text) =>
            change([...base, ...path], options.optional ? facoltativo(text) : text)
          }
        />
      </View>
    );
  }

  const kind = question.kind;
  const giuste = giusteDi(question);
  const campi = campiDelTipo(kind);
  /** Accoppiamento: indice della coppia che punta all'opzione (-1 se la domanda è da sistemare). */
  const coppiaDi = (optionId: string) =>
    (question.pairs ?? []).findIndex((p) => p.rightOptionId === optionId);

  return (
    <View style={[editorStyles.container, dark && { borderBottomColor: C.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Domanda ${n}: tocca per ${expanded ? 'comprimere' : 'espandere'}`}
        onPress={() => setExpanded((prev) => !prev)}
        style={({ pressed }) => [editorStyles.accordionHeader, pressed && { opacity: 0.75 }]}
      >
        <View style={editorStyles.headerRow}>
          <View style={editorStyles.titleGroup}>
            <Text style={styles.subtitle}>Domanda {n}</Text>
            <QuizTypeBadge kind={kind} />
          </View>
          <View style={editorStyles.chevronGroup}>
            {hasErrors && (
              <View
                style={[
                  editorStyles.errorPill,
                  dark && { backgroundColor: C.redBg, borderColor: C.red },
                ]}
              >
                <Text style={[editorStyles.errorPillText, dark && { color: C.redText }]}>
                  Errori
                </Text>
              </View>
            )}
            <Text style={[editorStyles.chevron, dark && { color: C.textMuted }]}>
              {expanded ? '▲' : '▼'}
            </Text>
          </View>
        </View>
        {!expanded && (
          <Text numberOfLines={1} style={styles.muted}>
            {question.prompt || '(Nessun prompt)'}
          </Text>
        )}
      </Pressable>

      <View style={{ display: expanded ? 'flex' : 'none', gap: 12 }}>
        {campi.situazione && (
          <>
            {field(`Situazione ${n}`, ['situation'], question.situation ?? '', { multiline: true })}
            {sotto('situation')}
          </>
        )}
        {field(`${ETICHETTA_PROMPT[kind]} ${n}`, ['prompt'], question.prompt, { multiline: true })}
        {sotto('prompt')}
        {campi.fraseConErrore && (
          <>
            {field(`Frase con l'errore ${n}`, ['sentence'], question.sentence ?? '', {
              multiline: true,
            })}
            {sotto('sentence')}
            {field(`Parte sbagliata ${n}`, ['wrong'], question.wrong ?? '')}
            {sotto('wrong')}
          </>
        )}
        {question.options.map((option, oi) => (
          <View key={option.id} style={{ gap: 8 }}>
            {/* Vero/falso: le due opzioni sono fisse, si sceglie solo quale è giusta. */}
            {field(`Risposta ${n}.${oi + 1}`, ['options', oi, 'text'], option.text, {
              editable: campi.testoRisposteModificabile,
            })}
            {campi.motivazioni &&
              field(
                `Motivazione ${n}.${oi + 1} (facoltativa)`,
                ['options', oi, 'rationale'],
                option.rationale ?? '',
                { optional: true },
              )}
            {campi.coppie ? (
              // Accoppiamento: niente pulsante «Segna come corretta» — la giusta di ogni
              // definizione è la sua coppia; qui si modifica il termine della colonna sinistra.
              coppiaDi(option.id) >= 0 &&
              field(
                `Termine abbinato ${n}.${oi + 1}`,
                ['pairs', coppiaDi(option.id), 'left'],
                question.pairs?.[coppiaDi(option.id)]?.left ?? '',
              )
            ) : campi.piuGiuste ? (
              <Button
                label={
                  giuste.includes(option.id)
                    ? 'Giusta, tocca per togliere'
                    : 'Segna anche questa come giusta'
                }
                disabled={disabled}
                secondary={!giuste.includes(option.id)}
                onPress={() =>
                  change([...base, 'correctOptionIds'], alternaGiusta(giuste, option.id))
                }
              />
            ) : (
              <Button
                label={
                  question.correctOptionId === option.id
                    ? 'Risposta corretta ✓'
                    : 'Segna come corretta'
                }
                disabled={disabled}
                secondary={question.correctOptionId !== option.id}
                onPress={() => change([...base, 'correctOptionId'], option.id)}
              />
            )}
          </View>
        ))}
        {/* Risposta multipla: l'insieme delle giuste, con l'errore sotto (almeno 2, almeno una sbagliata). */}
        {campi.piuGiuste && (
          <Text style={styles.muted}>
            Risposte giuste: {giuste.length} su {question.options.length}
          </Text>
        )}
        {sotto('correctOptionIds')}
        {sotto('correctOptionId')}
        {sotto('pairs')}
        {sotto('options')}
        <Text style={styles.muted}>Difficoltà</Text>
        <View style={styles.row}>
          {DIFFICOLTA.map((d) => (
            <Button
              key={d}
              label={etichettaDifficolta(d)}
              disabled={disabled}
              secondary={question.difficulty !== d}
              onPress={() => change([...base, 'difficulty'], d)}
            />
          ))}
          <Button
            label="Nessuna"
            disabled={disabled}
            secondary={question.difficulty !== undefined}
            onPress={() => change([...base, 'difficulty'], undefined)}
          />
        </View>
        {field(`Spiegazione ${n}`, ['explanation'], question.explanation, { multiline: true })}
        {sotto('explanation')}
      </View>
    </View>
  );
}

const editorStyles = StyleSheet.create({
  container: {
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#edf2f7',
  },
  accordionHeader: {
    gap: 6,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  chevronGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chevron: {
    fontSize: 14,
    color: '#637b88',
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  errorPill: {
    backgroundColor: '#fff0eb',
    borderColor: '#fca5a5',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  errorPillText: {
    color: '#9d3a24',
    fontSize: 11,
    fontWeight: '700',
  },
});
