import { z } from 'zod';

export const PageSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all') }),
  z.object({ mode: z.literal('range'), fromPage: z.number().int().min(1), toPage: z.number().int().min(1) }),
]);
export type PageSelection = z.infer<typeof PageSelectionSchema>;
export type PageSelectionInput = { mode: 'all' } | { mode: 'range'; fromPage: string; toPage: string };
export function selectedPages(selection: PageSelection, totalPages: number): number[] {
  if (!Number.isSafeInteger(totalPages) || totalPages < 1) throw new Error('Invalid page count');
  const parsed = PageSelectionSchema.parse(selection);
  const from = parsed.mode === 'all' ? 1 : parsed.fromPage;
  const to = parsed.mode === 'all' ? totalPages : parsed.toPage;
  if (from > to || to > totalPages) throw new Error('Page range outside document');
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}
export function parsePageSelection(input: PageSelectionInput, totalPages: number): PageSelection {
  const integer = (value: string) => {
    if (!/^[1-9]\d*$/.test(value)) throw new Error('Page must be a positive integer');
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error('Page exceeds safe integer');
    return number;
  };
  const selection: PageSelection = input.mode === 'all' ? { mode: 'all' }
    : { mode: 'range', fromPage: integer(input.fromPage), toPage: integer(input.toPage) };
  selectedPages(selection, totalPages);
  return selection;
}
