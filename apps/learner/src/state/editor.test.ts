import {changeField,strictPositive} from './editor';
import sample from '../../../../packages/contracts/fixtures/sample-course.json';
import {CourseSchema,TIPI_DOMANDA} from '@formazione/contracts';
import {createEditorState,editorReducer,erroriSoglia,erroriDomande,facoltativo,NOMI_TIPO,ETICHETTA_PROMPT} from './editor';
it('edits a nested slide without changing source course or its provenance',()=>{const course=CourseSchema.parse(sample);const updated=changeField(course,['modules',0,'lessons',0,'slides',0,'body'],'Nuova spiegazione');expect(updated.modules[0].lessons[0].slides[0].body).toBe('Nuova spiegazione');expect(course.modules[0].lessons[0].slides[0].body).not.toBe('Nuova spiegazione');expect(updated.sources).toEqual(course.sources);});
it('rejects ambiguous score text instead of silently correcting it',()=>{for(const value of ['','1.2','2abc','-1','0'])expect(Number.isNaN(strictPositive(value))).toBe(true);expect(strictPositive('2')).toBe(2);});
it('changing reviewed content invalidates review until the modified draft is saved',()=>{
 const initial=createEditorState(CourseSchema.parse(sample));
 const reviewed=editorReducer(initial,{type:'reviewed',value:true});
 const changed=editorReducer(reviewed,{type:'change',path:['title'],value:'Corso modificato'});
 expect(changed).toMatchObject({dirty:true,reviewed:false});expect(initial.course.title).not.toBe('Corso modificato');
 const saving=editorReducer(changed,{type:'start'});expect(saving.busy).toBe(true);
 const saved=editorReducer(saving,{type:'saved',course:changed.course});expect(saved.dirty).toBe(false);expect(saved.reviewed).toBe(false);
 expect(editorReducer(saved,{type:'end'}).busy).toBe(false);
});
it('failed save preserves edits and exposes its error without clearing dirty state',()=>{
 const changed=editorReducer(createEditorState(CourseSchema.parse(sample)),{type:'change',path:['title'],value:'Titolo nuovo'});
 const failed=editorReducer(editorReducer(changed,{type:'start'}),{type:'error',message:'Conflitto revisione'});
 expect(editorReducer(failed,{type:'end'})).toMatchObject({busy:false,dirty:true,error:'Conflitto revisione',course:{title:'Titolo nuovo'}});
});
it('an invalid attempt limit stays invalid after editing a different field',()=>{
 const invalid=changeField(CourseSchema.parse(sample),['modules',0,'exam','maxAttempts'],strictPositive('abc'));
 const changed=changeField(invalid,['title'],'Un altro titolo');
 expect(Number.isNaN(changed.modules[0].exam!.maxAttempts)).toBe(true);
 expect(CourseSchema.safeParse(changed).success).toBe(false);
});
function conEsame(n:number,passingScore:number){
 const course=CourseSchema.parse(sample);const module=course.modules[0];const base=course.questions.find(q=>q.id===module.exam!.questionIds[0])!;
 const extra=Array.from({length:n-1},(_,i)=>({...base,id:`${base.id}-extra-${i}`}));
 course.questions.push(...extra);module.lessons[0].questionIds.push(...extra.map(q=>q.id));
 module.exam!.questionIds=[base.id,...extra.map(q=>q.id)];module.exam!.passingScore=passingScore;return CourseSchema.parse(course);
}
it('a threshold below the minimum is reported on its field and blocks the draft, without being corrected',()=>{
 const valid=conEsame(7,5);expect(erroriSoglia(valid)).toEqual({});
 const low=editorReducer(createEditorState(valid),{type:'change',path:['modules',0,'exam','passingScore'],value:strictPositive('4')});
 expect(erroriSoglia(low.course)).toEqual({0:'La soglia minima è 5 risposte su 7 (60%)'});
 expect(low.course.modules[0].exam!.passingScore).toBe(4);
 const changed=editorReducer(low,{type:'change',path:['title'],value:'Un altro titolo'});
 expect(changed.course.modules[0].exam!.passingScore).toBe(4);
 expect(CourseSchema.safeParse(changed.course).success).toBe(false);
 const fixed=editorReducer(changed,{type:'change',path:['modules',0,'exam','passingScore'],value:strictPositive('5')});
 expect(erroriSoglia(fixed.course)).toEqual({});expect(CourseSchema.safeParse(fixed.course).success).toBe(true);
});
it('an empty or non numeric threshold shows the minimum as the suggestion',()=>{
 const empty=changeField(conEsame(5,3),['modules',0,'exam','passingScore'],strictPositive(''));
 expect(erroriSoglia(empty)).toEqual({0:'La soglia minima è 3 risposte su 5 (60%)'});
});
it('per ogni tipo, un campo non valido è segnalato sotto quel campo e blocca la bozza',()=>{
 const course=CourseSchema.parse(sample);const qi=(kind:string)=>course.questions.findIndex(q=>q.kind===kind);
 expect(erroriDomande(course)).toEqual({});
 const casi:[string,(string|number)[],unknown,string][]=[
  ['fillblank',['prompt'],'Frase senza spazio','prompt'],
  ['scenario',['situation'],undefined,'situation'],
  ['correctStatement',['wrong'],'cliente','wrong'],
  ['oddOneOut',['options',1,'text'],'Accogliere il nuovo collega','options'],
  ['truefalse',['options',0,'text'],'Falso','options'],
 ];
 for(const [kind,path,value,campo] of casi){
  const i=qi(kind);const changed=editorReducer(createEditorState(course),{type:'change',path:['questions',i,...path],value});
  expect(Object.keys(erroriDomande(changed.course)[i])).toEqual([campo]);
  expect(CourseSchema.safeParse(changed.course).success).toBe(false);
 }
});
it('una motivazione cancellata diventa assente, non vuota',()=>{
 expect(facoltativo('  ')).toBeUndefined();expect(facoltativo('Perché sì')).toBe('Perché sì');
 const course=CourseSchema.parse(sample);const qi=course.questions.findIndex(q=>q.kind==='fillblank');
 const changed=changeField(course,['questions',qi,'options',1,'rationale'],facoltativo(''));
 expect(CourseSchema.safeParse(changed).success).toBe(true);
 expect(JSON.parse(JSON.stringify(changed)).questions[qi].options[1]).not.toHaveProperty('rationale');
});
it('ogni tipo ha nome ed etichetta della domanda per l\'editor',()=>{
 for(const kind of TIPI_DOMANDA){expect(NOMI_TIPO[kind]).toBeTruthy();expect(ETICHETTA_PROMPT[kind]).toBeTruthy();}
});
