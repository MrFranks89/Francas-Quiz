/**
 * Test nostro: verifica che i file copiati da Civis siano identici byte per
 * byte a quelli registrati in provenance.json, senza bisogno del repository
 * di Civis. Controlla anche che ogni file sotto src/ e __tests__/ sia
 * dichiarato: copia, sostituto o nostro. Un file non dichiarato fa fallire
 * il test, così una copia modificata o un'aggiunta silenziosa non passano.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

type Voce =
  | { path: string; tipo: 'copia'; origine: string; sha256: string }
  | { path: string; tipo: 'sostituto'; sostituisce: string; motivo: string }
  | { path: string; tipo: 'nostro'; motivo: string };

const root = resolve(__dirname, '..', '..');
const provenance: { sourceCommit: string; files: Voce[] } = JSON.parse(
  readFileSync(resolve(root, 'provenance.json'), 'utf8').replace(/^\uFEFF/, ''),
);

function elenca(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(nome => {
    const pieno = join(dir, nome);
    return statSync(pieno).isDirectory() ? elenca(pieno) : [relative(root, pieno).split(sep).join('/')];
  });
}

describe('provenienza dei file di civis-ui', () => {
  it('registra il commit di Civis da cui provengono le copie', () => {
    expect(provenance.sourceCommit).toBe('db9ff48');
  });

  it('ogni copia ha lo stesso SHA256 registrato', () => {
    const diverse = provenance.files
      .filter((v): v is Extract<Voce, { tipo: 'copia' }> => v.tipo === 'copia')
      .filter(v => createHash('sha256').update(readFileSync(resolve(root, v.path))).digest('hex') !== v.sha256)
      .map(v => v.path);
    expect(diverse).toEqual([]);
  });

  it('ogni copia viene dallo stesso percorso in Civis', () => {
    const spostate = provenance.files.filter(v => v.tipo === 'copia' && v.origine !== `CivicaApp/${v.path}`);
    expect(spostate).toEqual([]);
  });

  it('ogni sostituto e ogni file nostro dichiara il motivo', () => {
    const senzaMotivo = provenance.files.filter(v => v.tipo !== 'copia' && !v.motivo).map(v => v.path);
    expect(senzaMotivo).toEqual([]);
  });

  it('ogni file sotto src/ e __tests__/ è dichiarato, e ogni dichiarato esiste', () => {
    const presenti = [...elenca(resolve(root, 'src')), ...elenca(resolve(root, '__tests__'))].sort();
    const dichiarati = provenance.files.map(v => v.path).sort();
    expect(presenti).toEqual(dichiarati);
  });
});
