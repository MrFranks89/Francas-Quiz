import type {Course} from '@formazione/contracts';
import type {Draft} from '../api/generation';
export type Navigation={screen:'import'|'course'|'editor';selected:{course:Course;kind:'draft'|'published'|'imported'}|null;draft:Draft|null};
export const initialNavigation:Navigation={screen:'import',selected:null,draft:null};
export type NavigationAction={type:'screen';screen:Navigation['screen']}|{type:'draft';draft:Draft}|{type:'imported';course:Course}|{type:'demo'};
export function navigate(state:Navigation,action:NavigationAction):Navigation{
 switch(action.type){case 'screen':return {...state,screen:action.screen};case 'demo':return {...state,screen:'course',selected:null};case 'draft':return {...state,screen:'editor',draft:action.draft,selected:{course:action.draft.course,kind:action.draft.status}};case 'imported':return {...state,screen:'course',selected:{course:action.course,kind:'imported'}};}
}
