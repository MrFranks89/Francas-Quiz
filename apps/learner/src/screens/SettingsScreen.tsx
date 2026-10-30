import React,{useEffect,useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {usePalette} from '@formazione/civis-ui/src/ThemeProvider';
import {useStyles} from '@formazione/civis-ui/src/comune/stili';
import {TESTO} from '@formazione/civis-ui/src/tema';
import {Btn} from '@formazione/civis-ui/src/comune/Btn';
import {Card} from '@formazione/civis-ui/src/comune/Card';
import {Avviso,Pillola} from '../components/lettore';
import {leggiImpostazioni,salvaImpostazioni,type Impostazioni} from '../api/settings';
import {avvisaImpostazioniSalvate,corpoSalvataggio,modelloIniziale,testoChiave,testoPrezzo} from '../state/impostazioni';

/**
 * Fornitore, modello e chiave API dell'operatore locale. La chiave va al server (services/api/.env)
 * e non torna mai indietro: dopo il salvataggio il campo si svuota e resta solo «configurata ••••1234».
 * Nella versione per studenti questa schermata non esisterà.
 */
export function SettingsScreen({primoAvvio=false,onChiudi}:{primoAvvio?:boolean;onChiudi:()=>void}){
 const C=usePalette(),s=useStyles();
 const [stato,setStato]=useState<Impostazioni|null>(null),[fornitore,setFornitore]=useState(''),[modello,setModello]=useState(''),[chiave,setChiave]=useState('');
 const [busy,setBusy]=useState(false),[errore,setErrore]=useState(''),[esito,setEsito]=useState('');
 function mostra(nuovo:Impostazioni,scelto?:string){
  const voce=nuovo.providers.find(f=>f.id===(scelto??nuovo.activeProvider))??nuovo.providers.find(f=>f.keyConfigured)??nuovo.providers[0];
  setStato(nuovo);
  if(voce){setFornitore(voce.id);setModello(modelloIniziale(voce));}
 }
 useEffect(()=>{let vivo=true;leggiImpostazioni().then(n=>{if(vivo)mostra(n);}).catch(e=>{if(vivo)setErrore(e instanceof Error?e.message:'Impostazioni non disponibili.');});return()=>{vivo=false;};},[]);
 const voce=stato?.providers.find(f=>f.id===fornitore);
 function scegliFornitore(id:string){const f=stato?.providers.find(p=>p.id===id);if(!f)return;setFornitore(id);setModello(modelloIniziale(f));setChiave('');setEsito('');}
 async function salva(rimuovi=false){
  if(!voce)return;setBusy(true);setErrore('');setEsito('');
  try{
   const nuovo=await salvaImpostazioni(corpoSalvataggio(voce.id,modello,chiave,rimuovi));
   setChiave('');mostra(nuovo,voce.id);avvisaImpostazioniSalvate();
   setEsito(rimuovi?`Chiave ${voce.label} rimossa dal server.`:nuovo.configured?`Impostazioni salvate: ${voce.label}, ${modello}. Il pannello di generazione usa già questa configurazione.`:'Impostazioni salvate. Manca ancora la chiave del fornitore scelto.');
  }catch(e){setErrore(e instanceof Error?e.message:'Impostazioni non salvate.');}
  finally{setBusy(false);}
 }
 const testo={color:C.textMuted,fontSize:TESTO.corpoPiccolo,lineHeight:22};
 return <View style={{gap:18,width:'100%',maxWidth:760,alignSelf:'center'}}>
  <View style={{gap:6}}>
   <Text style={s.eyebrow}>Impostazioni</Text>
   <Text style={[s.slideHeading,{marginBottom:0}]}>Fornitore AI e chiave</Text>
  </View>
  {primoAvvio&&<Avviso testo="Per creare bozze dai documenti serve un fornitore AI. Scegli fornitore e modello e incolla la tua chiave API: resta sul server di questo computer, nel file services/api/.env, e non viene più mostrata."/>}
  {!!errore&&<Avviso testo={errore} errore/>}
  {!stato&&!errore&&<Text style={testo}>Lettura delle impostazioni…</Text>}
  {stato&&voce&&<>
   <Card style={{gap:12}}>
    <Text style={s.eyebrow}>Fornitore</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{stato.providers.map(f=><Pillola key={f.id} label={`${f.label} · chiave ${testoChiave(f)}`} attiva={f.id===fornitore} disabled={busy} onPress={()=>scegliFornitore(f.id)}/>)}</View>
    {!!voce.notice&&<Avviso testo={voce.notice} errore/>}
   </Card>
   <Card style={{gap:12}}>
    <Text style={s.eyebrow}>Modello</Text>
    <Text style={testo}>Solo i modelli con un prezzo registrato: il costo massimo di ogni generazione si calcola da questi prezzi.</Text>
    {voce.model&&voce.modelPriced===false&&<Avviso testo={`Il modello configurato (${voce.model}) non ha un prezzo registrato: scegline uno dall’elenco.`} errore/>}
    <View style={{gap:8}}>{voce.models.map(m=><Pillola key={m.id} label={`${m.id} · ${testoPrezzo(m)}`} attiva={m.id===modello} disabled={busy} onPress={()=>setModello(m.id)}/>)}</View>
   </Card>
   <Card style={{gap:12}}>
    <Text style={s.eyebrow}>Chiave API {voce.label}</Text>
    <Text style={{color:voce.keyConfigured?C.greenText:C.textDim,fontSize:TESTO.corpo,fontWeight:'700'}}>{testoChiave(voce)}</Text>
    <TextInput accessibilityLabel={`Nuova chiave API ${voce.label}`} value={chiave} onChangeText={setChiave} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" editable={!busy}
     placeholder={voce.keyConfigured?'Lascia vuoto per tenere la chiave salvata':'Incolla qui la chiave'} placeholderTextColor={C.textVeryDim}
     style={{borderWidth:1.5,borderColor:C.border,borderRadius:12,padding:14,fontSize:TESTO.corpo,color:C.text,backgroundColor:C.inputBg}}/>
    <Text style={[testo,{fontSize:TESTO.minuscolo}]}>La chiave è salvata solo sul server di questo computer e non viene mai rimostrata. Un campo vuoto non cancella la chiave salvata.</Text>
   </Card>
   {!!esito&&<Avviso testo={esito} colore={C.green}/>}
   <Btn label={busy?'Salvataggio…':'Salva'} primary color={C.indigo} disabled={busy||!modello} onPress={()=>void salva()}/>
   {voce.keyConfigured&&<Btn label={`Rimuovi chiave ${voce.label}`} disabled={busy} onPress={()=>void salva(true)}/>}
   {stato.configured&&<Btn label="Vai ai materiali" disabled={busy} onPress={onChiudi}/>}
  </>}
 </View>;
}
