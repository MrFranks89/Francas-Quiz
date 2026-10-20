import type {Course} from '@formazione/contracts';
import type {Slide} from './slide';

/** Dati della fonte leggera sotto la slide (components/SourceNote.tsx). */
export type FonteSlide={id:string;label:string;page:number|null;excerpt:string};

/** Le fonti citate dalla slide, nell'ordine di `sourceRefs`. Un riferimento sconosciuto è un errore: il contratto lo esclude. */
export function fontiDellaSlide(course:Course,slide:Slide):FonteSlide[]{
 return slide.sourceRefs.map(id=>{
  const source=course.sources.find(s=>s.id===id);
  if(!source)throw new Error(`Fonte sconosciuta ${id}`);
  return {id:source.id,label:source.label,page:source.page,excerpt:source.excerpt};
 });
}

/**
 * Etichetta discreta sotto la slide, es. «Fonte: pagina 172» oppure
 * «Fonti: pagine 166, 172». Una fonte senza pagina usa la sua etichetta. Nel
 * corso dimostrativo la parola è «Fonte dimostrativa», come prima.
 */
export function etichettaFonti(fonti:FonteSlide[],dimostrativa=false):string{
 const parola=dimostrativa?(fonti.length>1?'Fonti dimostrative':'Fonte dimostrativa'):(fonti.length>1?'Fonti':'Fonte');
 const pagine=fonti.map(f=>f.page);
 if(pagine.every((p):p is number=>p!==null)){
  return pagine.length>1?`${parola}: pagine ${pagine.join(', ')}`:`${parola}: pagina ${pagine[0]}`;
 }
 return `${parola}: ${fonti.map(f=>f.page!==null?`pagina ${f.page}`:f.label).join(' · ')}`;
}
