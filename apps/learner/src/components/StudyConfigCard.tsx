import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { Button, Card, colors, useUiStyles } from './ui';

const DARK_TONE: Record<string, { fg: string; bg: string }> = {
  '#2563eb': { fg: '#60a5fa', bg: 'rgba(37,99,235,0.16)' },
  '#4f46e5': { fg: '#818cf8', bg: 'rgba(79,70,229,0.18)' },
  '#e11d48': { fg: '#fb7185', bg: 'rgba(225,29,72,0.16)' },
};

export interface StudyConfigCardProps {
  includeMap: boolean;
  includeCourse: boolean;
  includeGamify: boolean;
  includeVoice: boolean;
  onToggleMap: () => void;
  onToggleCourse: () => void;
  onToggleGamify: () => void;
  onToggleVoice: () => void;
  onNext: () => void;
}

interface ToggleOptionCardProps {
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  footerText: string;
  active: boolean;
  accentColor: string;
  softBg: string;
  badgeText?: string;
  toggleLabel: string;
  compatto?: boolean;
  onToggle: () => void;
}

function ToggleOptionCard({
  icon,
  title,
  subtitle,
  description,
  footerText,
  active,
  accentColor,
  softBg,
  badgeText,
  toggleLabel,
  compatto,
  onToggle,
}: ToggleOptionCardProps) {
  const C = usePalette(), { dark } = useTheme();
  const tone = DARK_TONE[accentColor];
  const accent = dark && tone ? tone.fg : accentColor;
  const activeBg = dark && tone ? tone.bg : softBg;
  return (
    <View
      style={[
        localStyles.optionCard,
        compatto && { width: '100%', minWidth: '100%', flex: undefined },
        active
          ? { borderColor: accent, backgroundColor: activeBg, borderWidth: 2 }
          : [localStyles.optionCardInactive, dark && { borderColor: C.border, backgroundColor: C.surface }],
      ]}
    >
      <View style={localStyles.optionHeader}>
        <View style={localStyles.iconRow}>
          <Text style={localStyles.iconText}>{icon}</Text>
          {!!badgeText && (
            <View style={[localStyles.tagBadge, { backgroundColor: accentColor }]}>
              <Text style={localStyles.tagBadgeText}>{badgeText}</Text>
            </View>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={toggleLabel}
          accessibilityState={{ selected: active }}
          onPress={onToggle}
          style={({ pressed }) => [
            localStyles.togglePill,
            { backgroundColor: active ? accentColor : dark ? '#1e293b' : '#e2e8f0' },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={[localStyles.togglePillText, !active && { color: dark ? C.textMuted : colors.muted }]}>
            {active ? 'Sì, Includi' : 'No, Escludi'}
          </Text>
        </Pressable>
      </View>

      <View style={localStyles.optionBody}>
        <Text style={[localStyles.optionTitle, dark && { color: C.text }]}>{title}</Text>
        <Text style={[localStyles.optionSubtitle, { color: accent }]}>{subtitle}</Text>
        <Text style={[localStyles.optionDesc, dark && { color: C.textMuted }]}>{description}</Text>
      </View>

      <View style={[localStyles.optionFooter, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
        <Text style={[localStyles.optionFooterText, { color: accent }]}>{footerText}</Text>
      </View>
    </View>
  );
}

export function StudyConfigCard({
  includeMap,
  includeCourse,
  includeGamify,
  includeVoice,
  onToggleMap,
  onToggleCourse,
  onToggleGamify,
  onToggleVoice,
  onNext,
}: StudyConfigCardProps) {
  const C = usePalette(), { dark } = useTheme(), ui = useUiStyles();
  const { width } = useWindowDimensions();
  const compatto = width < 600;
  const activeModules: string[] = [];
  if (includeMap) activeModules.push('Mappa');
  if (includeCourse) activeModules.push('Corso');
  activeModules.push('Quiz');
  if (includeGamify) activeModules.push('Ripasso Dinamico');
  if (includeVoice) activeModules.push('Ripetizione a Voce');

  return (
    <Card>
      <View style={[localStyles.headerBlock, dark && { borderBottomColor: C.border }]}>
        <Text style={ui.subtitle}>🎯 Personalizza la tua modalità di studio</Text>
        <Text style={ui.muted}>
          I quiz di autovalutazione sono la costante di verifica del metodo didattico. Scegli gli
          strumenti visivi, teorici e interattivi con cui preferisci prepararti.
        </Text>
      </View>

      <View style={localStyles.sectionBlock}>
        <Text style={[localStyles.sectionEyebrow, dark && { color: C.textMuted }]}>MODULI PRINCIPALI</Text>
        <View style={localStyles.grid}>
          <ToggleOptionCard
            icon="🌳"
            title="Mappa Concettuale"
            subtitle="SCHEMA VISIVO AD ALBERO"
            description="Navigazione gerarchica dei nodi logici, definizioni collegate e fonti del testo."
            footerText="Sintesi visiva e relazioni tra concetti"
            active={includeMap}
            accentColor="#2563eb"
            softBg="#eff6ff"
            badgeText="Albero Logico"
            toggleLabel="Includi Mappa Concettuale"
            compatto={compatto}
            onToggle={onToggleMap}
          />
          <ToggleOptionCard
            icon="📖"
            title="Corso a Schede Teoriche"
            subtitle="TEORIA PASSO-PASSO"
            description="Lezioni modulari progressive con concetti chiave ed esempi applicati."
            footerText="Studio approfondito dei contenuti"
            active={includeCourse}
            accentColor="#2563eb"
            softBg="#eff6ff"
            badgeText="Slide Studio"
            toggleLabel="Includi Corso a Schede"
            compatto={compatto}
            onToggle={onToggleCourse}
          />
          <View
            style={[
              localStyles.optionCard,
              compatto && { width: '100%', minWidth: '100%', flex: undefined },
              localStyles.quizFixedCard,
              dark && { backgroundColor: 'rgba(16,185,129,0.14)', borderColor: '#34d399' },
            ]}
          >
            <View style={localStyles.optionHeader}>
              <Text style={localStyles.iconText}>💡</Text>
              <View style={localStyles.fixedBadge}>
                <Text style={localStyles.fixedBadgeText}>✓ Sempre Attivo</Text>
              </View>
            </View>
            <View style={localStyles.optionBody}>
              <Text style={[localStyles.optionTitle, dark && { color: C.text }]}>Quiz di Verifica</Text>
              <Text style={[localStyles.optionSubtitle, { color: dark ? '#34d399' : '#059669' }]}>
                COSTANTE DIDATTICA
              </Text>
              <Text style={[localStyles.optionDesc, dark && { color: C.textMuted }]}>
                Domande a risposta multipla, vero/falso e associazioni con soglia di idoneità.
              </Text>
            </View>
            <View style={[localStyles.optionFooter, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
              <Text style={[localStyles.optionFooterText, { color: dark ? '#34d399' : '#047857' }]}>
                Verifica oggettiva dell'apprendimento
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={localStyles.sectionBlock}>
        <View style={localStyles.advancedHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[localStyles.sectionEyebrow, dark && { color: C.textMuted }]}>
              ESPERIENZE DI RIPASSO DINAMICO
            </Text>
            <Text style={ui.muted}>
              Attiva le modalità interattive per consolidare la memoria a lungo termine.
            </Text>
          </View>
          <View style={[localStyles.newBadge, dark && { backgroundColor: C.yellowBg, borderColor: C.yellow }]}>
            <Text style={[localStyles.newBadgeText, dark && { color: C.yellow }]}>Nuovo</Text>
          </View>
        </View>

        <View style={localStyles.grid}>
          <ToggleOptionCard
            icon="⚡"
            title="Ripasso Dinamico & Sfida a Tempo"
            subtitle="PUNTI XP, STREAK E FLASHCARD"
            description="Sessioni rapide, recupero degli errori passati e badge di padronanza."
            footerText="🔥 Serie giornaliera · ⏱️ Sfida 60s · 🎯 Livelli Argento/Oro"
            active={includeGamify}
            accentColor="#4f46e5"
            softBg="#eef2ff"
            badgeText="Gamification"
            toggleLabel="Includi Ripasso Dinamico"
            compatto={compatto}
            onToggle={onToggleGamify}
          />
          <ToggleOptionCard
            icon="🎙️"
            title="Ripetizione a Voce con AI"
            subtitle="FEEDBACK IMMEDIATO SULL'ESPOSIZIONE"
            description="Ripeti a voce i concetti chiave: analisi di completezza e parole chiave."
            footerText="🗣️ Esposizione libera · 📊 Parole chiave · 🤖 Feedback tutor"
            active={includeVoice}
            accentColor="#e11d48"
            softBg="#fff1f2"
            badgeText="Coach Orale"
            toggleLabel="Includi Ripetizione a Voce"
            compatto={compatto}
            onToggle={onToggleVoice}
          />
        </View>
      </View>

      <View
        style={[
          localStyles.summaryBar,
          compatto && { flexDirection: 'column', alignItems: 'stretch' },
          dark && { backgroundColor: C.surfaceDark, borderColor: C.border },
        ]}
      >
        <View style={localStyles.summaryTextWrap}>
          <Text style={[localStyles.summaryLabel, dark && { color: C.textMuted }]}>CONFIGURAZIONE ATTIVA</Text>
          <Text style={[localStyles.summaryValue, dark && { color: '#60a5fa' }]}>{activeModules.join(' + ')}</Text>
        </View>
        <Button label="Avanti: Seleziona Materiale e Capitoli →" onPress={onNext} />
      </View>
    </Card>
  );
}

const localStyles = StyleSheet.create({
  headerBlock: {
    gap: 6,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  sectionBlock: { gap: 10 },
  sectionEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.muted },
  advancedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  newBadge: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newBadgeText: { fontSize: 11, fontWeight: '700', color: '#b45309' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  optionCard: {
    flex: 1,
    minWidth: 220,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    justifyContent: 'space-between',
  },
  optionCardInactive: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#f8fafc',
    opacity: 0.65,
  },
  quizFixedCard: { borderWidth: 2, borderColor: '#10b981', backgroundColor: '#ecfdf5' },
  optionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconText: { fontSize: 22 },
  tagBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagBadgeText: { color: 'white', fontSize: 10, fontWeight: '700' },
  togglePill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  togglePillText: { color: 'white', fontSize: 12, fontWeight: '700' },
  fixedBadge: { backgroundColor: '#059669', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  fixedBadgeText: { color: 'white', fontSize: 11, fontWeight: '700' },
  optionBody: { gap: 4 },
  optionTitle: { fontSize: 15, fontWeight: '700', color: colors.navy },
  optionSubtitle: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  optionDesc: { fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 2 },
  optionFooter: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  optionFooterText: { fontSize: 11, fontWeight: '600' },
  summaryBar: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryTextWrap: { flex: 1, minWidth: 200, gap: 2 },
  summaryLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7, color: colors.muted },
  summaryValue: { fontSize: 14, fontWeight: '700', color: '#2563eb' },
});
