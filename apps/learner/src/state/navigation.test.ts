import {navigate,initialNavigation} from './navigation';
import {CourseSchema} from '@formazione/contracts';
import sample from '../../../../packages/contracts/fixtures/sample-course.json';
it('keeps server draft available when switching to demo and preserves publication status',()=>{
 const draft={id:'draft-1',revision:2,status:'published' as const,course:CourseSchema.parse(sample)};
 const editor=navigate(initialNavigation,{type:'draft',draft});
 expect(editor.selected?.kind).toBe('published');
 const demo=navigate(editor,{type:'demo'});expect(demo.selected).toBeNull();expect(demo.draft).toBe(draft);
 expect(navigate(demo,{type:'draft',draft}).screen).toBe('editor');
});
