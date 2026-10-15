import type {Course} from '@formazione/contracts';
export function changeField(course:Course,path:(string|number)[],value:unknown):Course{
 const copy=JSON.parse(JSON.stringify(course)) as Course;
 let target=copy as unknown as Record<string|number,unknown>;
 for(const part of path.slice(0,-1))target=target[part] as Record<string|number,unknown>;
 target[path.at(-1)!]=value;return copy;
}
export function strictPositive(value:string):number{return /^[1-9]\d*$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):NaN;}
export type EditorState={course:Course;dirty:boolean;reviewed:boolean;busy:boolean;error:string};
export type EditorAction={type:'change';path:(string|number)[];value:unknown}|{type:'start'}|{type:'end'}|{type:'error';message:string}|{type:'saved';course:Course}|{type:'reviewed';value:boolean};
export function createEditorState(course:Course):EditorState{return {course,dirty:false,reviewed:false,busy:false,error:''};}
export function editorReducer(state:EditorState,action:EditorAction):EditorState{
 switch(action.type){
  case 'change':return {...state,course:changeField(state.course,action.path,action.value),dirty:true,reviewed:false};
  case 'start':return {...state,busy:true,error:''};
  case 'end':return {...state,busy:false};
  case 'error':return {...state,error:action.message};
  case 'saved':return {...state,course:action.course,dirty:false};
  case 'reviewed':return {...state,reviewed:action.value};
 }
}
