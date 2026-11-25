import { z } from 'zod';

export const PageIntervalSchema = z.object({
  fromPage: z.number().int().min(1),
  toPage: z.number().int().min(1),
});

export type PageInterval = z.infer<typeof PageIntervalSchema>;

export const PageSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all') }),
  z.object({
    mode: z.literal('range'),
    fromPage: z.number().int().min(1),
    toPage: z.number().int().min(1),
  }),
  z.object({
    mode: z.literal('ranges'),
    intervals: z.array(PageIntervalSchema).min(1).max(50),
  }),
]);

export type PageSelection = z.infer<typeof PageSelectionSchema>;

export type PageIntervalInput = { fromPage: string | number; toPage: string | number };

export type PageSelectionInput =
  | { mode: 'all' }
  | { mode: 'range'; fromPage: string | number; toPage: string | number }
  | { mode: 'ranges'; intervals: PageIntervalInput[] };

export function mergeIntervals(intervals: PageInterval[]): PageInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.fromPage - b.fromPage || a.toPage - b.toPage);
  const merged: PageInterval[] = [{ fromPage: sorted[0].fromPage, toPage: sorted[0].toPage }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.fromPage <= prev.toPage + 1) {
      prev.toPage = Math.max(prev.toPage, curr.toPage);
    } else {
      merged.push({ fromPage: curr.fromPage, toPage: curr.toPage });
    }
  }
  return merged;
}

export function selectedPages(selection: PageSelection, totalPages: number): number[] {
  if (!Number.isSafeInteger(totalPages) || totalPages < 1) throw new Error('Invalid page count');
  const parsed = PageSelectionSchema.parse(selection);
  if (parsed.mode === 'all') {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (parsed.mode === 'range') {
    const from = parsed.fromPage;
    const to = parsed.toPage;
    if (from > to || to > totalPages) throw new Error('Page range outside document');
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
  }
  if (parsed.mode === 'ranges') {
    if (parsed.intervals.length === 0 || parsed.intervals.length > 50) {
      throw new Error('Intervalli non validi: richiesto tra 1 e 50 intervalli');
    }
    for (const it of parsed.intervals) {
      if (it.fromPage > it.toPage || it.toPage > totalPages || it.fromPage < 1) {
        throw new Error('Page range outside document');
      }
    }
    const merged = mergeIntervals(parsed.intervals);
    const pages: number[] = [];
    for (const it of merged) {
      for (let p = it.fromPage; p <= it.toPage; p++) {
        pages.push(p);
      }
    }
    return pages;
  }
  throw new Error('Modalità selezione non supportata');
}

export function parsePageSelection(input: PageSelectionInput, totalPages: number): PageSelection {
  const integer = (value: string | number) => {
    const str = String(value);
    if (!/^[1-9]\d*$/.test(str)) throw new Error('Page must be a positive integer');
    const number = Number(str);
    if (!Number.isSafeInteger(number)) throw new Error('Page exceeds safe integer');
    return number;
  };

  let selection: PageSelection;
  if (input.mode === 'all') {
    selection = { mode: 'all' };
  } else if (input.mode === 'range') {
    selection = { mode: 'range', fromPage: integer(input.fromPage), toPage: integer(input.toPage) };
  } else if (input.mode === 'ranges') {
    if (!input.intervals || input.intervals.length === 0) {
      throw new Error('Lista intervalli vuota');
    }
    if (input.intervals.length > 50) {
      throw new Error('Massimo 50 intervalli ammessi');
    }
    const raw = input.intervals.map((it) => ({
      fromPage: integer(it.fromPage),
      toPage: integer(it.toPage),
    }));
    for (const it of raw) {
      if (it.fromPage > it.toPage || it.toPage > totalPages || it.fromPage < 1) {
        throw new Error('Page range outside document');
      }
    }
    selection = { mode: 'ranges', intervals: mergeIntervals(raw) };
  } else {
    throw new Error('Modalità non valida');
  }

  selectedPages(selection, totalPages);
  return selection;
}
