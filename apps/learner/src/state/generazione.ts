import type {GenerationConfig,GenerationEstimate} from '../api/generation';

/** Testo della configurazione dal fornitore e dalle variabili restituiti dal server (config_status()). */
export function messaggioConfigurazione(config:GenerationConfig|null):string{
 if(config?.configured)return 'Provider AI configurato sul server. Il testo estratto sarà inviato al provider per generare una bozza da revisionare.';
 if(!config)return 'Configurazione AI non ancora letta dal server; nessun corso viene simulato.';
 // Fornitore, modello e chiave si scelgono nella schermata Impostazioni (SettingsScreen), non a mano nel .env.
 if(config.invalid?.length)return `Generazione AI non configurata sul server: ${config.invalid.join(' e ')} non valido (ammessi openai oppure anthropic). Scegli il fornitore nella schermata Impostazioni; nessun corso viene simulato.`;
 const variabili=config.missing.length?` Mancano ${config.missing.join(' e ')}.`:'';
 return `Generazione AI non configurata sul server (fornitore: ${config.provider}).${variabili} Completa la configurazione nella schermata Impostazioni; nessun corso viene simulato.`;
}

/** «0.13» → «0,13»: l'importo arriva già arrotondato per eccesso dal server. */
export function importoUsd(valore:string):string{return `${valore.replace('.',',')} USD`;}

/** Riga del preventivo sopra «Crea bozza AI»; `bloccante` se il server rifiuterebbe la generazione. */
export function testoPreventivo(stima:GenerationEstimate|null):{testo:string;bloccante:boolean}{
 if(!stima)return {testo:'Costo massimo in calcolo…',bloccante:true};
 if(!stima.available||!stima.maxCostUsd)return {testo:`Costo massimo non disponibile: ${stima.refusal?.message??'preventivo assente.'} La generazione è bloccata.`,bloccante:true};
 const blocchi=stima.chunks===1?'1 blocco':`${stima.chunks} blocchi`;
 const riga=`Costo massimo: ${importoUsd(stima.maxCostUsd)} (${stima.model}, ${blocchi})`;
 if(!stima.allowed)return {testo:`${riga}. ${stima.refusal?.message??'Generazione rifiutata dal server.'}`,bloccante:true};
 return {testo:riga,bloccante:false};
}

/** [1,3] → «pagine 1 e 3»; stesso formato dell'avviso della bozza (esclusione_pagine.avviso_esclusione). */
export function elencoPagine(pagine:number[]):string{
 const t=[...pagine].sort((a,b)=>a-b).map(String);
 return t.length===1?`pagina ${t[0]}`:`pagine ${t.slice(0,-1).join(', ')} e ${t[t.length-1]}`;
}
/** Avviso del pannello per le pagine non lette che il server segnala nel preventivo (`unreadPages`). */
export function testoPagineNonLette(pagine:number[]):string{return `Pagine non lette: ${elencoPagine(pagine)} (scansioni senza testo o OCR senza testo utile). Il corso non si genera finché restano: estrai di nuovo con l’OCR, cambia intervallo oppure escludile.`;}
export function testoEsclusione(pagine:number[]):string{return `Escluse dal corso su richiesta: ${elencoPagine(pagine)}. Non saranno inviate al fornitore e l’esclusione resterà scritta nella bozza.`;}

/** Preventivo sulle stesse pagine che la generazione manderebbe: le escluse non contano. */
export function percorsoPreventivo(id:string,escluse:number[]):string{const query=escluse.map(p=>`excludePages=${p}`).join('&');return `/extractions/${id}/generation-estimate${query?`?${query}`:''}`;}
export function corpoGenerazione(title:string,acknowledgeWarnings:boolean,escluse:number[]){return {title,acknowledgeWarnings,excludePages:escluse};}
