import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
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
  const C = usePalette(), { dark } = useTheme();
  if (!chapters.length) return null;

  return (
    <View
      style={[
        localStyles.chaptersBox,
        dark && { backgroundColor: C.surface, borderColor: C.border },
      ]}
    >
      <Text style={[localStyles.chaptersTitle, dark && { color: C.text }]}>
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
                dark && { backgroundColor: C.surfaceHover, borderColor: C.border },
                chapter.level > 1 &&
                  (dark ? { backgroundColor: C.surfaceDark } : localStyles.chapterPillNested),
                isSelected &&
                  (dark
                    ? { backgroundColor: '#0e7490', borderColor: C.teal }
                    : localStyles.chapterPillActive),
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text
                style={[
                  localStyles.chapterPillText,
                  dark && { color: C.text },
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
