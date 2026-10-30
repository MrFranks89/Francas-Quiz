import type {GenerationConfig,GenerationEstimate} from '../api/generation';

/** Testo della configurazione dal fornitore e dalle variabili restituiti dal server (config_status()). */
export function messaggioConfigurazione(config:GenerationConfig|null):string{
 if(config?.configured)return 'Provider AI configurato sul server. Il testo estratto sarà inviato al provider per generare una bozza da revisionare.';
 if(!config)return 'Configurazione AI non ancora letta dal server; nessun corso viene simulato.';
 if(config.invalid?.length)return `Generazione AI non configurata sul server: ${config.invalid.join(' e ')} non valido (ammessi openai oppure anthropic); nessun corso viene simulato.`;
 const variabili=config.missing.length?` Imposta ${config.missing.join(' e ')};`:'';
 return `Generazione AI non configurata sul server (fornitore: ${config.provider}).${variabili} nessun corso viene simulato.`;
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
