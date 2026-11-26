import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { ConceptNode, Course } from '@formazione/contracts';
import type { Extraction } from '../api/documents';
import type { Draft } from '../api/generation';
import { Card, Notice, colors, useUiStyles } from './ui';
import { ProposedIndexPanel } from './ProposedIndexPanel';
import { ConceptTreeSection } from './ConceptTreeSection';
import { GenerationPanel } from './GenerationPanel';
import { VoiceRecallCard } from './VoiceRecallCard';
import { BranchQuizSheet } from './BranchQuizSheet';

type StudioTab = 'all' | 'map' | 'course' | 'quiz' | 'voice';

export interface StudyExperienceViewProps {
  extraction: Extraction;
  documentName?: string;
  includeMap: boolean;
  includeCourse: boolean;
  includeGamify: boolean;
  includeVoice: boolean;
  passingScoreCheck?: number;
  passingScoreGate?: number | null;
  excludedPages: number[];
  onTogglePage: (pageNumber: number) => void;
  onExcludedPagesChange: (pages: number[]) => void;
  onDraft: (draft: Draft) => void;
  onStartPractice?: (course: Course) => void;
  onBackToMaterial: () => void;
  onBackToConfig: () => void;
  onNavigateDuels?: () => void;
  onNavigateReferral?: () => void;
}

