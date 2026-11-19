// Formati ammessi come fonte. Decisione del 29 ottobre 2026 (docs/decisions/004-niente-fogli-di-calcolo.md):
// niente fogli di calcolo (XLSX, CSV). Esteso il 18 novembre 2026 alle immagini (JPG, PNG) per OCR
// e all'audio (MP3, M4A, WAV, OGG, WEBM, MP4, FLAC) per trascrizione con riconoscimento vocale.
// Il server rifiuta comunque un foglio, anche rinominato: il selettore serve solo a non proporlo.
export const FORMATI_AMMESSI =
  'PDF, Word (DOCX), TXT, Markdown, immagini (JPG, PNG) e audio (MP3, M4A, WAV, OGG, WEBM, MP4, FLAC)';

// Tipi MIME registrati: application/pdf (RFC 8118), DOCX (ECMA-376, registro IANA),
// text/plain (RFC 2046), text/markdown (RFC 7763); text/x-markdown è il nome usato prima della RFC;
// image/jpeg (RFC 2046), image/png (RFC 2083); audio e video per trascrizione vocale.
const MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'image/jpeg',
  'image/png',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'video/mp4',
];
// Sul web il selettore diventa l'attributo accept di <input type="file"> (expo-document-picker 57,
// ExpoDocumentPicker.web.js), che ammette anche le estensioni: senza, i .md non associati a un tipo
// MIME dal sistema non sarebbero selezionabili. Su Android e iOS valgono solo i tipi MIME.
const ESTENSIONI = [
  '.pdf',
  '.docx',
  '.txt',
  '.md',
  '.jpg',
  '.jpeg',
  '.png',
  '.mp3',
  '.m4a',
  '.wav',
  '.ogg',
  '.webm',
  '.mp4',
  '.flac',
];

export function tipiSelettore(web: boolean): string[] {
  return web ? [...MIME, ...ESTENSIONI] : MIME;
}
