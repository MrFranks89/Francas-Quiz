import {CourseSchema,type Course} from '@formazione/contracts';
import {apiUrl} from './documents';
export type GenerationConfig={configured:boolean;provider:string;missing:string[]};
export type Draft={id:string;revision?:number;status:'draft'|'published';course:Course};
export async function generationConfig():Promise<GenerationConfig>{const r=await fetch(`${apiUrl}/generation/config`);if(!r.ok)throw new Error('Configurazione AI non disponibile.');return r.json();}
export async function generateDraft(id:string,title:string,acknowledgeWarnings:boolean):Promise<Draft>{
 const response=await fetch(`${apiUrl}/extractions/${id}/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,acknowledgeWarnings})});
 const result=await response.json();if(!response.ok)throw new Error(typeof result.detail==='string'?result.detail:'Generazione non riuscita.');return {...result,course:CourseSchema.parse(result.course)};
}
export async function draftRequest(path:string,method='GET',body?:unknown):Promise<Draft>{
 const response=await fetch(`${apiUrl}${path}`,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json();if(!response.ok)throw new Error(typeof result.detail==='string'?result.detail:'Operazione non riuscita.');return {...result,course:CourseSchema.parse(result.course)};
}
export async function recoverDraft(id:string):Promise<Draft>{
 const response=await fetch(`${apiUrl}/courses/${id}`);
 if(response.status===404)return draftRequest(`/drafts/${id}`);
 const result=await response.json();if(!response.ok)throw new Error(typeof result.detail==='string'?result.detail:'Corso non recuperabile.');return {...result,course:CourseSchema.parse(result.course)};
}
