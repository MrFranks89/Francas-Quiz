import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {preparaTemaDiSistema,type Archivio} from './tema';

function archivio(iniziale:Record<string,string>={}):Archivio&{dati:Record<string,string>}{
 const dati={...iniziale};
 return {dati,getItem:async k=>dati[k]??null,setItem:async(k,v)=>{dati[k]=v;}};
}

describe('preparaTemaDiSistema', () => {
 it('alla prima apertura salva «system»: il tema segue il sistema', async () => {
  const a=archivio();
  expect(await preparaTemaDiSistema(a,'chiave')).toBe('salvato');
  expect(a.dati).toEqual({chiave:'system'});
 });

 it('una scelta già fatta con l\'interruttore non si tocca', async () => {
  for(const scelta of ['light','dark','system']){
   const a=archivio({chiave:scelta});
   expect(await preparaTemaDiSistema(a,'chiave')).toBe('già scelto');
   expect(a.dati.chiave).toBe(scelta);
  }
 });

 it('un valore non valido viene sostituito da «system»', async () => {
  const a=archivio({chiave:'blu'});
  await preparaTemaDiSistema(a,'chiave');
  expect(a.dati.chiave).toBe('system');
 });
});

// Il valore salvato serve solo se il provider copiato lo legge: si controlla
// alla fonte che accetti 'system' dalla stessa chiave usata dall'app.
it('il ThemeProvider copiato legge «system» dalla chiave salvata', () => {
 const provider=readFileSync(new URL('../../../../packages/civis-ui/src/ThemeProvider.tsx',import.meta.url),'utf8');
 expect(provider).toMatch(/AsyncStorage\.getItem\(THEME_STORAGE_KEY\)/);
 expect(provider).toMatch(/value === 'system'\)\) setPreference\(value\)/);
 const app=readFileSync(new URL('../components/TemaIniziale.tsx',import.meta.url),'utf8');
 expect(app).toMatch(/preparaTemaDiSistema\(\s*AsyncStorage,\s*THEME_STORAGE_KEY,?\s*\)/);
});
