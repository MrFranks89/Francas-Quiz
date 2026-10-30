import {corpoGenerazione,elencoPagine,percorsoPreventivo,importoUsd,messaggioConfigurazione,testoEsclusione,testoPagineNonLette,testoPreventivo} from './generazione';
it('names the variables of the selected provider, not always OpenAI',()=>{
 const testo=messaggioConfigurazione({configured:false,provider:'anthropic',missing:['ANTHROPIC_API_KEY','ANTHROPIC_MODEL']});
 expect(testo).toContain('ANTHROPIC_API_KEY e ANTHROPIC_MODEL');
 expect(testo).toContain('anthropic');
 expect(testo).not.toContain('OPENAI');
 expect(messaggioConfigurazione({configured:false,provider:'openai',missing:['OPENAI_MODEL']})).toContain('OPENAI_MODEL');
});
it('reports an invalid provider variable',()=>{
 const testo=messaggioConfigurazione({configured:false,provider:'non_valido',missing:[],invalid:['GENERATION_PROVIDER']});
 expect(testo).toContain('GENERATION_PROVIDER non valido');
 expect(testo).not.toContain('OPENAI');
});
it('configured provider and unread configuration',()=>{
 expect(messaggioConfigurazione({configured:true,provider:'anthropic',missing:[]})).toContain('Provider AI configurato');
 expect(messaggioConfigurazione(null)).not.toContain('OPENAI');
});
it('shows the guaranteed maximum cost with model and chunks',()=>{
 expect(testoPreventivo({available:true,allowed:true,provider:'anthropic',model:'claude-haiku-5-5',chunks:9,maxCostUsd:'0.12'}))
  .toEqual({testo:'Costo massimo: 0,12 USD (claude-haiku-5-5, 9 blocchi)',bloccante:false});
 expect(testoPreventivo({available:true,allowed:true,model:'m',chunks:1,maxCostUsd:'0.01'}).testo).toContain('1 blocco)');
 expect(importoUsd('12.50')).toBe('12,50 USD');
});
it('blocks when the estimate is unavailable, refused or not loaded',()=>{
 expect(testoPreventivo(null).bloccante).toBe(true);
 const assente=testoPreventivo({available:false,allowed:false,refusal:{code:'estimate_unavailable',message:'Preventivo non disponibile: Modello senza prezzo.'}});
 expect(assente).toMatchObject({bloccante:true});
 expect(assente.testo).toContain('Modello senza prezzo');
 const oltre=testoPreventivo({available:true,allowed:false,model:'m',chunks:2,maxCostUsd:'0.20',refusal:{code:'over_course_limit',message:'Oltre il limite per corso.'}});
 expect(oltre).toEqual({testo:'Costo massimo: 0,20 USD (m, 2 blocchi). Oltre il limite per corso.',bloccante:true});
});
it('points to the Settings screen when the provider is not configured',()=>{
 const testo=messaggioConfigurazione({configured:false,provider:'openai',missing:['OPENAI_API_KEY','OPENAI_MODEL']});
 expect(testo).toContain('Impostazioni');
 expect(testo).not.toContain('Imposta OPENAI');
 expect(messaggioConfigurazione({configured:false,provider:'non_valido',missing:[],invalid:['GENERATION_PROVIDER']})).toContain('Impostazioni');
});
it('lists unread and excluded pages',()=>{
 expect(elencoPagine([3])).toBe('pagina 3');
 expect(elencoPagine([3,1])).toBe('pagine 1 e 3');
 expect(elencoPagine([1,3,5])).toBe('pagine 1, 3 e 5');
 expect(testoPagineNonLette([1,3])).toContain('Pagine non lette: pagine 1 e 3');
 expect(testoEsclusione([1,3])).toBe('Escluse dal corso su richiesta: pagine 1 e 3. Non saranno inviate al fornitore e l’esclusione resterà scritta nella bozza.');
});
it('sends the excluded pages to the estimate and to the generation',()=>{
 expect(percorsoPreventivo('e1',[])).toBe('/extractions/e1/generation-estimate');
 expect(percorsoPreventivo('e1',[1,3])).toBe('/extractions/e1/generation-estimate?excludePages=1&excludePages=3');
 expect(corpoGenerazione('Corso',true,[1,3])).toEqual({title:'Corso',acknowledgeWarnings:true,excludePages:[1,3]});
 expect(corpoGenerazione('Corso',false,[])).toEqual({title:'Corso',acknowledgeWarnings:false,excludePages:[]});
});
