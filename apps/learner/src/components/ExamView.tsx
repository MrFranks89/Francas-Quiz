import React from 'react';
import {Text,TouchableOpacity,View} from 'react-native';
import {usePalette} from '@formazione/civis-ui/src/ThemeProvider';
import {useStyles} from '@formazione/civis-ui/src/comune/stili';
import {TESTO} from '@formazione/civis-ui/src/tema';
import {OptLetter,type OptSt} from '@formazione/civis-ui/src/comune/OptLetter';
import {OptMark} from '@formazione/civis-ui/src/comune/OptMark';
import {statoInCorso,type RigaRiepilogo} from '../state/riepilogo';

/**
 * Vista del test e riepilogo (componenti nostri, con lo stile delle opzioni
 * di Civis: QuizSingleStep ed EsameScreen). QuizSingleStep non si usa: mescola
 * da solo con Math.random e romperebbe l'ordine con seme di displayOptions.
 * Qui le opzioni arrivano già ordinate dal chiamante.
 */

type Palette=ReturnType<typeof usePalette>;
function coloriOpzione(C:Palette,stato:OptSt){
 if(stato==='sel')return {borderColor:C.selBorder,backgroundColor:C.selBg,text:C.text};
 if(stato==='cor')return {borderColor:C.green,backgroundColor:C.greenBg,text:C.greenText};
 if(stato==='wr')return {borderColor:C.red,backgroundColor:C.redBg,text:C.redText};
 if(stato==='dim')return {borderColor:C.borderSubtle,backgroundColor:C.surfaceDark,text:C.textDim};
 return {borderColor:C.slate,backgroundColor:C.surfaceDark,text:C.optionText};
}

function RigaOpzione({i,text,stato,onPress,disabled}:{i:number;text:string;stato:OptSt;onPress?:()=>void;disabled?:boolean}){
 const C=usePalette(),s=useStyles();
 const c=coloriOpzione(C,stato);
 const forte=stato==='sel'||stato==='cor'||stato==='wr';
 const contenuto=<>
  <OptLetter i={i} state={stato}/>
  <Text style={[s.quizOptionText,{marginLeft:11,color:c.text},forte&&{fontWeight:'800'}]}>{text}</Text>
  <OptMark state={stato}/>
 </>;
 const stile=[s.quizOption,{borderColor:c.borderColor,backgroundColor:c.backgroundColor},forte&&{borderWidth:2}];
 if(!onPress)return <View style={stile} accessibilityLabel={`Opzione ${String.fromCharCode(65+i)}: ${text}${stato==='cor'?', giusta':stato==='wr'?', sbagliata, la tua risposta':''}`}>{contenuto}</View>;
 return <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Opzione ${String.fromCharCode(65+i)}: ${text}`} accessibilityState={{selected:stato==='sel',disabled:!!disabled}} style={stile}>{contenuto}</TouchableOpacity>;
}

/** Una domanda mentre si risponde: la scelta è evidenziata in indaco, senza rivelare nulla. */
export function DomandaInCorso({numero,totale,prompt,opzioni,scelta,onScegli,disabled}:{numero:number;totale:number;prompt:string;opzioni:{id:string;text:string}[];scelta:string|undefined;onScegli:(id:string)=>void;disabled?:boolean}){
 const C=usePalette(),s=useStyles();
 return <View style={{marginBottom:18}}>
  <Text style={[s.eyebrow,{marginBottom:6}]}>Domanda {numero} di {totale}</Text>
  <Text style={[s.questionText,{marginBottom:12,color:C.text}]}>{prompt}</Text>
  {opzioni.map((o,i)=><RigaOpzione key={o.id} i={i} text={o.text} stato={statoInCorso(scelta===o.id)} disabled={disabled} onPress={()=>onScegli(o.id)}/>)}
 </View>;
}

/** Una domanda nel riepilogo dell'ultimo tentativo: card con bordo verde o rosso, come in EsameScreen. */
export function RiepilogoDomanda({numero,riga}:{numero:number;riga:RigaRiepilogo}){
 const C=usePalette(),s=useStyles();
 const esito=riga.giusta?'GIUSTA':riga.scelta===null?'SENZA RISPOSTA':'SBAGLIATA';
 return <View style={[s.card,{marginBottom:12,borderColor:riga.giusta?C.green:C.red,borderWidth:1.5}]}>
  <Text style={{color:riga.giusta?C.greenText:C.redText,fontSize:TESTO.minuscolo,fontWeight:'800',letterSpacing:1,marginBottom:6}}>{numero} · {esito}</Text>
  <Text style={{color:C.text,fontSize:TESTO.corpo,fontWeight:'700',lineHeight:23,marginBottom:10}}>{riga.prompt}</Text>
  {riga.scelta===null&&<Text style={{color:C.redText,fontSize:TESTO.piccolo,fontWeight:'700',marginBottom:8}}>Nessuna risposta data: conta come sbagliata.</Text>}
  {riga.opzioni.map((o,i)=><RigaOpzione key={o.id} i={i} text={o.text} stato={o.stato}/>)}
  <Text style={[s.feedbackBody,{marginTop:4,fontSize:TESTO.corpoPiccolo,lineHeight:23}]}>{riga.explanation}</Text>
 </View>;
}
