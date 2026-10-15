import React,{useReducer,useState} from 'react';
import {SafeAreaView,ScrollView,Text,View,TextInput,useWindowDimensions,Platform} from 'react-native';
import * as Picker from 'expo-document-picker';
import {File} from 'expo-file-system';
import {CourseSchema} from '@formazione/contracts';
import {StatusBar} from 'expo-status-bar';
import {Button,Card,colors,styles,Notice} from './components/ui';
import {ImportScreen} from './screens/ImportScreen';
import {CourseScreen} from './screens/CourseScreen';
import {EditorScreen} from './screens/EditorScreen';
import {navigate,initialNavigation} from './state/navigation';
import {recoverDraft as fetchDraft} from './api/generation';
export default function App(){
 const [{screen,selected,draft},dispatch]=useReducer(navigate,initialNavigation);
 const {width}=useWindowDimensions();
 const [error,setError]=useState(''),[draftId,setDraftId]=useState(''),[loading,setLoading]=useState(false);
 async function importCourse(){try{const picked=await Picker.getDocumentAsync({type:'application/json',copyToCacheDirectory:true});if(picked.canceled)return;const asset=picked.assets[0];const text=Platform.OS==='web'?await asset.file!.text():await new File(asset.uri).text();dispatch({type:'imported',course:CourseSchema.parse(JSON.parse(text))});setError('');}catch{setError('Corso JSON non valido: controlla struttura, fonti e riferimenti prima di importarlo.');}}
 async function recoverDraft(){setLoading(true);setError('');try{if(!/^[a-zA-Z0-9_-]+$/.test(draftId))throw new Error('ID bozza non valido.');dispatch({type:'draft',draft:await fetchDraft(draftId)});}catch(e){setError(e instanceof Error?e.message:'Bozza non recuperabile.');}finally{setLoading(false);}}
 return <SafeAreaView style={{flex:1,backgroundColor:'#f3f7f8'}}><StatusBar style="dark"/><ScrollView contentContainerStyle={{padding:width<600?16:36,gap:28,maxWidth:1160,width:'100%',alignSelf:'center'}}>
  <View style={[styles.row,{justifyContent:'space-between'}]}><View style={{gap:5}}><Text style={{fontSize:23,fontWeight:'800',color:colors.navy}}>studio<Text style={{color:colors.teal}}> / formazione</Text></Text><Text style={styles.muted}>Il sapere aziendale, un passo alla volta.</Text></View><View style={[styles.row,{maxWidth:'100%',flexShrink:1},width<700&&{width:'100%'}]}><Button label="Materiali" secondary={screen!=='import'} onPress={()=>dispatch({type:'screen',screen:'import'})}/><Button label="Prova il corso" secondary={screen!=='course'||selected!==null} onPress={()=>dispatch({type:'demo'})}/><Button label="Importa corso JSON" secondary onPress={importCourse}/>{draft&&<Button label="Gestisci bozza" secondary onPress={()=>dispatch({type:'draft',draft})}/>}</View></View>
  <View style={{height:1,backgroundColor:colors.line}}/>{!!error&&<Notice text={error} error/>}
  {screen==='import'&&<><ImportScreen onDraft={draft=>dispatch({type:'draft',draft})}/><Card><Text style={styles.subtitle}>Riprendi una bozza salvata</Text><Text style={styles.muted}>Inserisci l’ID restituito dal server. Un corso JSON importato rimane una sola anteprima locale.</Text><TextInput accessibilityLabel="ID bozza salvata" style={styles.input} value={draftId} onChangeText={setDraftId} autoCapitalize="none"/><Button label="Recupera bozza" disabled={loading||!draftId.trim()} onPress={recoverDraft}/></Card></>}
  {screen==='course'&&<CourseScreen key={selected?`${selected.course.id}:${selected.course.version}`:'demo'} currentCourse={selected?.course} kind={selected?.kind}/>}
  {screen==='editor'&&draft&&<EditorScreen key={draft.id} draft={draft} onChange={draft=>dispatch({type:'draft',draft})} onPreview={()=>dispatch({type:'screen',screen:'course'})}/>}
  <Text style={styles.muted}>Prototipo locale · materiali e progressi sul tuo ambiente di sviluppo</Text>
 </ScrollView></SafeAreaView>;
}

