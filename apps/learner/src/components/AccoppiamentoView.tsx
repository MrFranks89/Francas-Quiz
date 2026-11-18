import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { usePalette } from '@formazione/civis-ui/src/ThemeProvider';
import { useStyles } from '@formazione/civis-ui/src/comune/stili';
import { TESTO } from '@formazione/civis-ui/src/tema';
import type { CoppiaRiepilogo, OpzioneMostrata } from '../state/riepilogo';
import type { Presentazione } from '../state/presentazione';
/** Stato e gestori dell'accoppiamento mentre si risponde (la vista non tocca lo stato). */
export type AccoppiamentoInCorso = {
  /** Ordinata per coppia: assegnazioni[k] è la definizione del termine k, null se manca. */
  assegnazioni: (string | null)[];
  coppiaAttiva: number | null;
  onSelezionaCoppia: (k: number) => void;
  onAssegna: (optionId: string) => void;
};
import { coloriOpzione, descriviStato } from './stiliOpzione';

/**
 * Chip di opzioni (s.fillChip di FillBlankStep) e corpo dell'accoppiamento,
 * estratti da ExamView: il test resta leggibile e ogni file fa una cosa
 * (tests/sorgenti/compressione.test.ts).
 */

/** Completa la frase e accoppiamento: parole/definizioni come chip. */
export function ChipParole({
  opzioni,
  onScegli,
  disabled,
}: {
  opzioni: OpzioneMostrata[];
  onScegli?: (id: string) => void;
  disabled?: boolean;
}) {
  const C = usePalette(),
    s = useStyles();
  return (
    <View style={s.fillOptionsRow}>
      {opzioni.map((o, i) => {
        const c = coloriOpzione(C, o.stato);
        const forte = o.stato === 'sel' || o.stato === 'cor' || o.stato === 'wr';
        const stile = [
          s.fillChip,
          { backgroundColor: c.backgroundColor, borderColor: c.borderColor },
          forte && { borderWidth: 2 },
        ];
        const testo = (
          <Text style={[s.fillChipText, { color: c.text }, forte && { fontWeight: '800' }]}>
            {o.text}
          </Text>
        );
        if (!onScegli)
          return (
            <View
              key={o.id}
              style={stile}
              accessibilityLabel={`Opzione ${String.fromCharCode(65 + i)}: ${o.text}${descriviStato(o.stato)}`}
            >
              {testo}
            </View>
          );
        return (
          <TouchableOpacity
            key={o.id}
            onPress={() => onScegli(o.id)}
            disabled={disabled}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Opzione ${String.fromCharCode(65 + i)}: ${o.text}`}
            accessibilityState={{ selected: o.stato === 'sel', disabled: !!disabled }}
            style={stile}
          >
            {testo}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Nel riepilogo: una riga per coppia — termine, definizione assegnata (verde se
 * giusta, rossa se sbagliata) e, se sbagliata, la definizione giusta. */
function RigheRiepilogo({ coppie }: { coppie: CoppiaRiepilogo[] }) {
  const C = usePalette(),
    s = useStyles();
  return (
    <>
      {coppie.map((c, k) => (
        <View
          key={k}
          style={[
            s.quizOption,
            {
              borderColor: c.corretta ? C.green : C.red,
              backgroundColor: c.corretta ? C.greenBg : C.redBg,
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 4,
            },
          ]}
          accessibilityLabel={`${c.left}: ${c.sceltaText ?? 'nessuna definizione'}${c.corretta ? ', giusta' : `, sbagliata, la giusta è ${c.giustaText}`}`}
        >
          <Text style={[s.quizOptionText, { color: C.text, fontWeight: '800' }]}>{c.left}</Text>
          <Text
            style={{
              color: c.corretta ? C.greenText : C.redText,
              fontSize: TESTO.corpoPiccolo,
              fontWeight: '700',
            }}
          >
            {c.sceltaText ?? 'Nessuna definizione assegnata'}
          </Text>
          {!c.corretta && (
            <Text style={{ color: C.greenText, fontSize: TESTO.corpoPiccolo }}>
              Giusta: {c.giustaText}
            </Text>
          )}
        </View>
      ))}
    </>
  );
}

/** In corso: tocca un termine per attivarlo, poi tocca la definizione da assegnargli;
 * una definizione già assegnata si sposta alla coppia attiva. */
function InCorso({
  domanda,
  opzioni,
  accoppiamento,
  disabled,
}: {
  domanda: Presentazione;
  opzioni: OpzioneMostrata[];
  accoppiamento: AccoppiamentoInCorso;
  disabled?: boolean;
}) {
  const C = usePalette(),
    s = useStyles();
  const a = accoppiamento;
  const testoOpzione = (id: string | null) => opzioni.find((o) => o.id === id)?.text ?? null;
  return (
    <>
      <Text style={[s.label, { marginBottom: 8 }]}>
        Tocca un termine, poi la definizione da assegnargli
      </Text>
      {(domanda.coppie ?? []).map((p, k) => {
        const assegnata = testoOpzione(a.assegnazioni[k] ?? null);
        const attiva = a.coppiaAttiva === k;
        const c = coloriOpzione(C, attiva ? 'sel' : assegnata ? 'idle' : 'dim');
        return (
          <TouchableOpacity
            key={p.id}
            onPress={() => a.onSelezionaCoppia(k)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Termine ${k + 1}: ${p.left}${assegnata ? `, abbinato a ${assegnata}` : ''}${attiva ? ', attivo' : ''}`}
            accessibilityState={{ selected: attiva, disabled: !!disabled }}
            style={[
              s.quizOption,
              {
                borderColor: c.borderColor,
                backgroundColor: c.backgroundColor,
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 4,
              },
              attiva && { borderWidth: 2 },
            ]}
          >
            <Text style={[s.quizOptionText, { color: C.text, fontWeight: '800' }]}>{p.left}</Text>
            <Text
              style={{
                color: assegnata ? C.text : C.textDim,
                fontSize: TESTO.corpoPiccolo,
                fontWeight: assegnata ? '700' : '400',
              }}
            >
              {assegnata ?? 'Tocca una definizione per abbinarla'}
            </Text>
          </TouchableOpacity>
        );
      })}
      <View style={s.fillOptionsRow}>
        {opzioni.map((o, i) => {
          const c = coloriOpzione(C, o.stato);
          const forte = o.stato === 'sel';
          return (
            <TouchableOpacity
              key={o.id}
              onPress={() => a.onAssegna(o.id)}
              disabled={disabled}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Definizione ${String.fromCharCode(65 + i)}: ${o.text}`}
              accessibilityState={{ selected: forte, disabled: !!disabled }}
              style={[
                s.fillChip,
                { backgroundColor: c.backgroundColor, borderColor: c.borderColor },
                forte && { borderWidth: 2 },
              ]}
            >
              <Text style={[s.fillChipText, { color: c.text }, forte && { fontWeight: '800' }]}>
                {o.text}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

/** Corpo di una domanda di accoppiamento: riepilogo per coppia dopo la consegna,
 * termini attivabili e chip delle definizioni mentre si risponde. */
export function CorpoAccoppiamento({
  domanda,
  opzioni,
  accoppiamento,
  coppieRiepilogo,
  disabled,
}: {
  domanda: Presentazione;
  opzioni: OpzioneMostrata[];
  accoppiamento?: AccoppiamentoInCorso;
  coppieRiepilogo?: CoppiaRiepilogo[];
  disabled?: boolean;
}) {
  if (coppieRiepilogo) return <RigheRiepilogo coppie={coppieRiepilogo} />;
  return (
    <InCorso domanda={domanda} opzioni={opzioni} accoppiamento={accoppiamento!} disabled={disabled} />
  );
}
