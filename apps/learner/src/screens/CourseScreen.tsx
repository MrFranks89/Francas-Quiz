import React,{useEffect,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {canAccessModule,completeLesson,submitExam,createProgress,displayOptions,valutaTentativo,descriviValutazione,type Answer,type Progress} from '@formazione/learning-engine';
import {usePalette} from '@formazione/civis-ui/src/ThemeProvider';
import {useStyles} from '@formazione/civis-ui/src/comune/stili';
import {TESTO} from '@formazione/civis-ui/src/tema';
import {Btn} from '@formazione/civis-ui/src/comune/Btn';
import {Card} from '@formazione/civis-ui/src/comune/Card';
import {ProgressBar} from '@formazione/civis-ui/src/comune/ProgressBar';
import {SlideStep} from '@formazione/civis-ui/src/lezione/SlideStep';
import {course,loadProgress,saveProgress,resetProgress} from '../state/course';
import {slidePerCivis} from '../state/slide';
import {fontiDellaSlide} from '../state/fonti';
import {riepilogoUltimoTentativo} from '../state/riepilogo';
import {presentazione} from '../state/presentazione';
import {SourceNote} from '../components/SourceNote';
import {DomandaInCorso,RiepilogoDomanda} from '../components/ExamView';
import {Avviso,Pillola} from '../components/lettore';
import type {Course} from '@formazione/contracts';

// Il lettore legge da sé titolo e testi delle slide: a SlideStep passa sempre
// `onTesti`, così il pulsante altoparlante (voce sostituita, senza effetto)
// non viene disegnato. Vedi packages/civis-ui/__tests__/nostri/SlideStep.lettore.test.tsx.
const nessunaLettura=()=>{};

export function CourseScreen({currentCourse=course,kind='demo'}:{currentCourse?:Course;kind?:'demo'|'draft'|'published'|'imported'}){
 const course=currentCourse;
 const C=usePalette(),s=useStyles();
 const [progress,setProgress]=useState<Progress>(createProgress(course)),[ready,setReady]=useState(false),[error,setError]=useState('');
 const [active,setActive]=useState(course.modules[0].id),[answers,setAnswers]=useState<Record<string,string[]>>({}),[saving,setSaving]=useState(false);
 // Lezione aperta e slide corrente; «retrying»: nuovo tentativo avviato dopo il riepilogo.
 const [openLesson,setOpenLesson]=useState<string|null>(null),[slideIndex,setSlideIndex]=useState(0),[retrying,setRetrying]=useState(false);
 useEffect(()=>{let live=true;loadProgress(course).then(p=>{if(live)setProgress(p);}).catch(e=>{if(live)setError(String(e.message));}).finally(()=>{if(live)setReady(true);});return()=>{live=false;};},[course]);
 async function update(next:Progress){setSaving(true);setError('');try{await saveProgress(next);setProgress(next);}catch{setError('Salvataggio non riuscito. Riprova prima di proseguire.');}finally{setSaving(false);}}
 const module=course.modules.find(m=>m.id===active)!;
 const unlocked=canAccessModule(course,progress,module.id),exam=module.exam;
 const attempts=progress.attempts.filter(a=>a.examId===exam?.id),last=attempts.at(-1);
 const gatePassed=exam?.mode==='gate'&&attempts.some(a=>a.passed);
 const exhausted=exam?.maxAttempts!==null&&exam!==null&&attempts.length>=exam.maxAttempts;
 const lessonsDone=module.lessons.every(l=>progress.completedLessonIds.includes(l.id));
 const totalLessons=course.modules.flatMap(m=>m.lessons).length;
 // Si risponde al primo tentativo, oppure dopo «Nuovo tentativo»; altrimenti si vede il riepilogo dell'ultimo.
 const answering=!!exam&&lessonsDone&&!gatePassed&&!exhausted&&(!last||retrying);
 // Dopo la consegna le risposte restano visibili: il riepilogo le legge dal tentativo salvato, non da `answers`.
 async function submit(){if(!exam)return;try{await update(submitExam(course,progress,exam.id,`attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`,exam.questionIds.filter(id=>answers[id]?.length).map(questionId=>risposta(questionId,answers[questionId]))));setAnswers({});setRetrying(false);}catch(e){setError(e instanceof Error?e.message:'Valutazione non riuscita.');}}
 // Risposta multipla: ogni tocco aggiunge o toglie l'opzione; negli altri tipi la sostituisce.
 function scegli(q:Course['questions'][number],attuali:string[],optionId:string){return q.kind!=='multiple'?[optionId]:attuali.includes(optionId)?attuali.filter(x=>x!==optionId):[...attuali,optionId];}
 function risposta(questionId:string,scelte:string[]):Answer{return course.questions.find(q=>q.id===questionId)!.kind==='multiple'?{questionId,optionIds:scelte}:{questionId,optionId:scelte[0]};}
 function chooseModule(id:string){setActive(id);setAnswers({});setRetrying(false);setOpenLesson(null);}
 function openAt(lessonId:string){setOpenLesson(lessonId);setSlideIndex(0);}
 function nextSlide(lessonId:string,count:number){
  if(!ready||saving)return;
  if(slideIndex<count-1){setSlideIndex(slideIndex+1);return;}
  setOpenLesson(null);
  if(!progress.completedLessonIds.includes(lessonId)){try{void update(completeLesson(course,progress,lessonId));}catch(e){setError(String(e));}}
 }
 const notice=kind==='demo'?'Corso dimostrativo sintetico · contenuti e fonti di esempio. Serve a provare lezioni, valutazione Civis e sbarramento; non deriva dai tuoi documenti.':kind==='published'?'Corso pubblicato sul server locale · contenuto revisionato.':kind==='draft'?'Bozza AI da revisionare · non pubblicata. Verifica testi, risposte e riferimenti alle fonti.':'Corso importato da JSON · contenuto fornito dall’utente, non generato durante questa sessione.';
 const valutazione=last&&exam?valutaTentativo(last,exam):null;
 return <View style={{gap:18,width:'100%',maxWidth:760,alignSelf:'center'}}>
  <View style={{gap:6}}>
   <Text style={s.eyebrow}>Corso</Text>
   <Text style={[s.slideHeading,{marginBottom:0}]}>{course.title}</Text>
   <Text style={[s.slideBody,{fontSize:TESTO.corpo,lineHeight:24,marginBottom:0}]}>{course.description}</Text>
  </View>
  <Avviso testo={notice} colore={kind==='draft'?C.scenario:kind==='demo'?C.indigoLight:C.teal}/>
  <View style={{gap:4}}>
   <ProgressBar current={progress.completedLessonIds.length} total={totalLessons} color={C.green}/>
   <Text style={{color:C.textDim,fontSize:TESTO.minuscolo}}>{progress.completedLessonIds.length}/{totalLessons} lezioni completate · progressi salvati su questo dispositivo</Text>
  </View>
  {!!error&&<Avviso testo={error} errore/>}
  <View style={{gap:8}}>
   <Text style={s.eyebrow}>Moduli</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{course.modules.map((m,i)=>{const available=canAccessModule(course,progress,m.id);return <Pillola key={m.id} label={`${i+1}. ${m.title}${available?'':' · bloccato'}`} attiva={m.id===active} disabled={!ready||!available||saving} onPress={()=>chooseModule(m.id)}/>;})}</View>
  </View>
  {unlocked&&module.lessons.map((lesson,li)=>{
   const done=progress.completedLessonIds.includes(lesson.id);
   if(openLesson===lesson.id){
    const index=Math.min(slideIndex,lesson.slides.length-1),slide=lesson.slides[index];
    return <Card key={lesson.id}>
     <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:6,gap:12}}>
      <Text style={[s.eyebrow,{flexShrink:1}]}>{lesson.title} · slide {index+1} / {lesson.slides.length}</Text>
      <Pressable onPress={()=>setOpenLesson(null)} accessibilityRole="button" accessibilityLabel="Chiudi la lezione" hitSlop={8}><Text style={{color:C.textDim,fontSize:TESTO.minuscolo,fontWeight:'700'}}>Chiudi</Text></Pressable>
     </View>
     <ProgressBar current={index+1} total={lesson.slides.length} color={C.indigo}/>
     <View style={{height:14}}/>
     <SlideStep key={slide.id} step={slidePerCivis(slide)} onNext={()=>nextSlide(lesson.id,lesson.slides.length)} moduleColor={C.indigo} onTesti={nessunaLettura}/>
     {index>0&&<Pressable onPress={()=>setSlideIndex(index-1)} accessibilityRole="button" accessibilityLabel="Slide precedente" hitSlop={8} style={{alignSelf:'center',marginTop:2}}><Text style={{color:C.textDim,fontSize:TESTO.piccolo,fontWeight:'700'}}>← Slide precedente</Text></Pressable>}
     <SourceNote key={`fonte-${slide.id}`} fonti={fontiDellaSlide(course,slide)} dimostrativa={kind==='demo'}/>
    </Card>;
   }
   return <Card key={lesson.id}>
    <Text style={s.eyebrow}>Lezione {li+1} · {lesson.slides.length} slide</Text>
    <Text style={{color:C.text,fontSize:TESTO.corpoGrande,fontWeight:'800',marginTop:4,marginBottom:4}}>{lesson.title}</Text>
    <Text style={{color:done?C.greenText:C.textDim,fontSize:TESTO.minuscolo,fontWeight:'700',marginBottom:12}}>{done?'Lezione completata':'Da completare'}</Text>
    <Btn label={done?'Rivedi la lezione':'Inizia la lezione'} primary={!done} color={C.indigo} disabled={!ready||saving} onPress={()=>openAt(lesson.id)}/>
   </Card>;
  })}
  {exam&&<Card>
   <Text style={s.eyebrow}>{exam.mode==='gate'?'Esame di sbarramento':'Test di controllo'}</Text>
   <Text style={{color:C.textDim,fontSize:TESTO.minuscolo,marginTop:4,marginBottom:14}}>Soglia: {exam.passingScore}/{exam.questionIds.length} risposte corrette · {exam.maxAttempts===null?'tentativi illimitati':`${attempts.length}/${exam.maxAttempts} tentativi usati`}</Text>
   {!lessonsDone&&<Avviso testo="Completa tutte le lezioni del modulo per sostenere il test."/>}
   {answering&&<>
    {exam.questionIds.map((id,qi)=>{const q=course.questions.find(q=>q.id===id)!;return <DomandaInCorso key={id} numero={qi+1} totale={exam.questionIds.length} domanda={presentazione(q)} opzioni={displayOptions(course,exam.id,attempts.length,id).map(o=>({id:o.id,text:o.text}))} scelte={answers[id]??[]} disabled={saving} onScegli={optionId=>setAnswers(current=>({...current,[id]:scegli(q,current[id]??[],optionId)}))}/>;})}
    <Btn label="Consegna il test" primary color={C.indigo} disabled={!ready||saving||!lessonsDone||gatePassed||!!exhausted||exam.questionIds.some(id=>!answers[id]?.length)} onPress={submit}/>
    {last&&<Pressable onPress={()=>{setRetrying(false);setAnswers({});}} accessibilityRole="button" accessibilityLabel="Torna al riepilogo" hitSlop={8} style={{alignSelf:'center'}}><Text style={{color:C.textDim,fontSize:TESTO.piccolo,fontWeight:'700'}}>Torna al riepilogo del tentativo precedente</Text></Pressable>}
   </>}
   {last&&valutazione&&!answering&&<>
    <Text style={{color:valutazione.superato?C.greenText:C.redText,fontSize:TESTO.occhiello,fontWeight:'800',letterSpacing:1.1,marginBottom:4}}>{valutazione.superato?'TEST SUPERATO':'TEST NON SUPERATO'} · TENTATIVO {attempts.length}</Text>
    <Text accessibilityRole="header" style={[s.slideHeading,{marginBottom:2}]}>{descriviValutazione(valutaTentativo(last,exam))}</Text>
    <Text style={{color:C.textDim,fontSize:TESTO.corpoPiccolo,marginBottom:16}}>{`${last.correct}/${last.total} risposte corrette${gatePassed?' · modulo successivo sbloccato':''}`}</Text>
    {riepilogoUltimoTentativo(course,exam,attempts).map((riga,qi)=><RiepilogoDomanda key={riga.questionId} numero={qi+1} riga={riga}/>)}
    {lessonsDone&&!gatePassed&&!exhausted&&<Btn label="Nuovo tentativo" primary color={C.indigo} disabled={!ready||saving} onPress={()=>{setAnswers({});setRetrying(true);}}/>}
   </>}
   {exhausted&&!gatePassed&&<View style={{marginTop:8}}><Avviso testo="Tentativi terminati. Il modulo successivo rimane bloccato. Nel corso dimostrativo puoi azzerare i progressi." errore/></View>}
  </Card>}
  <Btn label={kind==='demo'?'Azzera il corso dimostrativo':'Azzera i progressi locali'} disabled={saving||!ready} onPress={()=>{setSaving(true);resetProgress(course).then(p=>{setProgress(p);chooseModule(course.modules[0].id);setError('');}).catch(()=>setError('Impossibile azzerare i progressi.')).finally(()=>setSaving(false));}}/>
 </View>;
}
