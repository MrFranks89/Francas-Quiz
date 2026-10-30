import React,{useEffect,useState,useRef} from 'react';
import {View,Text,TextInput,Switch} from 'react-native';
import type {Course} from '@formazione/contracts';
import {generationConfig,generationEstimate,generateDraft,type GenerationConfig,type GenerationEstimate,type Draft} from '../api/generation';
import {messaggioConfigurazione,testoPreventivo} from '../state/generazione';
import {seguiImpostazioni} from '../state/impostazioni';
import type {Extraction} from '../api/documents';
import {Button,Notice,styles} from './ui';
export function GenerationPanel({extraction,onDraft}:{extraction:Extraction;onDraft:(draft:Draft)=>void}){
 const [config,setConfig]=useState<GenerationConfig|null>(null),[error,setError]=useState(''),[title,setTitle]=useState('Il mio corso'),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[estimate,setEstimate]=useState<GenerationEstimate|null>(null);
 const preventivo=testoPreventivo(estimate);
 const alive=useRef(true);
 async function refresh(){try{setConfig(await generationConfig());setEstimate(await generationEstimate(extraction.id));setError('');}catch(e){setError(e instanceof Error?e.message:'AI non raggiungibile.');}}
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;};},[]);
 // Dopo un salvataggio in Impostazioni: nuova configurazione e nuovo preventivo, senza ricaricare.
 useEffect(()=>seguiImpostazioni(()=>{void refresh();}),[]);
 async function generate(){setBusy(true);setError('');try{const draft=await generateDraft(extraction.id,title,ack);if(alive.current)onDraft(draft);}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Generazione non riuscita.');}finally{if(alive.current)setBusy(false);}}
 return <View style={{gap:14}}><Text style={styles.subtitle}>04 · Crea una bozza didattica</Text><Notice text={messaggioConfigurazione(config)}/><TextInput accessibilityLabel="Titolo del corso" style={styles.input} value={title} onChangeText={setTitle} editable={!busy}/><View style={styles.row}><Switch accessibilityLabel="Ho verificato il testo estratto e gli avvisi" value={ack} onValueChange={setAck} disabled={busy}/><Text style={styles.body}>Ho verificato il testo estratto e gli avvisi</Text></View>{!!error&&<Notice text={error} error/>}{!!config?.configured&&<Notice text={preventivo.testo} error={preventivo.bloccante&&!!estimate}/>}<View style={styles.row}><Button label={busy?'Generazione in corso…':'Crea bozza AI'} disabled={busy||extraction.blocks.length===0||!config?.configured||preventivo.bloccante||!title.trim()||(extraction.status==='needs_review'&&!ack)} onPress={generate}/><Button label="Ricontrolla configurazione AI" secondary disabled={busy} onPress={refresh}/></View><Text style={styles.muted}>La bozza non viene pubblicata automaticamente. La generazione può richiedere diversi minuti.</Text></View>;
}

