import type {CorpoImpostazioni,FornitoreImpostazioni,Impostazioni,ModelloImpostazioni} from '../api/settings';

/** La chiave non torna mai dal server: solo se è configurata e, se lunga abbastanza, le ultime 4 cifre. */
export function testoChiave(fornitore:FornitoreImpostazioni):string{
 if(!fornitore.keyConfigured)return 'non configurata';
 return fornitore.keyLast4?`configurata ••••${fornitore.keyLast4}`:'configurata';
}

const usd=(valore:string)=>{const [interi,decimali='']=valore.split('.');return `${interi},${decimali.padEnd(2,'0')}`;};
export function testoPrezzo(modello:ModelloImpostazioni):string{
 // Prezzo 0 solo per i piani gratuiti dichiarati in prezzi.json (measurement/prezzi.py, Prezzo.gratuito).
 if([modello.inputUsdPerMTok,modello.outputUsdPerMTok,modello.cachedInputUsdPerMTok].every(v=>Number(v)===0))return 'gratuito (piano gratuito del fornitore)';
 return `ingresso ${usd(modello.inputUsdPerMTok)} · uscita ${usd(modello.outputUsdPerMTok)} USD per milione di token`;
}

/** Etichetta nell'elenco dei fornitori: chi ha un avviso sui dati (dataNotice) è usato col piano gratuito. */
export function etichettaFornitore(fornitore:FornitoreImpostazioni):string{
 return `${fornitore.label}${fornitore.dataNotice?' (piano gratuito)':''} · chiave ${testoChiave(fornitore)}`;
}

/** Campo chiave vuoto: la chiave salvata resta. Rimuoverla è un'azione a parte. */
export function corpoSalvataggio(provider:string,model:string,chiave:string,rimuovi=false):CorpoImpostazioni{
 if(rimuovi)return {provider,model,removeKey:true};
 const apiKey=chiave.trim();
 return apiKey?{provider,model,apiKey}:{provider,model};
}

/** Il modello configurato se ha un prezzo; altrimenti quello con il prezzo d'uscita più basso. */
export function modelloIniziale(fornitore:FornitoreImpostazioni):string{
 if(fornitore.model&&fornitore.models.some(m=>m.id===fornitore.model))return fornitore.model;
 const ordinati=[...fornitore.models].sort((a,b)=>Number(a.outputUsdPerMTok)-Number(b.outputUsdPerMTok));
 return ordinati[0]?.id??'';
}

export function apriImpostazioniAllAvvio(stato:Impostazioni):boolean{return !stato.configured;}

// Dopo il salvataggio il pannello di generazione rilegge configurazione e preventivo: resta montato
// (con il documento estratto) mentre si usa la schermata Impostazioni, quindi va avvisato.
const ascoltatori=new Set<()=>void>();
export function seguiImpostazioni(ascolta:()=>void):()=>void{ascoltatori.add(ascolta);return ()=>{ascoltatori.delete(ascolta);};}
export function avvisaImpostazioniSalvate():void{for(const ascolta of [...ascoltatori])ascolta();}
