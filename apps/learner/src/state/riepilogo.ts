import type {Course} from '@formazione/contracts';
import {displayOptions,type Attempt} from '@formazione/learning-engine';
import {optState} from '@formazione/civis-ui/src/lezione/util';
import type {OptSt} from '@formazione/civis-ui/src/comune/OptLetter';
import {presentazione,type Presentazione} from './presentazione';

type Exam=NonNullable<Course['modules'][number]['exam']>;
export type OpzioneMostrata={id:string;text:string;stato:OptSt;rationale?:string};
export type RigaRiepilogo={questionId:string;prompt:string;explanation:string;scelta:string|null;giusta:boolean;opzioni:OpzioneMostrata[];domanda:Presentazione;
 /** Testo dell'opzione scelta, per riempire lo spazio di «Completa la frase»; null se senza risposta. */
 testoScelto:string|null};

/**
 * Stato visivo di un'opzione mentre si risponde: selezionata o neutra.
 * La correttezza non entra nemmeno nel calcolo, così prima della consegna
 * niente può rivelare la risposta giusta.
 */
export function statoInCorso(selezionata:boolean):OptSt{
 return optState(false,selezionata,false);
}

/**
 * Riepilogo dell'ultimo tentativo consegnato di un esame, domanda per domanda.
 *
 * Le opzioni sono nell'ordine in cui sono state viste durante quel tentativo:
 * `displayOptions` con l'indice del tentativo (tentativi precedenti dello
 * stesso esame), cioè `attempts.length - 1`, non `attempts.length`, che è
 * l'ordine del tentativo successivo.
 *
 * Colori con `optState` di Civis (src/lezione/util.ts): la giusta «cor»
 * (verde), la sbagliata scelta «wr» (rosso), le altre «dim». Una domanda
 * senza risposta ha `scelta: null` e nessuna opzione rossa.
 *
 * `attempts` sono i tentativi di questo esame, in ordine di consegna.
 */
export function riepilogoUltimoTentativo(course:Course,exam:Exam,attempts:Attempt[]):RigaRiepilogo[]{
 const last=attempts.at(-1);
 if(!last)return [];
 if(attempts.some(a=>a.examId!==exam.id))throw new Error(`Tentativi di un altro esame in ${exam.id}`);
 const indice=attempts.length-1;
 return exam.questionIds.map(id=>{
  const q=course.questions.find(q=>q.id===id);
  if(!q)throw new Error(`Domanda sconosciuta ${id}`);
  const scelta=last.answers.find(a=>a.questionId===id)?.optionId??null;
  const opzioni=displayOptions(course,exam.id,indice,id).map(o=>({id:o.id,text:o.text,stato:optState(true,o.id===scelta,o.id===q.correctOptionId),...(o.rationale?{rationale:o.rationale}:{})}));
  const testoScelto=q.options.find(o=>o.id===scelta)?.text??null;
  return {questionId:id,prompt:q.prompt,explanation:q.explanation,scelta,giusta:scelta===q.correctOptionId,opzioni,domanda:presentazione(q),testoScelto};
 });
}
