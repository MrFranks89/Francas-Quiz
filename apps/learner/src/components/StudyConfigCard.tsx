import React, { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { Button, Card, colors, useUiStyles } from './ui';
import { localStyles } from './StudyConfigCardStyles';

const DARK_TONE: Record<string, { fg: string; bg: string }> = {
  [colors.tierBase]: { fg: '#60a5fa', bg: 'rgba(37,99,235,0.16)' },
  [colors.tierPro]: { fg: '#fbbf24', bg: 'rgba(217,119,6,0.18)' },
  [colors.tierUltra]: { fg: '#c084fc', bg: 'rgba(124,58,237,0.18)' },
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
  defaultExpanded?: boolean;
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
  const C = usePalette();
  const { dark } = useTheme();
  const tone = DARK_TONE[accentColor];
  const accent = dark && tone ? tone.fg : accentColor;
  const activeBg = dark && tone ? tone.bg : softBg;

  return (
    <View
      style={[
        localStyles.optionCard,
        compatto && { width: '100%', minWidth: '100%', flex: undefined },
        active
          ? { borderColor: accent, backgroundColor: activeBg, borderWidth: 2, opacity: 1 }
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
        <Text style={[localStyles.optionSubtitle, { color: active ? accent : colors.muted }]}>{subtitle}</Text>
        <Text style={[localStyles.optionDesc, dark && { color: C.textMuted }]}>{description}</Text>
      </View>

      <View style={[localStyles.optionFooter, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
        <Text style={[localStyles.optionFooterText, { color: active ? accent : colors.muted }]}>{footerText}</Text>
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
  defaultExpanded = true,
}: StudyConfigCardProps) {
  const C = usePalette();
  const { dark } = useTheme();
  const ui = useUiStyles();
  const { width } = useWindowDimensions();
  const compatto = width < 600;

  const [expanded, setExpanded] = useState(defaultExpanded);

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
          I quiz di autovalutazione sono la costante di verifica del metodo didattico. Configura
          gli strumenti con cui preferisci prepararti.
        </Text>
      </View>

      {/* Se chiuso (default): mostra solo configurazione attiva e link per espandere */}
      {!expanded ? (
        <View style={localStyles.collapsedWrap}>
          <View
            style={[
              localStyles.summaryBox,
              dark && { backgroundColor: C.surfaceDark, borderColor: C.border },
            ]}
          >
            <Text style={[localStyles.summaryLabel, dark && { color: C.textMuted }]}>
              CONFIGURAZIONE ATTIVA
            </Text>
            <Text style={[localStyles.summaryValue, dark && { color: '#60a5fa' }]}>
              {activeModules.join(' + ')}
            </Text>
            <Text style={[ui.muted, { fontSize: 13, marginTop: 4 }]}>
              {includeCourse
                ? 'Corso a schede teoriche e quiz di verifica'
                : 'Quiz di verifica con strumenti interattivi'}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Personalizza la modalità di studio"
            onPress={() => setExpanded(true)}
            style={({ pressed }) => [
              localStyles.customizeLink,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[localStyles.customizeLinkText, dark && { color: '#60a5fa' }]}>
              ⚙️ Personalizza la modalità di studio (apri opzioni avanzate) ▼
            </Text>
          </Pressable>

          <Button label="Avanti: Seleziona Materiale e Capitoli →" onPress={onNext} />
        </View>
      ) : (
        <>
          <View style={localStyles.sectionBlock}>
            <View style={localStyles.advancedHeader}>
              <Text style={[localStyles.sectionEyebrow, dark && { color: C.textMuted }]}>
                MODULI PRINCIPALI (PIANO BASE)
              </Text>
              <Pressable onPress={() => setExpanded(false)} style={{ padding: 4 }}>
                <Text style={[localStyles.closeLink, dark && { color: '#60a5fa' }]}>Chiudi opzioni ▲</Text>
              </Pressable>
            </View>

            <View style={localStyles.grid}>
              <ToggleOptionCard
                icon="🌳"
                title="Mappa Concettuale"
                subtitle="BASE · SCHEMA VISIVO AD ALBERO"
                description="Navigazione gerarchica dei nodi logici, definizioni collegate e fonti del testo."
                footerText="Sintesi visiva e relazioni tra concetti"
                active={includeMap}
                accentColor={colors.tierBase}
                softBg={colors.tierBaseBg}
                badgeText="Base"
                toggleLabel="Includi Mappa Concettuale"
                compatto={compatto}
                onToggle={onToggleMap}
              />
              <ToggleOptionCard
                icon="📖"
                title="Corso a Schede Teoriche"
                subtitle="BASE · TEORIA PASSO-PASSO"
                description="Lezioni modulari progressive con concetti chiave ed esempi applicati."
                footerText="Studio approfondito dei contenuti"
                active={includeCourse}
                accentColor={colors.tierBase}
                softBg={colors.tierBaseBg}
                badgeText="Base"
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
                    BASE · COSTANTE DIDATTICA
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
                  MODALITÀ AVANZATE (PIANI PRO & ULTRA)
                </Text>
                <Text style={ui.muted}>
                  In fase beta tutte le modalità avanzate sono attive per tutti gli utenti.
                </Text>
              </View>
            </View>

            <View style={localStyles.grid}>
              <ToggleOptionCard
                icon="⚡"
                title="Ripasso Dinamico & Sfida a Tempo"
                subtitle="PRO · PUNTI XP, STREAK E FLASHCARD"
                description="Sessioni rapide, recupero degli errori passati e badge di padronanza."
                footerText="🔥 Serie giornaliera · ⏱️ Sfida 60s · 🎯 Livelli Argento/Oro"
                active={includeGamify}
                accentColor={colors.tierPro}
                softBg={colors.tierProBg}
                badgeText="Pro"
                toggleLabel="Includi Ripasso Dinamico"
                compatto={compatto}
                onToggle={onToggleGamify}
              />
              <ToggleOptionCard
                icon="🎙️"
                title="Ripetizione a Voce con AI"
                subtitle="ULTRA · FEEDBACK IMMEDIATO"
                description="Ripeti a voce i concetti chiave: analisi di completezza e parole chiave."
                footerText="🗣️ Esposizione libera · 📊 Parole chiave · 🤖 Feedback tutor"
                active={includeVoice}
                accentColor={colors.tierUltra}
                softBg={colors.tierUltraBg}
                badgeText="Ultra"
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
        </>
      )}
    </Card>
  );
}
