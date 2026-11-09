/**
 * Controllo automatico contro il codice compresso: EditorScreen.tsx era 26
 * righe da 226 caratteri in media, e niente se ne accorgeva. Un file che
 * supera le soglie fa fallire `npm test`.
 *
 * File controllati: i sorgenti nostri in apps/, packages/ (escluse le copie
 * di Civis, lette dai provenance.json: sono protette da impronta e non si
 * riformattano) e services/api/formazione_api (Python).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const radice = resolve(__dirname, '..', '..');

/**
 * Lunghezza media per riga, in caratteri. Dopo la riformattazione il file
 * nostro più largo è services/api/formazione_api/generation/instructions.py
 * con 84 (testi di istruzioni); i file compressi stavano fra 116 e 275.
 * 100 lascia un margine sopra il codice normale e resta sotto il compresso.
 */
const MEDIA_MASSIMA = 100;

/**
 * Righe per file. Dopo la riformattazione il file più lungo sotto la soglia
 * è spesa_generazione.py con 303 righe: 400 lascia margine. Oltre, il file
 * fa troppe cose e va diviso (regola dello stato che esce dal componente).
 */
const RIGHE_MASSIME = 400;

/**
 * Eccezioni dichiarate: file che oggi superano una soglia, con il valore
 * misurato come tetto. Non possono peggiorare, e un'eccezione che non serve
 * più fa fallire il test, così la lista si accorcia invece di restare.
 */
const ECCEZIONI_MEDIA: Record<string, number> = {};
const ECCEZIONI_RIGHE: Record<string, number> = {
  // Lettore del corso e vista d'esame: tutti i tipi di domanda in un file.
  // Da dividere come l'editor (stato in state/, un componente per parte).
  'apps/learner/src/components/ExamView.tsx': 478,
  'apps/learner/src/screens/CourseScreen.tsx': 442,
};

const ESTENSIONI = /\.(tsx?|jsx?|py)$/;
const CARTELLE_SALTATE = new Set(['node_modules', 'dist', '__pycache__', '.expo', 'web-build']);

function elenca(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((nome) => {
    const pieno = join(dir, nome);
    if (statSync(pieno).isDirectory()) return CARTELLE_SALTATE.has(nome) ? [] : elenca(pieno);
    return ESTENSIONI.test(nome) ? [relative(radice, pieno).split(sep).join('/')] : [];
  });
}

/** Le copie di Civis: nel provenance.json di civis-engine non c'è `tipo`, sono tutte copie. */
function copieDiCivis(): Set<string> {
  const copie = new Set<string>();
  for (const pacchetto of ['civis-ui', 'civis-engine']) {
    const testo = readFileSync(resolve(radice, 'packages', pacchetto, 'provenance.json'), 'utf8');
    const { files } = JSON.parse(testo.replace(/^﻿/, '')) as {
      files: { path: string; tipo?: string }[];
    };
    for (const f of files)
      if ((f.tipo ?? 'copia') === 'copia') copie.add(`packages/${pacchetto}/${f.path}`);
  }
  return copie;
}

function misura(file: string) {
  const righe = readFileSync(resolve(radice, file), 'utf8').replace(/\r\n/g, '\n').split('\n');
  if (righe[righe.length - 1] === '') righe.pop();
  const caratteri = righe.reduce((somma, riga) => somma + riga.length, 0);
  return { righe: righe.length, media: Math.round(caratteri / Math.max(righe.length, 1)) };
}

const copie = copieDiCivis();
const file = ['apps', 'packages', 'services/api/formazione_api']
  .flatMap((d) => elenca(resolve(radice, d)))
  .filter((f) => !copie.has(f));
const misure = Object.fromEntries(file.map((f) => [f, misura(f)]));

it('trova i file da controllare, Python compreso, e salta le copie di Civis', () => {
  expect(file.length).toBeGreaterThan(100);
  expect(file).toContain('apps/learner/src/screens/EditorScreen.tsx');
  expect(file).toContain('services/api/formazione_api/routes.py');
  expect(file).not.toContain('packages/civis-ui/src/comune/stili.ts');
  expect(file).not.toContain('packages/civis-engine/src/ripasso.ts');
  expect(copie.size).toBeGreaterThan(30);
});

it(`nessun file nostro supera ${MEDIA_MASSIMA} caratteri per riga in media`, () => {
  const oltre = file
    .filter((f) => misure[f].media > (ECCEZIONI_MEDIA[f] ?? MEDIA_MASSIMA))
    .map((f) => `${f}: ${misure[f].media} caratteri per riga`);
  expect(oltre).toEqual([]);
});

it(`nessun file nostro supera ${RIGHE_MASSIME} righe`, () => {
  const oltre = file
    .filter((f) => misure[f].righe > (ECCEZIONI_RIGHE[f] ?? RIGHE_MASSIME))
    .map((f) => `${f}: ${misure[f].righe} righe`);
  expect(oltre).toEqual([]);
});

it('ogni eccezione serve ancora: un file rientrato nelle soglie esce dalla lista', () => {
  const inutili = [
    ...Object.keys(ECCEZIONI_MEDIA).filter((f) => !misure[f] || misure[f].media <= MEDIA_MASSIMA),
    ...Object.keys(ECCEZIONI_RIGHE).filter((f) => !misure[f] || misure[f].righe <= RIGHE_MASSIME),
  ];
  expect(inutili).toEqual([]);
});
