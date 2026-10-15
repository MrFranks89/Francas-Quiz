import {changeField,strictPositive} from './editor';
import sample from '../../../../packages/contracts/fixtures/sample-course.json';
import {CourseSchema} from '@formazione/contracts';
it('edits a nested slide without changing source course or its provenance',()=>{const course=CourseSchema.parse(sample);const updated=changeField(course,['modules',0,'lessons',0,'slides',0,'body'],'Nuova spiegazione');expect(updated.modules[0].lessons[0].slides[0].body).toBe('Nuova spiegazione');expect(course.modules[0].lessons[0].slides[0].body).not.toBe('Nuova spiegazione');expect(updated.sources).toEqual(course.sources);});
it('rejects ambiguous score text instead of silently correcting it',()=>{for(const value of ['','1.2','2abc','-1','0'])expect(Number.isNaN(strictPositive(value))).toBe(true);expect(strictPositive('2')).toBe(2);});
