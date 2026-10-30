import {CourseSchema,type Course} from '@formazione/contracts';
import {apiUrl} from './documents';
import {apiErrorMessage} from './errors';
export type GenerationConfig={configured:boolean;provider:string;missing:string[];invalid?:string[];spending?:{maxUsdPerCourse?:string;budgetUsd?:string;spentUsd:string;error?:{code:string;message:string}}};
export type GenerationEstimate={available:boolean;allowed:boolean;provider?:string;model?:string;chunks?:number;maxCostUsd?:string;upperBoundUsd?:string;refusal?:{code:string;message:string}};
export type Draft={id:string;revision?:number;status:'draft'|'published';course:Course};
export async function generationConfig():Promise<GenerationConfig>{const r=await fetch(`${apiUrl}/generation/config`);if(!r.ok)throw new Error('Configurazione AI non disponibile.');return r.json();}
export async function generationEstimate(id:string):Promise<GenerationEstimate>{const r=await fetch(`${apiUrl}/extractions/${id}/generation-estimate`);const result=await r.json();if(!r.ok)throw new Error(apiErrorMessage(result,'Preventivo non disponibile.'));return result;}
export async function generateDraft(id:string,title:string,acknowledgeWarnings:boolean):Promise<Draft>{
 const response=await fetch(`${apiUrl}/extractions/${id}/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,acknowledgeWarnings})});
 const result=await response.json();if(!response.ok)throw new Error(apiErrorMessage(result,'Generazione non riuscita.'));return {...result,course:CourseSchema.parse(result.course)};
}
export async function draftRequest(path:string,method='GET',body?:unknown):Promise<Draft>{
 const response=await fetch(`${apiUrl}${path}`,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json();if(!response.ok)throw new Error(apiErrorMessage(result,'Operazione non riuscita.'));return {...result,course:CourseSchema.parse(result.course)};
}
export async function recoverDraft(id:string):Promise<Draft>{
 const response=await fetch(`${apiUrl}/courses/${id}`);
 if(response.status===404)return draftRequest(`/drafts/${id}`);
 const result=await response.json();if(!response.ok)throw new Error(apiErrorMessage(result,'Corso non recuperabile.'));return {...result,course:CourseSchema.parse(result.course)};
}
