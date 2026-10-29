// Formati ammessi come fonte. Decisione del 29 ottobre 2026 (docs/decisions/004-niente-fogli-di-calcolo.md):
// niente fogli di calcolo (XLSX, CSV). Il server rifiuta comunque un foglio, anche rinominato:
// il selettore serve solo a non proporlo.
export const FORMATI_AMMESSI = 'PDF, Word (DOCX), TXT e Markdown';

// Tipi MIME registrati: application/pdf (RFC 8118), DOCX (ECMA-376, registro IANA),
// text/plain (RFC 2046), text/markdown (RFC 7763); text/x-markdown è il nome usato prima della RFC.
const MIME = [
 'application/pdf',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'text/plain',
 'text/markdown',
 'text/x-markdown',
];
// Sul web il selettore diventa l'attributo accept di <input type="file"> (expo-document-picker 57,
// ExpoDocumentPicker.web.js), che ammette anche le estensioni: senza, i .md non associati a un tipo
// MIME dal sistema non sarebbero selezionabili. Su Android e iOS valgono solo i tipi MIME.
const ESTENSIONI = ['.pdf', '.docx', '.txt', '.md'];

export function tipiSelettore(web: boolean): string[] {
 return web ? [...MIME, ...ESTENSIONI] : MIME;
}
