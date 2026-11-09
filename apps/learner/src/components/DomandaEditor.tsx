import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { DIFFICOLTA, type Question } from '@formazione/contracts';
import { ETICHETTA_PROMPT, NOMI_TIPO, facoltativo } from '../state/editor';
import { Button, Notice, styles } from './ui';

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
  const n = qi + 1,
    base = ['questions', qi];
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
  const kind = question.kind,
    giuste = question.correctOptionIds ?? [];
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.subtitle}>
        Domanda {n} · {NOMI_TIPO[kind]}
      </Text>
      {kind === 'scenario' && (
        <>
          {field(`Situazione ${n}`, ['situation'], question.situation ?? '', { multiline: true })}
          {sotto('situation')}
        </>
      )}
      {field(`${ETICHETTA_PROMPT[kind]} ${n}`, ['prompt'], question.prompt, { multiline: true })}
      {sotto('prompt')}
      {kind === 'correctStatement' && (
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
            editable: kind !== 'truefalse',
          })}
          {kind !== 'truefalse' &&
            field(
              `Motivazione ${n}.${oi + 1} (facoltativa)`,
              ['options', oi, 'rationale'],
              option.rationale ?? '',
              { optional: true },
            )}
          {kind === 'multiple' ? (
            <Button
              label={
                giuste.includes(option.id)
                  ? 'Giusta, tocca per togliere'
                  : 'Segna anche questa come giusta'
              }
              disabled={disabled}
              secondary={!giuste.includes(option.id)}
              onPress={() =>
                change(
                  [...base, 'correctOptionIds'],
                  giuste.includes(option.id)
                    ? giuste.filter((g) => g !== option.id)
                    : [...giuste, option.id],
                )
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
      {kind === 'multiple' && (
        <Text style={styles.muted}>
          Risposte giuste: {giuste.length} su {question.options.length}
        </Text>
      )}
      {sotto('correctOptionIds')}
      {sotto('correctOptionId')}
      {sotto('options')}
      <Text style={styles.muted}>Difficoltà</Text>
      <View style={styles.row}>
        {DIFFICOLTA.map((d) => (
          <Button
            key={d}
            label={d.charAt(0).toUpperCase() + d.slice(1)}
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
    </View>
  );
}
