import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { ConceptNode } from '@formazione/contracts';
import { colors } from './ui';

export interface ConceptNodeDetailCardProps {
  branchTitle: string;
  node: ConceptNode;
  formatSourceRef: (ref: string) => string;
  onClose: () => void;
  onPracticeVoice?: (node: ConceptNode) => void;
  onPracticeQuiz?: (node: ConceptNode) => void;
}

function buildKeyPoints(node: ConceptNode): string[] {
  if (node.keyTerms && node.keyTerms.length > 0) {
    return node.keyTerms;
  }
  const sentences = node.summary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.length > 0 ? sentences : [node.summary];
}

export function ConceptNodeDetailCard({
  branchTitle,
  node,
  formatSourceRef,
  onClose,
  onPracticeVoice,
  onPracticeQuiz,
}: ConceptNodeDetailCardProps) {
  const C = usePalette(), { dark } = useTheme();
  const sourceLine = node.sourceRefs.map(formatSourceRef).join(' · ');
  const keyPoints = buildKeyPoints(node);

  return (
    <View
      style={[
        localStyles.detailCard,
        dark && { backgroundColor: C.surfaceDark, borderColor: C.teal },
      ]}
    >
      <View style={[localStyles.headerRow, dark && { borderBottomColor: C.border }]}>
        <Text style={[localStyles.eyebrow, dark && { color: C.textMuted }]}>SCHEDA CONCETTO</Text>
        <View style={localStyles.headerRight}>
          <View
            style={[
              localStyles.branchBadge,
              dark && { backgroundColor: 'rgba(34,211,238,0.16)' },
            ]}
          >
            <Text style={[localStyles.branchBadgeText, dark && { color: C.teal }]}>
              {branchTitle}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chiudi scheda concetto"
            onPress={onClose}
            style={({ pressed }) => [localStyles.closeBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={[localStyles.closeBtnText, dark && { color: C.textMuted }]}>✕</Text>
          </Pressable>
        </View>
      </View>

      <View style={localStyles.titleBlock}>
        <Text style={[localStyles.title, dark && { color: C.text }]}>{node.title}</Text>
        <Text style={[localStyles.sourceText, dark && { color: C.teal }]}>
          {`Fonte: ${branchTitle} · ${sourceLine}`}
        </Text>
      </View>

      <View
        style={[
          localStyles.summaryBox,
          dark && { backgroundColor: C.surface, borderColor: C.border },
        ]}
      >
        <Text style={[localStyles.summaryText, dark && { color: C.lightText }]}>
          {node.summary}
        </Text>
      </View>

      <View style={localStyles.pointsBlock}>
        <Text style={[localStyles.pointsHeading, dark && { color: C.text }]}>
          Punti Chiave da Ricordare:
        </Text>
        {keyPoints.map((pt, idx) => (
          <View key={`${node.id}-pt-${idx}`} style={localStyles.pointRow}>
            <Text style={[localStyles.bullet, dark && { color: C.teal }]}>•</Text>
            <Text style={[localStyles.pointText, dark && { color: C.lightText }]}>{pt}</Text>
          </View>
        ))}
      </View>

      {(onPracticeVoice || onPracticeQuiz) && (
        <View style={[localStyles.actionsRow, dark && { borderTopColor: C.border }]}>
          {onPracticeVoice && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ripeti a voce ${node.title}`}
              onPress={() => onPracticeVoice(node)}
              style={({ pressed }) => [
                localStyles.voiceBtn,
                dark && { backgroundColor: 'rgba(225,29,72,0.16)', borderColor: 'rgba(251,113,133,0.35)' },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[localStyles.voiceBtnText, dark && { color: '#fda4af' }]}>
                🎙️ Ripeti a voce questo concetto
              </Text>
            </Pressable>
          )}
          {onPracticeQuiz && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mettiti alla prova con i quiz su ${node.title}`}
              onPress={() => onPracticeQuiz(node)}
              style={({ pressed }) => [
                localStyles.quizBtn,
                dark && { backgroundColor: C.greenBg, borderColor: C.green },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[localStyles.quizBtnText, dark && { color: C.greenText }]}>
                💡 Mettiti alla prova con i quiz
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  detailCard: {
    marginTop: 14,
    backgroundColor: 'white',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#087e83',
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: 10,
    gap: 8,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: colors.muted,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  branchBadge: {
    backgroundColor: '#e0f2fe',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  branchBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1',
  },
  closeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
  },
  titleBlock: {
    gap: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.navy,
  },
  sourceText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.teal,
  },
  summaryBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  summaryText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.ink,
  },
  pointsBlock: {
    gap: 6,
  },
  pointsHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingLeft: 4,
  },
  bullet: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.teal,
  },
  pointText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  voiceBtn: {
    flex: 1,
    minWidth: 190,
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
  },
  voiceBtnText: {
    color: '#be123c',
    fontSize: 12,
    fontWeight: '700',
  },
  quizBtn: {
    flex: 1,
    minWidth: 190,
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
  },
  quizBtnText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '700',
  },
});
