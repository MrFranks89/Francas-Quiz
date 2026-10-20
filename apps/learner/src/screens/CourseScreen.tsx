import React,{useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {canAccessModule,completeLesson,submitExam,createProgress,displayOptions,type Progress} from '@formazione/learning-engine';
import {course,loadProgress,saveProgress,resetProgress} from '../state/course';
import {Button,Card,Notice,styles} from '../components/ui';
import type {Course} from '@formazione/contracts';

export function CourseScreen({currentCourse=course,kind='demo'}:{currentCourse?:Course;kind?:'demo'|'draft'|'published'|'imported'}){
 const course=currentCourse;
 const [progress,setProgress]=useState<Progress>(createProgress(course)),[ready,setReady]=useState(false),[error,setError]=useState('');
 const [active,setActive]=useState(course.modules[0].id),[answers,setAnswers]=useState<Record<string,string>>({}),[saving,setSaving]=useState(false);
 useEffect(()=>{let live=true;loadProgress(course).then(p=>{if(live)setProgress(p);}).catch(e=>{if(live)setError(String(e.message));}).finally(()=>{if(live)setReady(true);});return()=>{live=false;};},[course]);
 async function update(next:Progress){setSaving(true);setError('');try{await saveProgress(next);setProgress(next);}catch{setError('Salvataggio non riuscito. Riprova prima di proseguire.');}finally{setSaving(false);}}
 const module=course.modules.find(m=>m.id===active)!;
 const unlocked=canAccessModule(course,progress,module.id),exam=module.exam;
 const attempts=progress.attempts.filter(a=>a.examId===exam?.id),last=attempts.at(-1);
 const gatePassed=exam?.mode==='gate'&&attempts.some(a=>a.passed);
 const exhausted=exam?.maxAttempts!==null&&exam!==null&&attempts.length>=exam.maxAttempts;
 const lessonsDone=module.lessons.every(l=>progress.completedLessonIds.includes(l.id));
 async function submit(){if(!exam)return;try{await update(submitExam(course,progress,exam.id,`attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`,exam.questionIds.filter(id=>answers[id]).map(questionId=>({questionId,optionId:answers[questionId]}))));setAnswers({});}catch(e){setError(e instanceof Error?e.message:'Valutazione non riuscita.');}}
 return <View style={{gap:20}}><Text style={styles.title}>{course.title}</Text><Notice text={kind==='demo'?'Corso dimostrativo sintetico · contenuti e fonti di esempio. Serve a provare lezioni, valutazione Civis e sbarramento; non deriva dai tuoi documenti.':kind==='published'?'Corso pubblicato sul server locale · contenuto revisionato.':kind==='draft'?'Bozza AI da revisionare · non pubblicata. Verifica testi, risposte e riferimenti alle fonti.':'Corso importato da JSON · contenuto fornito dall’utente, non generato durante questa sessione.'}/>
  <Text style={styles.body}>{course.description}</Text><Text style={styles.muted}>{progress.completedLessonIds.length}/{course.modules.flatMap(m=>m.lessons).length} lezioni completate · progressi salvati su questo dispositivo</Text>
  {!!error&&<Notice text={error} error/>}
  <View style={styles.row}>{course.modules.map((m,i)=>{const available=canAccessModule(course,progress,m.id);return <Button key={m.id} label={`${i+1}. ${m.title}${available?'':' · bloccato'}`} secondary={m.id!==active} disabled={!ready||!available||saving} onPress={()=>{setActive(m.id);setAnswers({});}}/>;})}</View>
  {unlocked&&module.lessons.map(lesson=><Card key={lesson.id}><Text style={styles.subtitle}>{lesson.title}</Text>{lesson.slides.map((slide,index)=><View key={slide.id} style={{gap:14}}><Text style={styles.muted}>SLIDE {index+1} / {lesson.slides.length}</Text><Text style={styles.title}>{slide.heading}</Text><Text style={[styles.body,{fontSize:20,lineHeight:32}]}>{slide.body}</Text><Notice text={slide.highlight}/>{slide.sourceRefs.map(id=>{const source=course.sources.find(s=>s.id===id)!;return <View key={id}><Text style={styles.muted}>{kind==='demo'?'Fonte dimostrativa':'Fonte'} · {source.label}</Text><Text style={styles.muted}>“{source.excerpt}”</Text></View>;})}</View>)}<Button label={progress.completedLessonIds.includes(lesson.id)?'Lezione completata ✓':'Ho terminato la lezione'} disabled={!ready||saving||progress.completedLessonIds.includes(lesson.id)} onPress={()=>{try{void update(completeLesson(course,progress,lesson.id));}catch(e){setError(String(e));}}}/></Card>)}
  {exam&&<Card><Text style={styles.subtitle}>{exam.mode==='gate'?'Esame di sbarramento':'Test di controllo'}</Text><Text style={styles.muted}>Soglia: {exam.passingScore}/{exam.questionIds.length} risposte corrette · {exam.maxAttempts===null?'tentativi illimitati':`${attempts.length}/${exam.maxAttempts} tentativi usati`}</Text>
  {!lessonsDone&&<Notice text="Completa tutte le lezioni del modulo per sostenere il test."/>}
  {lessonsDone&&!gatePassed&&!exhausted&&exam.questionIds.map(id=>{const q=course.questions.find(q=>q.id===id)!;return <View key={id} style={{gap:12}}><Text style={styles.subtitle}>{q.prompt}</Text>{displayOptions(course,exam.id,attempts.length,id).map(option=><Button key={option.id} label={`${answers[id]===option.id?'● ':'○ '}${option.text}`} secondary={answers[id]!==option.id} disabled={saving} onPress={()=>setAnswers(current=>({...current,[id]:option.id}))}/>)}</View>;})}
  {last&&<Notice text={`${last.passed?'Superato':'Non superato'} · ${last.correct}/${last.total} risposte corrette${gatePassed?' · modulo successivo sbloccato':''}`}/>}
  {last&&exam.questionIds.map(id=>{const q=course.questions.find(q=>q.id===id)!;return <Text key={id} style={styles.muted}>{q.explanation}</Text>;})}
  {exhausted&&!gatePassed&&<Notice text="Tentativi terminati. Il modulo successivo rimane bloccato. Nel corso dimostrativo puoi azzerare i progressi." error/>}
  <Button label="Consegna il test" disabled={!ready||saving||!lessonsDone||gatePassed||!!exhausted||exam.questionIds.some(id=>!answers[id])} onPress={submit}/>
  </Card>}
  <Button label={kind==='demo'?'Azzera il corso dimostrativo':'Azzera i progressi locali'} secondary disabled={saving||!ready} onPress={()=>{setSaving(true);resetProgress(course).then(p=>{setProgress(p);setActive(course.modules[0].id);setAnswers({});setError('');}).catch(()=>setError('Impossibile azzerare i progressi.')).finally(()=>setSaving(false));}}/>
 </View>;
}

