import type {Course} from '@formazione/contracts';
export function changeField(course:Course,path:(string|number)[],value:unknown):Course{
 const copy=JSON.parse(JSON.stringify(course)) as Course;
 let target=copy as unknown as Record<string|number,unknown>;
 for(const part of path.slice(0,-1))target=target[part] as Record<string|number,unknown>;
 target[path.at(-1)!]=value;return copy;
}
export function strictPositive(value:string):number{return /^[1-9]\d*$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):NaN;}
