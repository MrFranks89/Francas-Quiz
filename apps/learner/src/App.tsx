import React,{useReducer,useState} from 'react';
import {SafeAreaView,ScrollView,Text,View,TextInput,useWindowDimensions,Platform} from 'react-native';
import * as Picker from 'expo-document-picker';
import {File} from 'expo-file-system';
import {CourseSchema} from '@formazione/contracts';
import {StatusBar} from 'expo-status-bar';
import {usePalette,useTheme} from '@formazione/civis-ui/src/ThemeProvider';
import {TESTO} from '@formazione/civis-ui/src/tema';
import {Button,Card,styles} from './components/ui';
import {Avviso,InterruttoreTema,Pillola} from './components/lettore';
import {TemaIniziale} from './components/TemaIniziale';
import {ImportScreen} from './screens/ImportScreen';
import {CourseScreen} from './screens/CourseScreen';
import {EditorScreen} from './screens/EditorScreen';
import {navigate,initialNavigation} from './state/navigation';
import {recoverDraft as fetchDraft} from './api/generation';

export default function App(){
 return <TemaIniziale><Shell/></TemaIniziale>;
}

// Importazione ed editor usano ancora components/ui.tsx, con colori chiari
// fissi: restano su un fondo chiaro anche nel tema scuro, per restare
// leggibili. Il tema chiaro e scuro vale per la cornice e per il lettore.
const FONDO_STRUMENTI='#f3f7f8';

function Shell(){
 const C=usePalette(),{dark}=useTheme();
 const [{screen,selected,draft},dispatch]=useReducer(navigate,initialNavigation);
 const {width}=useWindowDimensions();
 const [error,setError]=useState(''),[draftId,setDraftId]=useState(''),[loading,setLoading]=useState(false);
 async function importCourse(){try{const picked=await Picker.getDocumentAsync({type:'application/json',copyToCacheDirectory:true});if(picked.canceled)return;const asset=picked.assets[0];const text=Platform.OS==='web'?await asset.file!.text():await new File(asset.uri).text();dispatch({type:'imported',course:CourseSchema.parse(JSON.parse(text))});setError('');}catch{setError('Corso JSON non valido: controlla struttura, fonti e riferimenti prima di importarlo.');}}
 async function recoverDraft(){setLoading(true);setError('');try{if(!/^[a-zA-Z0-9_-]+$/.test(draftId))throw new Error('ID bozza non valido.');dispatch({type:'draft',draft:await fetchDraft(draftId)});}catch(e){setError(e instanceof Error?e.message:'Bozza non recuperabile.');}finally{setLoading(false);}}
 const strumenti=screen==='import'||screen==='editor';
 return <SafeAreaView style={{flex:1,backgroundColor:C.bg}}><StatusBar style={dark?'light':'dark'}/><ScrollView style={{backgroundColor:C.bg}} contentContainerStyle={{padding:width<600?16:36,gap:24,maxWidth:1160,width:'100%',alignSelf:'center'}}>
  <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:16}}>
   <View style={{gap:4}}><Text style={{fontSize:TESTO.titoloMedio,fontWeight:'800',color:C.text}}>studio<Text style={{color:C.teal}}> / formazione</Text></Text><Text style={{color:C.textDim,fontSize:TESTO.piccolo}}>Il sapere aziendale, un passo alla volta.</Text></View>
   <InterruttoreTema/>
  </View>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
   <Pillola label="Materiali" attiva={screen==='import'} onPress={()=>dispatch({type:'screen',screen:'import'})}/>
   <Pillola label="Prova il corso" attiva={screen==='course'&&selected===null} onPress={()=>dispatch({type:'demo'})}/>
   <Pillola label="Importa corso JSON" onPress={importCourse}/>
   {draft&&<Pillola label="Gestisci bozza" attiva={screen==='editor'} onPress={()=>dispatch({type:'draft',draft})}/>}
  </View>
  <View style={{height:1,backgroundColor:C.divider}}/>{!!error&&<Avviso testo={error} errore/>}
  {strumenti&&<View style={{backgroundColor:FONDO_STRUMENTI,borderRadius:20,padding:width<600?12:24,gap:28}}>
   {screen==='import'&&<><ImportScreen onDraft={draft=>dispatch({type:'draft',draft})}/><Card><Text style={styles.subtitle}>Riprendi una bozza salvata</Text><Text style={styles.muted}>Inserisci l’ID restituito dal server. Un corso JSON importato rimane una sola anteprima locale.</Text><TextInput accessibilityLabel="ID bozza salvata" style={styles.input} value={draftId} onChangeText={setDraftId} autoCapitalize="none"/><Button label="Recupera bozza" disabled={loading||!draftId.trim()} onPress={recoverDraft}/></Card></>}
   {screen==='editor'&&draft&&<EditorScreen key={draft.id} draft={draft} onChange={draft=>dispatch({type:'draft',draft})} onPreview={()=>dispatch({type:'screen',screen:'course'})}/>}
  </View>}
  {screen==='course'&&<CourseScreen key={selected?`${selected.course.id}:${selected.course.version}`:'demo'} currentCourse={selected?.course} kind={selected?.kind}/>}
  <Text style={{color:C.textDim,fontSize:TESTO.minuscolo}}>Prototipo locale · materiali e progressi sul tuo ambiente di sviluppo</Text>
 </ScrollView></SafeAreaView>;
}
