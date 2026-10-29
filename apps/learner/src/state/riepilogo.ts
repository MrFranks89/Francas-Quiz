import type {Course} from '@formazione/contracts';
import {displayOptions,multiplaGiusta,opzioniScelte,type Attempt} from '@formazione/learning-engine';
import {optState} from '@formazione/civis-ui/src/lezione/util';
import type {OptSt} from '@formazione/civis-ui/src/comune/OptLetter';
import {presentazione,type Presentazione} from './presentazione';

type Exam=NonNullable<Course['modules'][number]['exam']>;
/** `mancata`: risposta multipla, opzione giusta non scelta (verde senza riempimento, «Mancata»). */
export type OpzioneMostrata={id:string;text:string;stato:OptSt;rationale?:string;mancata?:boolean};
export type RigaRiepilogo={questionId:string;prompt:string;explanation:string;
 /** Opzione scelta (scelta singola e tipi riducibili); per la risposta multipla è null e valgono `scelte`. */
 scelta:string|null;scelte:string[];senzaRisposta:boolean;giusta:boolean;opzioni:OpzioneMostrata[];domanda:Presentazione;
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
  const risposta=last.answers.find(a=>a.questionId===id);
  const scelte=risposta?opzioniScelte(risposta):[];
  const multipla=q.kind==='multiple';
  const scelta=multipla?null:scelte[0]??null;
  const giusteIds=multipla?q.correctOptionIds??[]:[q.correctOptionId];
  // Multipla: giuste scelte in verde, scelte sbagliate in rosso, giuste non scelte «mancate».
  const opzioni=displayOptions(course,exam.id,indice,id).map(o=>{
   const giustaO=giusteIds.includes(o.id),sceltaO=scelte.includes(o.id);
   return {id:o.id,text:o.text,stato:optState(true,sceltaO,giustaO),...(multipla&&giustaO&&!sceltaO?{mancata:true}:{}),...(o.rationale?{rationale:o.rationale}:{})};
  });
  const testoScelto=q.options.find(o=>o.id===scelta)?.text??null;
  const giusta=multipla?scelte.length>0&&multiplaGiusta(q,scelte):scelta===q.correctOptionId;
  return {questionId:id,prompt:q.prompt,explanation:q.explanation,scelta,scelte,senzaRisposta:scelte.length===0,giusta,opzioni,domanda:presentazione(q),testoScelto};
 });
}
