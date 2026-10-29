import React, {useState,useReducer} from 'react';
import {Text,TextInput,View,Image,Platform} from 'react-native';
import * as Picker from 'expo-document-picker';
import {parsePageSelection,type Course} from '@formazione/contracts';
import {apiUrl,uploadDocument,extractDocument,type Document,type Extraction} from '../api/documents';
import {FORMATI_AMMESSI,tipiSelettore} from '../api/formats';
import {Button,Card,Notice,styles} from '../components/ui';
import {importReducer,initialImport} from '../state/import';
import {GenerationPanel} from '../components/GenerationPanel';
import type {Draft} from '../api/generation';

export function ImportScreen({onDraft}:{onDraft:(draft:Draft)=>void}) {
 const [{document,range,from,to,engine,result},dispatch]=useReducer(importReducer,initialImport);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[visible,setVisible]=useState(20),[preview,setPreview]=useState<number[]>([]);
 const setRange=(value:boolean)=>{dispatch({type:'range',value});setPreview([]);};
 const setFrom=(value:string)=>{dispatch({type:'from',value});setPreview([]);};
 const setTo=(value:string)=>{dispatch({type:'to',value});setPreview([]);};
 const setEngine=(value:'native'|'docling')=>dispatch({type:'engine',value});
 async function pick() {
  setBusy(true);setError('');
  try { const selected=await Picker.getDocumentAsync({type:tipiSelettore(Platform.OS==='web'),copyToCacheDirectory:true,multiple:false});
   if (!selected.canceled) { const value=await uploadDocument(selected.assets[0]);dispatch({type:'document',value});setPreview([]); }
  } catch(e){setError(e instanceof Error?e.message:'Caricamento non riuscito.');}finally{setBusy(false);}
 }
 async function extract() {
  if(!document)return;setBusy(true);setError('');
  try {const selection=range?parsePageSelection({mode:'range',fromPage:from,toPage:to},document.pageCount!):{mode:'all' as const};dispatch({type:'result',value:await extractDocument(document.id,selection,engine)});setVisible(20);}
  catch(e){setError(e instanceof Error?e.message:'Estrazione non riuscita.');}finally{setBusy(false);}
 }
 return <View style={{gap:20}}>
  <Text style={styles.title}>Dal documento alla conoscenza</Text>
  <Text style={styles.body}>Scegli il materiale, delimita le pagine e controlla le fonti estratte. Il tuo documento rimane distinto dal corso dimostrativo.</Text>
  <Card><Text style={styles.subtitle}>01 · Carica il materiale</Text><Text style={styles.muted}>{FORMATI_AMMESSI} · massimo 25 MB</Text><Button label={busy?'Operazione in corso…':'Scegli un documento'} onPress={pick} disabled={busy}/>
   {document&&<><Text style={styles.body}>{document.name}</Text><Text style={styles.muted}>{document.pageCount?`${document.pageCount} pagine originali`:'Documento senza paginazione fissa'}</Text></>}
  </Card>
  {document&&<Card><Text style={styles.subtitle}>02 · Scegli cosa studiare</Text><View style={styles.row}><Button label="Tutto il volume" disabled={busy} secondary={range} onPress={()=>setRange(false)}/><Button label="Da pagina… a pagina…" secondary={!range} disabled={busy||document.kind!=='pdf'} onPress={()=>setRange(true)}/></View>
   {document.kind!=='pdf'&&<Text style={styles.muted}>La selezione per pagina richiede un PDF. Per gli altri formati si elabora tutto il documento.</Text>}
   {range&&<View style={styles.row}><Text style={styles.body}>Da</Text><TextInput accessibilityLabel="Pagina iniziale" editable={!busy} style={styles.input} keyboardType="number-pad" value={from} onChangeText={setFrom}/><Text style={styles.body}>a</Text><TextInput accessibilityLabel="Pagina finale" editable={!busy} style={styles.input} keyboardType="number-pad" value={to} onChangeText={setTo}/></View>}
   {document.kind==='pdf'&&<><Button label="Controlla le pagine selezionate" secondary disabled={busy} onPress={()=>{try{const selection=range?parsePageSelection({mode:'range',fromPage:from,toPage:to},document.pageCount!):{mode:'all' as const};setPreview(selection.mode==='range'?[selection.fromPage,selection.toPage]:[1,document.pageCount!]);setError('');}catch{setError('Controlla l’intervallo: servono numeri interi tra 1 e il totale pagine.');}}}/><View style={styles.row}>{[...new Set(preview)].map(page=><View key={page} style={{flex:1,minWidth:220}}><Text style={styles.muted}>Pagina originale {page}</Text><Image accessibilityLabel={`Anteprima pagina ${page}`} source={{uri:`${apiUrl}/documents/${document.id}/pages/${page}/preview`}} style={{width:'100%',height:280}} resizeMode="contain"/></View>)}</View></>}
   <Text style={styles.subtitle}>03 · Metodo di lettura</Text><View style={styles.row}><Button label="Testo nativo" disabled={busy} secondary={engine!=='native'} onPress={()=>setEngine('native')}/><Button label="Docling / OCR" disabled={busy} secondary={engine!=='docling'} onPress={()=>setEngine('docling')}/></View><Text style={styles.muted}>Docling richiede i modelli configurati sul server. Eventuali pagine senza testo saranno segnalate.</Text><Button label={busy?'Lettura in corso…':'Estrai il contenuto'} disabled={busy} onPress={extract}/></Card>}
  {!!error&&<Notice text={error} error/>}
  {result&&<Card><Text style={styles.subtitle}>Fonti estratte · {result.blocks.length} blocchi</Text><Notice text={result.status==='needs_review'?'Sono presenti contenuti da verificare prima di creare un corso.':'Estrazione completata. Controlla i contenuti prima della generazione didattica.'}/>{result.warnings.map((w,i)=><Notice key={i} text={w} error/>)}{result.blocks.slice(0,visible).map(block=><View key={block.id} style={{gap:6}}><Text style={styles.subtitle}>{block.label}{block.page?` · pagina ${block.page}`:''}</Text><Text style={styles.body}>{block.text}</Text></View>)}{visible<result.blocks.length&&<Button label={`Mostra altri blocchi (${visible}/${result.blocks.length})`} secondary onPress={()=>setVisible(v=>v+20)}/>}
   <GenerationPanel key={result.id} extraction={result} onDraft={onDraft}/>
  </Card>}
  <Text style={styles.muted}>API di sviluppo locale · {apiUrl}</Text>
 </View>;
}

