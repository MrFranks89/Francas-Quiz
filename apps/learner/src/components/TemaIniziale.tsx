import React,{useEffect,useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ThemeProvider,THEME_STORAGE_KEY} from '@formazione/civis-ui/src/ThemeProvider';
import {preparaTemaDiSistema} from '../state/tema';

/**
 * Monta il ThemeProvider di Civis (copia identica) solo dopo aver salvato
 * 'system' come preferenza iniziale, se l'utente non ne ha ancora scelta una:
 * così il tema parte dal sistema invece che dallo scuro predefinito della
 * copia (vedi state/tema.ts). Finché lo storage non risponde non si disegna
 * nulla, per non mostrare un lampo del tema sbagliato.
 */
export function TemaIniziale({children}:{children:React.ReactNode}){
 const [pronto,setPronto]=useState(false);
 useEffect(()=>{
  let vivo=true;
  preparaTemaDiSistema(AsyncStorage,THEME_STORAGE_KEY)
   .catch(error=>console.warn('Preferenza iniziale del tema non salvata',error))
   .finally(()=>{if(vivo)setPronto(true);});
  return()=>{vivo=false;};
 },[]);
 return pronto?<ThemeProvider>{children}</ThemeProvider>:null;
}
