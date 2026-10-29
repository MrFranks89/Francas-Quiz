import {describe,expect,it} from 'vitest';
import {CourseSchema} from '@formazione/contracts';
import {createProgress,completeLesson,submitExam} from '@formazione/learning-engine';
import sample from '../../../../packages/contracts/fixtures/sample-course.json';
import {presentazione} from './presentazione';
import {riepilogoUltimoTentativo} from './riepilogo';

const course=CourseSchema.parse(sample);
const per=(kind:string)=>course.questions.find(q=>q.kind===kind)!;

describe('presentazione per tipo', () => {
 it('scelta singola: nessuna etichetta, solo la domanda', () => {
  expect(presentazione(per('single'))).toMatchObject({kind:'single',etichetta:null,prompt:per('single').prompt});
 });
 it('vero o falso: etichetta e affermazione', () => {
  expect(presentazione(per('truefalse'))).toMatchObject({etichetta:'Vero o falso',prompt:per('truefalse').prompt});
 });
 it('completa la frase: testo diviso attorno allo spazio', () => {
  const p=presentazione(per('fillblank'));
  expect(p.etichetta).toBe('Completa la frase');
  expect(p.frase).toEqual({prima:'Il ',dopo:' accoglie il nuovo collega e presenta il team.'});
 });
 it('scenario: la situazione resta separata dalla domanda', () => {
  const q=per('scenario');
  expect(presentazione(q)).toMatchObject({etichetta:'Scenario',situazione:q.situation,prompt:q.prompt,difficulty:'medio'});
 });
 it('trova l\'intruso', () => {
  expect(presentazione(per('oddOneOut')).etichetta).toBe('Trova l\'intruso');
 });
 it('correggi l\'errore: la parte sbagliata isolata per barrarla', () => {
  expect(presentazione(per('correctStatement')).correggi).toEqual({prima:'Il ',sbagliata:'fornitore',dopo:' accoglie il nuovo collega e presenta il team.'});
 });
});

describe('riepilogo con i tipi', () => {
 const exam=course.modules[1].exam!;
 // Il modulo 2 si apre dopo lo sbarramento del modulo 1.
 const primo=submitExam(course,completeLesson(course,createProgress(course),'lesson-1'),'exam-1','s1',[{questionId:'question-1',optionId:'option-1-a'}]);
 const avvio=completeLesson(course,primo,'lesson-2');
 it('porta presentazione, parola scelta e motivazioni delle opzioni', () => {
  const fb=per('fillblank'),sbagliata=fb.options.find(o=>o.rationale)!;
  const p=submitExam(course,avvio,exam.id,'t1',[{questionId:fb.id,optionId:sbagliata.id}]);
  const riga=riepilogoUltimoTentativo(course,exam,p.attempts.filter(a=>a.examId===exam.id)).find(r=>r.questionId===fb.id)!;
  expect(riga.domanda.frase).toBeDefined();
  expect(riga.testoScelto).toBe(sbagliata.text);
  expect(riga.giusta).toBe(false);
  expect(riga.opzioni.find(o=>o.id===sbagliata.id)).toMatchObject({stato:'wr',rationale:sbagliata.rationale});
  const senza=riepilogoUltimoTentativo(course,exam,p.attempts.filter(a=>a.examId===exam.id)).find(r=>r.questionId===per('scenario').id)!;
  expect(senza.testoScelto).toBeNull();
 });
 it('vero/falso nel riepilogo resta nell\'ordine Vero, Falso', () => {
  const tf=per('truefalse');
  const p=submitExam(course,avvio,exam.id,'t1',[{questionId:tf.id,optionId:tf.options[0].id}]);
  const riga=riepilogoUltimoTentativo(course,exam,p.attempts.filter(a=>a.examId===exam.id)).find(r=>r.questionId===tf.id)!;
  expect(riga.opzioni.map(o=>[o.text,o.stato])).toEqual([['Vero','wr'],['Falso','cor']]);
 });
});

describe('riepilogo della risposta multipla', () => {
 const exam=course.modules[1].exam!;
 const primo=submitExam(course,completeLesson(course,createProgress(course),'lesson-1'),'exam-1','s1',[{questionId:'question-1',optionId:'option-1-a'}]);
 const avvio=completeLesson(course,primo,'lesson-2');
 const q=per('multiple');
 const riga=(optionIds:string[])=>riepilogoUltimoTentativo(course,exam,submitExam(course,avvio,exam.id,'t1',[{questionId:q.id,optionIds}]).attempts.filter(a=>a.examId===exam.id)).find(r=>r.questionId===q.id)!;
 it('giuste scelte in verde, scelta sbagliata in rosso, giusta non scelta «mancata»', () => {
  const r=riga(['option-2-mu-0','option-2-mu-2']);
  expect(r.giusta).toBe(false);expect(r.senzaRisposta).toBe(false);expect(r.scelte).toEqual(['option-2-mu-0','option-2-mu-2']);
  const per_id=Object.fromEntries(r.opzioni.map(o=>[o.id,[o.stato,!!o.mancata]]));
  expect(per_id).toEqual({'option-2-mu-0':['cor',false],'option-2-mu-1':['cor',true],'option-2-mu-2':['wr',false],'option-2-mu-3':['dim',false]});
  expect(presentazione(q).etichetta).toBe('Più risposte corrette');
 });
 it('l\'insieme esatto è giusto', () => {
  expect(riga(['option-2-mu-1','option-2-mu-0']).giusta).toBe(true);
 });
});
