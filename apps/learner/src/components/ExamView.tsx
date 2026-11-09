import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { usePalette } from '@formazione/civis-ui/src/ThemeProvider';
import { useStyles } from '@formazione/civis-ui/src/comune/stili';
import { TESTO } from '@formazione/civis-ui/src/tema';
import { OptLetter, type OptSt } from '@formazione/civis-ui/src/comune/OptLetter';
import { OptMark } from '@formazione/civis-ui/src/comune/OptMark';
import { FormatPill } from '@formazione/civis-ui/src/comune/FormatPill';
import { DifficultyBadge } from '@formazione/civis-ui/src/comune/DifficultyBadge';
import { statoInCorso, type OpzioneMostrata, type RigaRiepilogo } from '../state/riepilogo';
import { SPAZIO_VUOTO, type Presentazione } from '../state/presentazione';

/**
 * Vista del test e riepilogo (componenti nostri, con lo stile di Civis:
 * QuizSingleStep, TrueFalseStep, FillBlankStep, ScenarioStep, OddOneOutStep,
 * CorrectStatementStep ed EsameScreen). Gli step di Civis non si usano:
 * mescolano da soli con Math.random e romperebbero l'ordine con seme di
 * displayOptions, e confermano domanda per domanda invece che a fine test.
 * Qui le opzioni arrivano già ordinate dal chiamante. Nessuna icona né emoji
 * (docs/decisions/002-interfaccia.md): FormatPill senza `icon`.
 */

type Palette = ReturnType<typeof usePalette>;
function coloriOpzione(C: Palette, stato: OptSt) {
  if (stato === 'sel') return { borderColor: C.selBorder, backgroundColor: C.selBg, text: C.text };
  if (stato === 'cor')
    return { borderColor: C.green, backgroundColor: C.greenBg, text: C.greenText };
  if (stato === 'wr') return { borderColor: C.red, backgroundColor: C.redBg, text: C.redText };
  if (stato === 'dim')
    return { borderColor: C.borderSubtle, backgroundColor: C.surfaceDark, text: C.textDim };
  return { borderColor: C.slate, backgroundColor: C.surfaceDark, text: C.optionText };
}
const descriviStato = (stato: OptSt) =>
  stato === 'cor' ? ', giusta' : stato === 'wr' ? ', sbagliata, la tua risposta' : '';
// Colore della pillola per tipo, come negli step di Civis: teal per «Completa la frase», scenario per gli altri formati.
const colorePillola = (C: Palette, kind: Presentazione['kind']) =>
  kind === 'fillblank' ? C.teal : kind === 'truefalse' ? C.indigo : C.scenario;

