import {describe,expect,it} from 'vitest';
import {CourseSchema,type Course} from '@formazione/contracts';
import {createProgress,completeLesson,submitExam,displayOptions,type Progress} from '@formazione/learning-engine';
import sample from '../../../../packages/contracts/fixtures/sample-course.json';
import {riepilogoUltimoTentativo,statoInCorso} from './riepilogo';

// Corso con quattro opzioni per domanda e due domande nell'esame: l'ordine con
// seme cambia davvero da un tentativo all'altro.
const base=CourseSchema.parse(sample);
const course:Course=CourseSchema.parse({
 ...base,
 modules:[{...base.modules[0],lessons:[{...base.modules[0].lessons[0],questionIds:['q1','q2']}],
  exam:{id:'exam-1',questionIds:['q1','q2'],mode:'practice',passingScore:2,maxAttempts:null}}],
 questions:['q1','q2'].map(id=>({id,moduleId:'module-1',lessonId:'lesson-1',prompt:`Domanda ${id}`,
  options:['a','b','c','d'].map(l=>({id:`${id}-${l}`,text:`Opzione ${l}`})),correctOptionId:`${id}-a`,explanation:`Perché ${id}`,sourceRefs:['source-1']})),
});
const exam=course.modules[0].exam!;
function consegna(progress:Progress,answers:Record<string,string>,n:number){
 return submitExam(course,progress,exam.id,`t${n}`,Object.entries(answers).map(([questionId,optionId])=>({questionId,optionId})));
}
const avvio=completeLesson(course,createProgress(course),'lesson-1');

describe('riepilogoUltimoTentativo', () => {
 it('senza tentativi non c\'è riepilogo', () => {
  expect(riepilogoUltimoTentativo(course,exam,[])).toEqual([]);
 });

 it('giusta in verde, sbagliata scelta in rosso, le altre attenuate', () => {
  const p=consegna(avvio,{q1:'q1-a',q2:'q2-c'},1);
  const [r1,r2]=riepilogoUltimoTentativo(course,exam,p.attempts);
  expect(r1).toMatchObject({questionId:'q1',scelta:'q1-a',giusta:true,explanation:'Perché q1'});
  expect(Object.fromEntries(r1.opzioni.map(o=>[o.id,o.stato]))).toEqual({'q1-a':'cor','q1-b':'dim','q1-c':'dim','q1-d':'dim'});
  expect(r2).toMatchObject({scelta:'q2-c',giusta:false});
  expect(Object.fromEntries(r2.opzioni.map(o=>[o.id,o.stato]))).toEqual({'q2-a':'cor','q2-b':'dim','q2-c':'wr','q2-d':'dim'});
 });

 it('una domanda senza risposta è segnalata e non ha opzioni rosse', () => {
  const p=consegna(avvio,{q1:'q1-b'},1);
  const r2=riepilogoUltimoTentativo(course,exam,p.attempts)[1];
  expect(r2.scelta).toBeNull();
  expect(r2.giusta).toBe(false);
  expect(r2.opzioni.filter(o=>o.stato==='wr')).toEqual([]);
  expect(r2.opzioni.find(o=>o.id==='q2-a')!.stato).toBe('cor');
 });

 // Il difetto da escludere: mostrare il riepilogo nell'ordine del tentativo
 // successivo (attempts.length), che l'utente non ha mai visto.
 it('mostra le opzioni nell\'ordine visto durante quel tentativo, non in quello successivo', () => {
  let p=avvio;
  for(let n=0;n<4;n++){
   const vistoQ1=displayOptions(course,exam.id,n,'q1').map(o=>o.id);
   p=consegna(p,{q1:'q1-b',q2:'q2-b'},n);
   const righe=riepilogoUltimoTentativo(course,exam,p.attempts);
   expect(righe[0].opzioni.map(o=>o.id)).toEqual(vistoQ1);
   expect(righe[1].opzioni.map(o=>o.id)).toEqual(displayOptions(course,exam.id,n,'q2').map(o=>o.id));
  }
  // Il controllo sopra ha senso solo se l'ordine cambia davvero tra tentativi.
  const ordini=[0,1,2,3].map(n=>displayOptions(course,exam.id,n,'q1').map(o=>o.id).join());
  expect(new Set(ordini).size).toBeGreaterThan(1);
 });

 it('rifiuta tentativi di un altro esame', () => {
  const p=consegna(avvio,{q1:'q1-a',q2:'q2-a'},1);
  expect(()=>riepilogoUltimoTentativo(course,exam,[{...p.attempts[0],examId:'altro'}])).toThrow();
 });
});

describe('statoInCorso', () => {
 it('prima della consegna: selezionata o neutra, mai verde o rossa', () => {
  expect(statoInCorso(true)).toBe('sel');
  expect(statoInCorso(false)).toBe('idle');
 });
});
