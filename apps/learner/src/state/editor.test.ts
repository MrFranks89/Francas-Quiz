import {changeField,strictPositive} from './editor';
import sample from '../../../../packages/contracts/fixtures/sample-course.json';
import {CourseSchema} from '@formazione/contracts';
import {createEditorState,editorReducer} from './editor';
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