/** `mancata`: risposta multipla, giusta non scelta: bordo verde senza riempimento e la parola «Mancata». */
function RigaOpzione({
  i,
  text,
  stato,
  onPress,
  disabled,
  mancata,
}: {
  i: number;
  text: string;
  stato: OptSt;
  onPress?: () => void;
  disabled?: boolean;
  mancata?: boolean;
}) {
  const C = usePalette(),
    s = useStyles();
  const c = mancata
    ? { ...coloriOpzione(C, 'cor'), backgroundColor: C.surfaceDark }
    : coloriOpzione(C, stato);
  const forte = stato === 'sel' || stato === 'cor' || stato === 'wr';
  const contenuto = (
    <>
      <OptLetter i={i} state={stato} />
      <Text
        style={[
          s.quizOptionText,
          { marginLeft: 11, color: c.text },
          forte && { fontWeight: '800' },
        ]}
      >
        {text}
      </Text>
      {mancata ? (
        <Text style={{ color: C.greenText, fontSize: 17, fontWeight: '800' }}>Mancata</Text>
      ) : (
        <OptMark state={stato} />
      )}
    </>
  );
  const stile = [
    s.quizOption,
    { borderColor: c.borderColor, backgroundColor: c.backgroundColor },
    forte && { borderWidth: 2 },
  ];
  if (!onPress)
    return (
      <View
        style={stile}
        accessibilityLabel={`Opzione ${String.fromCharCode(65 + i)}: ${text}${mancata ? ', giusta, non scelta' : descriviStato(stato)}`}
      >
        {contenuto}
      </View>
    );
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Opzione ${String.fromCharCode(65 + i)}: ${text}`}
      accessibilityState={{ selected: stato === 'sel', disabled: !!disabled }}
      style={stile}
    >
      {contenuto}
    </TouchableOpacity>
  );
}

/** Vero o falso: due pulsanti affiancati (s.tfBtn di TrueFalseStep), colori per correttezza dopo la consegna. */
function BottoniVeroFalso({
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
    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
      {opzioni.map((o) => {
        const c = coloriOpzione(C, o.stato);
        const box =
          o.stato === 'idle'
            ? null
            : { backgroundColor: c.backgroundColor, borderColor: c.borderColor };
        const testo = (
          <>
            <Text
              style={[
                s.tfBtnText,
                { color: c.text },
                o.stato !== 'idle' && o.stato !== 'dim' && { fontWeight: '800' },
              ]}
            >
              {o.text}
            </Text>
            {(o.stato === 'cor' || o.stato === 'wr') && (
              <View style={{ marginTop: 6 }}>
                <OptMark state={o.stato} />
              </View>
            )}
          </>
        );
        if (!onScegli)
          return (
            <View
              key={o.id}
              style={[s.tfBtn, box]}
              accessibilityLabel={`${o.text}${descriviStato(o.stato)}`}
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
            accessibilityLabel={o.text}
            accessibilityState={{ selected: o.stato === 'sel', disabled: !!disabled }}
            style={[s.tfBtn, box]}
          >
            {testo}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Completa la frase: parole come chip (s.fillChip di FillBlankStep). */
function ChipParole({
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

/**
 * Testo della domanda secondo il tipo, poi le opzioni.
 * `parola`: testo che riempie lo spazio di «Completa la frase» (la scelta), `coloreParola` il suo colore.
 */
function CorpoDomanda({
  domanda,
  opzioni,
  onScegli,
  disabled,
  parola,
  coloreParola,
}: {
  domanda: Presentazione;
  opzioni: OpzioneMostrata[];
  onScegli?: (id: string) => void;
  disabled?: boolean;
  parola: string | null;
  coloreParola: string;
}) {
  const C = usePalette(),
    s = useStyles();
  const domandaTesto = (
    <Text style={[s.questionText, { marginBottom: 12, color: C.text }]}>{domanda.prompt}</Text>
  );
  const righe = opzioni.map((o, i) => (
    <RigaOpzione
      key={o.id}
      i={i}
      text={o.text}
      stato={o.stato}
      mancata={o.mancata}
      disabled={disabled}
      onPress={onScegli && (() => onScegli(o.id))}
    />
  ));
  switch (domanda.kind) {
    case 'truefalse':
      return (
        <>
          <Text style={[s.questionText, { marginBottom: 12, color: C.text }]}>
            «{domanda.prompt}»
          </Text>
          <BottoniVeroFalso opzioni={opzioni} onScegli={onScegli} disabled={disabled} />
        </>
      );
    case 'fillblank':
      return (
        <>
          <View style={s.fillSentenceBox}>
            <Text style={s.fillSentence}>
              {domanda.frase?.prima}
              <Text
                style={[
                  s.fillSentence,
                  s.fillBlank,
                  { color: coloreParola, borderBottomColor: coloreParola },
                ]}
              >
                {parola ?? SPAZIO_VUOTO}
              </Text>
              {domanda.frase?.dopo}
            </Text>
          </View>
          <ChipParole opzioni={opzioni} onScegli={onScegli} disabled={disabled} />
        </>
      );
    case 'scenario':
      return (
        <>
          <View style={s.scenarioBox}>
            <Text style={s.scenarioText}>{domanda.situazione}</Text>
          </View>
          {domandaTesto}
          {righe}
        </>
      );
    case 'correctStatement':
      return (
        <>
          {domandaTesto}
          <View style={s.scenarioBox}>
            <Text style={s.scenarioText}>
              {domanda.correggi?.prima}
              <Text
                style={{ color: C.redText, textDecorationLine: 'line-through', fontWeight: '800' }}
              >
                {domanda.correggi?.sbagliata}
              </Text>
              {domanda.correggi?.dopo}
            </Text>
          </View>
          <Text style={[s.label, { marginBottom: 8 }]}>Sostituisci la parte sbagliata con:</Text>
          {righe}
        </>
      );
    case 'multiple':
      return (
        <>
          {domandaTesto}
          <Text style={[s.label, { marginBottom: 8 }]}>Seleziona tutte le risposte corrette</Text>
          {righe}
        </>
      );
    default:
      return (
        <>
          {domandaTesto}
          {righe}
        </>
      );
  }
}

function Intestazione({
  testo,
  colore,
  domanda,
}: {
  testo: string;
  colore: string;
  domanda: Presentazione;
}) {
  const C = usePalette(),
    s = useStyles();
  return (
    <>
      <Text style={[s.eyebrow, { marginBottom: 6, color: colore }]}>{testo}</Text>
      {(domanda.etichetta || domanda.difficulty) && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            gap: 8,
          }}
        >
          {domanda.etichetta ? (
            <FormatPill text={domanda.etichetta} color={colorePillola(C, domanda.kind)} />
          ) : (
            <View />
          )}
          <DifficultyBadge level={domanda.difficulty} />
        </View>
      )}
    </>
  );
}

/** Una domanda mentre si risponde: la scelta è evidenziata in indaco, senza rivelare nulla. */
/** `scelte`: opzioni selezionate (al più una, tranne nella risposta multipla). */
export function DomandaInCorso({
  numero,
  totale,
  domanda,
  opzioni,
  scelte,
  onScegli,
  disabled,
}: {
  numero: number;
  totale: number;
  domanda: Presentazione;
  opzioni: { id: string; text: string }[];
  scelte: string[];
  onScegli: (id: string) => void;
  disabled?: boolean;
}) {
  const C = usePalette();
  const mostrate = opzioni.map((o) => ({ ...o, stato: statoInCorso(scelte.includes(o.id)) }));
  const parola = opzioni.find((o) => o.id === scelte[0])?.text ?? null;
  return (
    <View style={{ marginBottom: 18 }}>
      <Intestazione
        testo={`Domanda ${numero} di ${totale}`}
        colore={C.textVeryDim}
        domanda={domanda}
      />
      <CorpoDomanda
        domanda={domanda}
        opzioni={mostrate}
        onScegli={onScegli}
        disabled={disabled}
        parola={parola}
        coloreParola={parola ? C.text : C.textDim}
      />
    </View>
  );
}

/** Una domanda nel riepilogo dell'ultimo tentativo: card con bordo verde o rosso, come in EsameScreen. */
export function RiepilogoDomanda({ numero, riga }: { numero: number; riga: RigaRiepilogo }) {
  const C = usePalette(),
    s = useStyles();
  const esito = riga.giusta ? 'GIUSTA' : riga.senzaRisposta ? 'SENZA RISPOSTA' : 'SBAGLIATA';
  const motivate = riga.opzioni.filter((o) => o.rationale);
  return (
    <View
      style={[
        s.card,
        { marginBottom: 12, borderColor: riga.giusta ? C.green : C.red, borderWidth: 1.5 },
      ]}
    >
      <Intestazione
        testo={`${numero} · ${esito}`}
        colore={riga.giusta ? C.greenText : C.redText}
        domanda={riga.domanda}
      />
      {riga.senzaRisposta && (
        <Text
          style={{ color: C.redText, fontSize: TESTO.piccolo, fontWeight: '700', marginBottom: 8 }}
        >
          Nessuna risposta data: conta come sbagliata.
        </Text>
      )}
      <CorpoDomanda
        domanda={riga.domanda}
        opzioni={riga.opzioni}
        parola={riga.testoScelto}
        coloreParola={riga.giusta ? C.greenText : C.redText}
      />
      {motivate.map((o) => (
        <View key={o.id} style={{ marginBottom: 8 }}>
          <Text
            style={[
              s.label,
              {
                textTransform: 'none',
                marginBottom: 2,
                color: o.stato === 'wr' ? C.redText : o.stato === 'cor' ? C.greenText : C.textDim,
              },
            ]}
          >
            {o.stato === 'wr' ? 'Un errore comprensibile' : `Perché «${o.text}»`}
          </Text>
          <Text style={[s.feedbackBody, { fontSize: TESTO.corpoPiccolo, lineHeight: 22 }]}>
            {o.rationale}
          </Text>
        </View>
      ))}
      <Text
        style={[s.feedbackBody, { marginTop: 4, fontSize: TESTO.corpoPiccolo, lineHeight: 23 }]}
      >
        {riga.explanation}
      </Text>
    </View>
  );
}
