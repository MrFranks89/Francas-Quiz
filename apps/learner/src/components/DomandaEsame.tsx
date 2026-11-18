import React, { memo, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { Question } from '@formazione/contracts';
import { gestoriAccoppiamento, impostaScelta } from '../state/risposte';
import type { CoppieAttive, RisposteInCorso } from '../state/risposte';
import type { Presentazione } from '../state/presentazione';
import { DomandaInCorso } from './ExamView';

/**
 * Una domanda in corso, isolata: si ridisegna solo se cambia la sua fetta di
 * stato. Riceve valori stabili (la propria `scelte`, la propria `coppia`) e
 * costruisce da sé i gestori; i setter di useState hanno identità stabile.
 */
export const DomandaEsame = memo(function DomandaEsame({
  q,
  numero,
  totale,
  domanda,
  opzioni,
  scelte,
  coppia,
  disabled,
  setAnswers,
  setCoppiaAttiva,
}: {
  q: Question;
  numero: number;
  totale: number;
  domanda: Presentazione;
  opzioni: { id: string; text: string }[];
  scelte: (string | null)[];
  coppia: number | undefined;
  disabled: boolean;
  setAnswers: Dispatch<SetStateAction<RisposteInCorso>>;
  setCoppiaAttiva: Dispatch<SetStateAction<CoppieAttive>>;
}) {
  const onScegli = useCallback(
    (optionId: string) => setAnswers((corrente) => impostaScelta(corrente, q, optionId)),
    [q, setAnswers],
  );
  const accoppiamento = useMemo(
    () =>
      q.kind === 'matching'
        ? gestoriAccoppiamento(
            q,
            { [q.id]: scelte },
            coppia === undefined ? {} : { [q.id]: coppia },
            setAnswers,
            setCoppiaAttiva,
          )
        : undefined,
    [q, scelte, coppia, setAnswers, setCoppiaAttiva],
  );
  return (
    <DomandaInCorso
      numero={numero}
      totale={totale}
      domanda={domanda}
      opzioni={opzioni}
      scelte={scelte}
      disabled={disabled}
      onScegli={onScegli}
      accoppiamento={accoppiamento}
    />
  );
});
