import { describe, expect, it } from 'vitest';
import {
  ConceptNodeSchema,
  ConceptBranchSchema,
  ConceptTreeSchema,
  conceptTreeJsonSchema,
} from './concept';

describe('ConceptTreeSchema', () => {
  const validTree = {
    schemaVersion: 1,
    id: 'tree-1',
    documentId: 'doc-123',
    rootTitle: 'Analisi Matematica 1',
    summary: 'Panoramica sui concetti di base delle funzioni',
    branches: [
      {
        id: 'branch-1',
        title: 'Funzioni e Insiemi',
        description: 'Definizione di dominio, codominio e proprietà',
        nodes: [
          {
            id: 'node-1',
            title: 'Funzione iniettiva',
            summary: 'Elementi distinti del dominio hanno immagini distinte nel codominio.',
            sourceRefs: ['b-1:10-50'],
            keyTerms: ['iniettività', 'dominio'],
          },
          {
            id: 'node-2',
            title: 'Funzione suriettiva',
            summary: 'Ogni elemento del codominio è immagine di almeno un elemento del dominio.',
            sourceRefs: ['b-1:55-100'],
          },
        ],
      },
    ],
  };

  it('valida correttamente un ConceptTree completo', () => {
    const parsed = ConceptTreeSchema.parse(validTree);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.rootTitle).toBe('Analisi Matematica 1');
    expect(parsed.branches).toHaveLength(1);
    expect(parsed.branches[0].nodes).toHaveLength(2);
  });

  it('valida un ConceptTree con campi opzionali omessi', () => {
    const minimalTree = {
      schemaVersion: 1,
      id: 'tree-min',
      rootTitle: 'Algebra Lineare',
      branches: [
        {
          id: 'branch-min',
          title: 'Spazi Vettoriali',
          nodes: [
            {
              id: 'node-min',
              title: 'Vettore',
              summary: 'Elemento di uno spazio vettoriale.',
              sourceRefs: ['ref-1'],
            },
          ],
        },
      ],
    };
    const parsed = ConceptTreeSchema.parse(minimalTree);
    expect(parsed.documentId).toBeUndefined();
    expect(parsed.summary).toBeUndefined();
    expect(parsed.branches[0].description).toBeUndefined();
    expect(parsed.branches[0].nodes[0].keyTerms).toBeUndefined();
  });

  it('rifiuta un schemaVersion errato', () => {
    expect(() =>
      ConceptTreeSchema.parse({
        ...validTree,
        schemaVersion: 2,
      }),
    ).toThrow();
  });

  it('rifiuta rami vuoti', () => {
    expect(() =>
      ConceptTreeSchema.parse({
        ...validTree,
        branches: [],
      }),
    ).toThrow();
  });

  it('rifiuta nodi vuoti in un ramo', () => {
    expect(() =>
      ConceptBranchSchema.parse({
        id: 'branch-empty',
        title: 'Ramo vuoto',
        nodes: [],
      }),
    ).toThrow();
  });

  it('rifiuta sourceRefs vuoti in un nodo', () => {
    expect(() =>
      ConceptNodeSchema.parse({
        id: 'node-no-ref',
        title: 'Titolo',
        summary: 'Sintesi',
        sourceRefs: [],
      }),
    ).toThrow();
  });

  it('rifiuta stringhe vuote o con soli spazi', () => {
    expect(() =>
      ConceptNodeSchema.parse({
        id: '   ',
        title: 'Titolo',
        summary: 'Sintesi',
        sourceRefs: ['ref-1'],
      }),
    ).toThrow();

    expect(() =>
      ConceptTreeSchema.parse({
        ...validTree,
        rootTitle: '   ',
      }),
    ).toThrow();
  });

  it('esporta il JSON schema corretto', () => {
    expect(conceptTreeJsonSchema).toBeDefined();
    expect(typeof conceptTreeJsonSchema).toBe('object');
  });
});
