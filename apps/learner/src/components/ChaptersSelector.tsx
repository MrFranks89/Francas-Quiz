import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DocumentChapter } from '../api/documents';
import { colors } from './ui';

export function ChaptersSelector({
  chapters,
  range,
  from,
  to,
  disabled,
  onSelect,
}: {
  chapters: DocumentChapter[];
  range: boolean;
  from: string;
  to: string;
  disabled?: boolean;
  onSelect: (chapter: DocumentChapter) => void;
}) {
  if (!chapters.length) return null;

  return (
    <View style={localStyles.chaptersBox}>
      <Text style={localStyles.chaptersTitle}>
        📖 Capitoli rilevati nel libro (tocca per selezionare)
      </Text>
      <View style={localStyles.chaptersPillsRow}>
        {chapters.map((chapter, idx) => {
          const isSelected =
            range && from === String(chapter.fromPage) && to === String(chapter.toPage);
          const pageLabel =
            chapter.fromPage === chapter.toPage
              ? `p. ${chapter.fromPage}`
              : `pp. ${chapter.fromPage}–${chapter.toPage}`;
          return (
            <Pressable
              key={`${chapter.title}-${chapter.fromPage}-${idx}`}
              accessibilityRole="button"
              accessibilityLabel={`Seleziona ${chapter.title} · ${pageLabel}`}
              disabled={disabled}
              onPress={() => onSelect(chapter)}
              style={({ pressed }) => [
                localStyles.chapterPill,
                chapter.level > 1 && localStyles.chapterPillNested,
                isSelected && localStyles.chapterPillActive,
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text
                style={[
                  localStyles.chapterPillText,
                  isSelected && localStyles.chapterPillTextActive,
                ]}
              >
                {`${chapter.title} · ${pageLabel}`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  chaptersBox: {
    backgroundColor: '#f0fdfa',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#99f6e4',
    padding: 14,
    gap: 10,
  },
  chaptersTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  chaptersPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chapterPill: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#cde4e0',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chapterPillNested: {
    backgroundColor: '#f8fafc',
  },
  chapterPillActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  chapterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
  },
  chapterPillTextActive: {
    color: 'white',
  },
});