export function StudyExperienceView({
  extraction,
  documentName,
  includeMap,
  includeCourse,
  includeGamify,
  includeVoice,
  passingScoreCheck,
  passingScoreGate,
  excludedPages,
  onTogglePage,
  onExcludedPagesChange,
  onDraft,
  onStartPractice,
  onBackToMaterial,
  onBackToConfig,
  onNavigateDuels,
  onNavigateReferral,
}: StudyExperienceViewProps) {
  const C = usePalette(), { dark } = useTheme(), ui = useUiStyles();
  const [activeTab, setActiveTab] = useState<StudioTab>('all');
  const [focusedNode, setFocusedNode] = useState<ConceptNode | null>(null);
  const [quizBranchTarget, setQuizBranchTarget] = useState<{
    branch: { id: string; title: string };
    node: ConceptNode;
    treeHash?: string;
  } | null>(null);

  const activeLabels: string[] = [];
  if (includeMap) activeLabels.push('Mappa');
  if (includeCourse) activeLabels.push('Corso');
  activeLabels.push('Quiz');
  if (includeVoice) activeLabels.push('Ripetizione a Voce');

  const tabs: Array<{ id: StudioTab; label: string; visible: boolean }> = [
    { id: 'all', label: 'Tutti i moduli', visible: true },
    { id: 'map', label: '🌳 Mappa Concettuale', visible: includeMap },
    { id: 'course', label: '📖 Corso a Schede', visible: includeCourse },
    { id: 'quiz', label: '💡 Quiz di Verifica', visible: true },
    { id: 'voice', label: '🎙️ Ripeti a Voce', visible: includeVoice },
  ];

  const show = (tab: StudioTab) => activeTab === 'all' || activeTab === tab;

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <View style={localStyles.navRow}>
          <View style={localStyles.navActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Torna al materiale e capitoli"
              onPress={onBackToMaterial}
              style={({ pressed }) => [
                localStyles.navBtn,
                dark && { backgroundColor: 'rgba(59,130,246,0.16)', borderColor: 'rgba(96,165,250,0.35)' },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text style={[localStyles.navBtnText, dark && { color: '#93c5fd' }]}>
                ← Capitoli e materiale
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Modifica impostazioni percorso"
              onPress={onBackToConfig}
              style={({ pressed }) => [
                localStyles.navBtnSecondary,
                dark && { backgroundColor: C.surfaceHover, borderColor: C.border },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text style={[localStyles.navBtnSecondaryText, dark && { color: C.text }]}>
                ⚙️ Impostazioni percorso
              </Text>
            </Pressable>
          </View>
          <View style={localStyles.summaryWrap}>
            {!!documentName && (
              <Text style={[localStyles.docTitle, dark && { color: C.text }]} numberOfLines={1}>
                {documentName}
              </Text>
            )}
            <Text style={[localStyles.activeTags, dark && { color: C.textMuted }]}>
              {`Moduli attivi: ${activeLabels.join(', ')}`}
            </Text>
          </View>
        </View>

        <View style={localStyles.tabsRow}>
          {tabs
            .filter((t) => t.visible)
            .map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  accessibilityRole="button"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected }}
                  onPress={() => setActiveTab(tab.id)}
                  style={({ pressed }) => [
                    localStyles.tabPill,
                    dark && { backgroundColor: C.surfaceHover },
                    selected && localStyles.tabPillActive,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text
                    style={[
                      localStyles.tabPillText,
                      dark && { color: C.textMuted },
                      selected && localStyles.tabPillTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
        </View>
      </Card>

      <Card>
        <Text style={ui.subtitle}>Fonti estratte · {extraction.blocks.length} blocchi</Text>
        <Notice
          text={
            extraction.status === 'needs_review'
              ? 'Sono presenti contenuti da verificare prima di creare un corso.'
              : 'Estrazione completata. Controlla i contenuti prima della generazione didattica.'
          }
        />
        {extraction.warnings.map((w, i) => (
          <Notice key={i} text={w} error />
        ))}
        {excludedPages.length > 0 && (
          <View
            style={[
              localStyles.excludedBanner,
              dark && { backgroundColor: C.yellowBg, borderColor: C.yellow },
            ]}
          >
            <Text style={[localStyles.excludedBannerText, dark && { color: C.yellow }]}>
              {`📌 ${excludedPages.length} ${excludedPages.length === 1 ? 'pagina esclusa' : 'pagine escluse'} dalla generazione didattica: ${excludedPages.join(', ')}`}
            </Text>
          </View>
        )}

        {includeMap && show('map') && (
          <ConceptTreeSection
            key={`concept-${extraction.id}`}
            extractionId={extraction.id}
            excludedPages={excludedPages}
            hasBlocks={extraction.blocks.length > 0}
            onPracticeVoice={
              includeVoice
                ? (node) => {
                    setFocusedNode(node);
                    setActiveTab('voice');
                  }
                : undefined
            }
            onPracticeQuiz={(node, branch, treeHash) => {
              setFocusedNode(node);
              setQuizBranchTarget({ branch, node, treeHash });
            }}
          />
        )}

        {quizBranchTarget && (
          <BranchQuizSheet
            extractionId={extraction.id}
            branch={quizBranchTarget.branch}
            node={quizBranchTarget.node}
            treeHash={quizBranchTarget.treeHash}
            onClose={() => setQuizBranchTarget(null)}
            onStartPractice={(course) => {
              setQuizBranchTarget(null);
              if (onStartPractice) {
                onStartPractice(course);
              }
            }}
          />
        )}

        {includeCourse && show('course') && (
          <ProposedIndexPanel
            extraction={extraction}
            excludedPages={excludedPages}
            onTogglePage={onTogglePage}
          />
        )}

        {show('quiz') && (
          <GenerationPanel
            key={extraction.id}
            extraction={extraction}
            onDraft={onDraft}
            excludedPages={excludedPages}
            onExcludedPagesChange={onExcludedPagesChange}
            passingScoreCheck={passingScoreCheck}
            passingScoreGate={passingScoreGate}
          />
        )}
      </Card>

      {includeVoice && show('voice') && (
        <VoiceRecallCard
          topic={focusedNode?.title || documentName}
          keywords={focusedNode?.keyTerms}
          extractionId={extraction.id}
          nodeId={focusedNode?.id}
        />
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  navRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  navActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  navBtn: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  navBtnText: { color: '#1d4ed8', fontSize: 12, fontWeight: '700' },
  navBtnSecondary: {
    backgroundColor: '#f8fafc',
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  navBtnSecondaryText: { color: colors.navy, fontSize: 12, fontWeight: '600' },
  summaryWrap: { gap: 2, flex: 1, minWidth: 180 },
  docTitle: { fontSize: 13, fontWeight: '700', color: colors.navy },
  activeTags: { fontSize: 12, color: colors.muted },
  tabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tabPill: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tabPillActive: { backgroundColor: '#2563eb' },
  tabPillText: { fontSize: 12, fontWeight: '700', color: colors.muted },
  tabPillTextActive: { color: 'white' },
  excludedBanner: {
    backgroundColor: '#fffaf0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#feebc8',
  },
  excludedBannerText: { fontSize: 13, color: '#9c4221', fontWeight: '600' },
});
