import { describe, expect, it } from 'vitest';
import { parsePageSelection, selectedPages, mergeIntervals, PageSelectionSchema } from './pages';

describe('pages ranges contract', () => {
  it('fonde intervalli sovrapposti e adiacenti in ordine crescente', () => {
    const raw = [
      { fromPage: 10, toPage: 15 },
      { fromPage: 1, toPage: 5 },
      { fromPage: 4, toPage: 8 },
      { fromPage: 16, toPage: 20 },
    ];
    const merged = mergeIntervals(raw);
    expect(merged).toEqual([
      { fromPage: 1, toPage: 8 },
      { fromPage: 10, toPage: 20 },
    ]);
  });

  it('calcola le pagine selezionate per intervalli disgiunti', () => {
    const sel = parsePageSelection(
      {
        mode: 'ranges',
        intervals: [
          { fromPage: '2', toPage: '3' },
          { fromPage: '7', toPage: '8' },
        ],
      },
      20,
    );
    expect(sel.mode).toBe('ranges');
    if (sel.mode === 'ranges') {
      expect(sel.intervals).toEqual([
        { fromPage: 2, toPage: 3 },
        { fromPage: 7, toPage: 8 },
      ]);
    }
    const pages = selectedPages(sel, 20);
    expect(pages).toEqual([2, 3, 7, 8]);
  });

  it('gestisce duplicati e fusione completa', () => {
    const sel = parsePageSelection(
      {
        mode: 'ranges',
        intervals: [
          { fromPage: 5, toPage: 10 },
          { fromPage: 5, toPage: 10 },
          { fromPage: 7, toPage: 12 },
        ],
      },
      30,
    );
    expect(selectedPages(sel, 30)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('rifiuta lista intervalli vuota o superiore a 50', () => {
    expect(() => parsePageSelection({ mode: 'ranges', intervals: [] }, 10)).toThrow();
    const troppi = Array.from({ length: 51 }, (_, i) => ({ fromPage: i + 1, toPage: i + 1 }));
    expect(() => parsePageSelection({ mode: 'ranges', intervals: troppi }, 100)).toThrow();
  });

  it('rifiuta intervalli fuori dai limiti del documento', () => {
    expect(() =>
      parsePageSelection({ mode: 'ranges', intervals: [{ fromPage: 5, toPage: 25 }] }, 20),
    ).toThrow();
    expect(() =>
      parsePageSelection({ mode: 'ranges', intervals: [{ fromPage: 10, toPage: 5 }] }, 20),
    ).toThrow();
    expect(() =>
      parsePageSelection({ mode: 'ranges', intervals: [{ fromPage: 0, toPage: 5 }] }, 20),
    ).toThrow();
  });

  it('mantiene invariato il comportamento per mode all e range', () => {
    const all = parsePageSelection({ mode: 'all' }, 5);
    expect(selectedPages(all, 5)).toEqual([1, 2, 3, 4, 5]);

    const range = parsePageSelection({ mode: 'range', fromPage: '2', toPage: '4' }, 5);
    expect(selectedPages(range, 5)).toEqual([2, 3, 4]);
  });
});
