import { usePalette } from '../ThemeProvider';
/**
 * Foglio di stile condiviso da (quasi) tutte le schermate di CivicApp.tsx.
 * Estratto qui perché è la prima dipendenza comune ai componenti spostati
 * in src/comune/: `s` viveva come StyleSheet.create in fondo a CivicApp.tsx,
 * ma i componenti di presentazione (Btn, Card, ProgressBar…) lo usavano da
 * molto più in alto nel file — spostandoli senza spostare anche gli stili
 * si sarebbe rotto il legame. Nessun cambiamento di contenuto: stessa
 * StyleSheet, stesso ordine, stessi valori.
 */
import { StyleSheet, Platform, Dimensions } from 'react-native';
import { C, TESTO } from '../tema';

const { width: SW } = Dimensions.get('window');

export const createStyles = (C: typeof import('../tema').C) => StyleSheet.create({
  tabBar:   { flexDirection: 'row', backgroundColor: C.surfaceDark, borderTopWidth: 1, borderTopColor: C.surfaceHover, paddingTop: 8, paddingBottom: 10 },
  tabItem:  { flex: 1, minHeight: 56, paddingVertical: 6, marginHorizontal: 3, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 5 },
  tabLabel: { fontSize: TESTO.occhiello, fontWeight: '700' },
  badgeCircle:      { width: 54, height: 54, borderRadius: 27, backgroundColor: C.surfaceDark, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.slate },
  badgeCircleLg:    { width: 84, height: 84, borderRadius: 42, backgroundColor: C.surfaceDark, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.slate },
  badgeReserved:    { backgroundColor: 'transparent', borderStyle: 'dashed', borderWidth: 2, borderColor: C.slate },
  badgeInfoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  badgeInfoCard:    { width: '100%', maxWidth: 360, backgroundColor: C.surfaceDark, borderWidth: 1.5, borderColor: C.border, borderRadius: 20, padding: 24 },
  packPopupOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  packPopupCard:    { width: '100%', maxWidth: 360, backgroundColor: C.surfaceDark, borderWidth: 1.5, borderRadius: 22, padding: 26, alignItems: 'center' },
  badgeTypePill:    { alignSelf: 'center', marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: C.border },
  badgeInfoMeta:    { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  // Testo
  textXs:           { fontSize: TESTO.minuscolo, color: C.textDim, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  textSm:           { fontSize: TESTO.corpoPiccolo, color: C.textMuted },
  label:            { fontSize: TESTO.minuscolo, color: C.textDim, letterSpacing: 0.4, textTransform: 'uppercase',  marginBottom: 8 },
  slideHeading:     { fontSize: 25, fontWeight: '800', color: C.text, letterSpacing: -0.4, marginBottom: 12, lineHeight: 32 },
  eyebrow:          { fontSize: TESTO.occhiello, letterSpacing: 1.4, color: C.textVeryDim, textTransform: 'uppercase', fontWeight: '700' },
  // Il body è il testo DA LEGGERE: grande e chiaro (il vecchio 14px grigio non si leggeva).
  slideBody:        { fontSize: 18, color: C.lightText, lineHeight: 28, marginBottom: 18 },
  questionText:     { fontSize: TESTO.titoloPiccolo, fontWeight: '800', color: C.text, lineHeight: 25, marginBottom: 18 },
  stepEmoji:        { fontSize: 44, textAlign: 'center', marginBottom: 16 },
  appTitle:         { fontSize: TESTO.titoloMedio, fontWeight: '800', color: C.text },
  appSubtitle:      { fontSize: TESTO.minuscolo, color: C.textDim, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  modulePageTitle:  { fontSize: 21, fontWeight: '800', color: C.text },
  modulePageSub:    { fontSize: TESTO.piccolo, color: C.textDim },
  sectionLabel:     { fontSize: TESTO.minuscolo, color: C.textDim, letterSpacing: 0.4, textTransform: 'uppercase',  marginBottom: 10 },
  moduleTitle:      { fontSize: TESTO.corpoGrande, fontWeight: '700', color: C.text },
  moduleSubtitle:   { fontSize: TESTO.piccolo, color: C.textDim },
  lessonTitle:      { fontSize: TESTO.corpo, fontWeight: '700', color: C.text },
  streakNumber:     { fontSize: 42, fontWeight: '800', textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  streakStatNum:    { fontSize: TESTO.titoloGrande, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  // Layout
  progressWrap:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  progressTrack:    { flex: 1, height: 9, backgroundColor: C.surfaceHover, borderRadius: 99, overflow: 'hidden' },
  progressFill:     { height: '100%', borderRadius: 99 },
  progressPct:      { fontSize: TESTO.minuscolo, color: C.textDim,  minWidth: 28 },
  topBar:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, paddingBottom: 6 },
  moduleHeader:     { borderBottomWidth: 1.5, padding: 20, paddingBottom: 22 },
  // Cards
  card:             { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderRadius: 16, padding: 18 },
  // Riassunto discreto in coda alla slide: non deve rubare lo sguardo al body.
  highlight:        { borderLeftWidth: 3, borderRadius: 0, borderTopRightRadius: 10, borderBottomRightRadius: 10, padding: 12, marginBottom: 24 },
  highlightText:    { fontSize: TESTO.corpoPiccolo, color: C.textMuted, fontWeight: '600', lineHeight: 20, fontStyle: 'normal' },
  scenarioBox:      { backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 12, padding: 14, marginBottom: 16 },
  scenarioText:     { fontSize: TESTO.corpoPiccolo, color: C.yellow, lineHeight: 22 },
  // Il bordo oro separa visivamente l'esito dalla domanda senza affidarsi alle emoji.
  feedback:         { borderWidth: 1.5, borderLeftWidth: 5, borderLeftColor: C.gold, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 17, marginBottom: 16 },
  feedbackTitle:    { fontWeight: '800', fontSize: TESTO.sottotitolo, marginBottom: 8, letterSpacing: 0.2, lineHeight: 24 },
  feedbackBody:     { color: C.optionText, fontSize: TESTO.corpo, lineHeight: 26 },
  // Buttons
  btn:              { width: '100%', padding: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, alignItems: 'center' },
  btnDisabled:      { backgroundColor: C.divider, borderColor: C.divider },
  btnText:          { color: C.text, fontSize: TESTO.sottotitolo, fontWeight: '800', letterSpacing: 0.3 },
  optionBtn:        { backgroundColor: C.surface, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 15, marginBottom: 10 },
  optRow:           { flexDirection: 'row', alignItems: 'center', gap: 11 },
  optSelected:      { backgroundColor: C.selBg, borderColor: C.selBorder, borderWidth: 2 },
  matchChip:        { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10, minHeight: 48, justifyContent: 'center' },
  sortCard:         { backgroundColor: C.surfaceDark, borderWidth: 1.5, borderColor: C.dividerFaint, borderRadius: 16, paddingVertical: 26, paddingHorizontal: 16, minHeight: 96, alignItems: 'center', justifyContent: 'center' },
  optionText:       { color: C.optionText, fontSize: TESTO.corpo, lineHeight: 25 },
  tfBtn:            { flex: 1, padding: 16, backgroundColor: C.surface, borderWidth: 2, borderColor: C.border, borderRadius: 14, alignItems: 'center' },
  tfBtnText:        { fontSize: TESTO.corpoGrande, fontWeight: '700', color: C.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  // Home
  streakBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  streakBadgeNum:   {  fontWeight: '700', fontSize: TESTO.corpo },
  riskBanner:       { backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', borderRadius: 14, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  okBannerRow:      { backgroundColor: 'rgba(251,146,60,0.08)', borderWidth: 1, borderColor: 'rgba(251,146,60,0.25)', borderRadius: 14, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statsRow:         { backgroundColor: 'rgba(79,70,229,0.15)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)', borderRadius: 14, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  statsLabel:       { fontSize: TESTO.occhiello, color: C.textDim, letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  statsValue:       { fontSize: TESTO.titoloEnorme, fontWeight: '700', color: C.indigoLight },
  levelBadge:       { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(99,102,241,0.35)', borderWidth: 1.5, borderColor: C.indigoLight, alignItems: 'center', justifyContent: 'center' },
  dashCard:         { backgroundColor: 'rgba(99,102,241,0.12)', borderWidth: 1.5, borderColor: 'rgba(129,140,248,0.35)', borderRadius: 18, padding: 16, marginBottom: 20 },
  levelBadgeBig:    { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(99,102,241,0.4)', borderWidth: 2, borderColor: C.indigoLight, alignItems: 'center', justifyContent: 'center' },
  levelBadgeBigNum: { fontSize: TESTO.titoloEnorme, fontWeight: '800', color: C.indigoPale },
  levelBadgeNum:    { fontSize: TESTO.titoloMedio, fontWeight: '800', color: C.indigoPale, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  moduleRow:        { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderRadius: 16, padding: 16, marginBottom: 11, flexDirection: 'row', alignItems: 'center', gap: 12 },
  doneBadge:        { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  homeSectionLabel: { fontSize: TESTO.piccolo, color: C.textMuted, fontWeight: '800', letterSpacing: 0.5, marginTop: 22, marginBottom: 12 },
  percorsoBlock:    { marginBottom: 12 },
  percorsoHeader:   { borderWidth: 1.5, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  percorsoIcon:     { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  percorsoTitle:    { fontSize: TESTO.sottotitolo, fontWeight: '800', color: C.text },
  percorsoSub:      { fontSize: TESTO.minuscolo, color: C.textDim, marginTop: 1 },
  percorsoBody:     { marginTop: 10, marginLeft: 16, marginRight: 4, paddingLeft: 14, borderLeftWidth: 2.5 },
  lessonRow:        { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 12 },
  lessonIcon:       { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  lessonPathItem:   { position: 'relative', paddingLeft: 2 },
  lessonConnector:  { position: 'absolute', left: 33, top: 42, bottom: -1, width: 2, borderRadius: 2, backgroundColor: C.divider },
  lessonStatus:     { fontSize: TESTO.minuscolo, color: C.textDim, marginTop: 3, lineHeight: 18 },
  badge:            { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  // Streak modal
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalSheet:       { backgroundColor: C.surfaceDark, borderWidth: 1, borderColor: C.border, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  modalHandle:      { width: 40, height: 4, backgroundColor: C.divider, borderRadius: 99, alignSelf: 'center', marginBottom: 24 },
  weekRow:          { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  dayDot:           { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface, borderWidth: 2, borderColor: C.surfaceHover, alignItems: 'center', justifyContent: 'center' },
  streakStats:      { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 14, marginBottom: 20 },
  atRiskBanner:     { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 12, padding: 12, marginBottom: 14 },
  okBanner:         { backgroundColor: 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', borderRadius: 12, padding: 12, marginBottom: 14 },
  closeBtn:         { padding: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, alignItems: 'center' },
  // Ripasso
  revistaHeader:    { backgroundColor: 'rgba(251,191,36,0.08)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)', borderRadius: 12, padding: 10, marginBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
  revistaHeaderText:{ fontSize: TESTO.piccolo, color: C.gold, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  // Celebration
  celebrationOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  celebrationText:  { fontSize: 28, fontWeight: '800', color: C.orange, marginTop: 14, textAlign: 'center' },
  // Difficoltà
  diffBadge:        { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  // Stili mancanti referenziati ma mai definiti (quiz singolo + modale badge)
  quizOption:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 12, padding: 14, marginBottom: 8 },
  quizOptionText:   { color: C.optionText, fontSize: TESTO.corpo, lineHeight: 25, flex: 1, paddingRight: 8 },
  modalContent:     { backgroundColor: C.surfaceDark, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 28, alignItems: 'center', marginHorizontal: 30, marginBottom: 30 },
  // Figurine
  albumCard:        { marginTop: 16, backgroundColor: 'rgba(232,121,249,0.08)', borderWidth: 1.5, borderColor: 'rgba(232,121,249,0.3)', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  packReward:       { width: '100%', backgroundColor: 'rgba(232,121,249,0.08)', borderWidth: 1.5, borderColor: 'rgba(232,121,249,0.35)', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  packBox:          { width: '100%', alignItems: 'center', borderWidth: 1.5, borderRadius: 18, padding: 22, marginVertical: 16 },
  revealRow:        { flexDirection: 'row', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  revealCard:       { width: (SW - 68) / 3, minHeight: 150, borderWidth: 1.5, borderRadius: 14, padding: 10, alignItems: 'center', justifyContent: 'center', gap: 8 },
  flipFace:         { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 1.5, borderRadius: 14, padding: 8, alignItems: 'center', justifyContent: 'center', gap: 6, backfaceVisibility: 'hidden' },
  flipFaceBig:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2.5, borderRadius: 18, padding: 7, alignItems: 'center', justifyContent: 'center', backfaceVisibility: 'hidden' },
  arrowBtn:         { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },
  arrowTxt:         { color: C.text, fontSize: 42, fontWeight: '300', lineHeight: 46 },
  revealName:       { fontSize: TESTO.minuscolo, fontWeight: '700', textAlign: 'center', lineHeight: 14 },
  newTag:           { position: 'absolute', top: 6, right: 6, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  albumTopBar:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, marginBottom: 6 },
  albumPage:        { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center' },
  albumPageInner:   { flex: 1, backgroundColor: '#f8f5f0', borderRadius: 18, padding: 18, width: SW - 32, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, elevation: 8, borderWidth: 1, borderColor: '#e7e0d6' },
  albumPageHeader:  { alignItems: 'center', marginBottom: 16 },
  albumPageNum:     { fontSize: TESTO.piccolo, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  albumPageTitle:   { fontSize: TESTO.titoloGrande, fontWeight: '800', textAlign: 'center', color: C.slate },
  albumPageSubtitle:{ fontSize: TESTO.piccolo, color: C.lightMuted, marginTop: 2, textAlign: 'center' },
  albumPageProgress:{ fontSize: TESTO.minuscolo, color: C.lightMuted, marginTop: 4 },
  albumPageGrid:    { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  albumPageDots:    { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: 16 },
  albumPageDot:     { width: 8, height: 8, borderRadius: 4 },
  albumStickerCell:{ justifyContent: 'center', alignItems: 'center' },
  stickerCard:      { width: '100%', height: '100%', backgroundColor: C.white, borderRadius: 10, borderWidth: 1, padding: 6, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4, overflow: 'hidden' },
  stickerCardImg:   { width: '100%', flex: 1, borderRadius: 4 },
  stickerCardFooter:{ paddingTop: 6, alignItems: 'center' },
  stickerCardName:  { fontSize: TESTO.minuscolo, fontWeight: '800', textAlign: 'center', color: C.slate },
  stickerCardEpithet:{ fontSize: TESTO.minuto, fontWeight: '700', textAlign: 'center' },
  stickerTierBadge: { position: 'absolute', top: 6, left: 6, zIndex: 2, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  stickerStudiedBadge:{ position: 'absolute', top: 6, right: 6, zIndex: 2, backgroundColor: C.gold, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 2 },
  stickerDupBadge:  { position: 'absolute', bottom: 6, right: 4, zIndex: 2, backgroundColor: C.bg, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 },
  stickerEmptySlot: { width: '100%', height: '100%', borderRadius: 10, borderWidth: 2, borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  stickerEmptyNum:  { fontSize: 28, fontWeight: '800' },
  stickerEmptyLabel:{ fontSize: TESTO.corpo, marginTop: 2 },
  evoBox:           { marginTop: 12, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, backgroundColor: C.surface, alignItems: 'center' },
  recapBtn:         { marginTop: 12, borderWidth: 1.5, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bigStickerCard:   { backgroundColor: C.white, borderRadius: 14, borderWidth: 2, padding: 10, shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10, overflow: 'hidden' },
  bigStickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  bigStickerFooter: { paddingVertical: 10, alignItems: 'center', backgroundColor: C.white },
  bigStickerName:   { fontSize: TESTO.titoloMedio, fontWeight: '800', textAlign: 'center' },
  bigStickerEpithet:{ fontSize: TESTO.corpoPiccolo, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  bigStickerMeta:   { fontSize: TESTO.minuscolo, textAlign: 'center', marginTop: 2 },
  // Fill-in-the-blank
  fillSentenceBox:  { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, borderLeftColor: C.indigo, borderRadius: 12, padding: 16, marginBottom: 18 },
  fillSentence:     { fontSize: TESTO.sottotitolo, color: C.text, lineHeight: 30 },
  fillBlank:        { fontWeight: '800', borderBottomWidth: 2, paddingHorizontal: 2 },
  // Chip su 2 colonne a larghezza fissa: meno vuoto, parole più grandi e più facili da toccare.
  fillOptionsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16, justifyContent: 'space-between' },
  fillChip:         { width: '48%', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 14, alignItems: 'center' },
  fillChipText:     { color: C.text, fontSize: TESTO.titoloPiccolo, fontWeight: '700', textAlign: 'center' },
});

const cache = new WeakMap<object, ReturnType<typeof createStyles>>();
export function stylesFor(palette: typeof C) {
  let styles = cache.get(palette);
  if (!styles) { styles = createStyles(palette); cache.set(palette, styles); }
  return styles;
}
export const s = stylesFor(C);
export function useStyles() { return stylesFor(usePalette()); }
