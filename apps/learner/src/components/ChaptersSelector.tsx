import React, { useState, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { DocumentChapter } from '../api/documents';
import { styles } from './ChaptersSelectorStyles';

export type ChapterTreeItem = {
  chapter: DocumentChapter;
  index: number;
  children: { chapter: DocumentChapter; index: number }[];
};

export function buildChapterTree(chapters: DocumentChapter[]): ChapterTreeItem[] {
  const tree: ChapterTreeItem[] = [];
  let currentParent: ChapterTreeItem | null = null;
  chapters.forEach((ch, index) => {
    if (ch.level <= 1 || !currentParent) {
      currentParent = { chapter: ch, index, children: [] };
      tree.push(currentParent);
    } else {
      currentParent.children.push({ chapter: ch, index });
    }
  });
  return tree;
}

type Props = {
  chapters: DocumentChapter[];
  range: boolean;
  from?: string;
  to?: string;
  disabled?: boolean;
  onSelect?: (chapter: DocumentChapter) => void;
  onSelectionChange?: (intervals: { fromPage: number; toPage: number }[]) => void;
};

export function ChaptersSelector({
  chapters,
  range,
  from,
  to,
  disabled,
  onSelect,
  onSelectionChange,
}: Props) {
  const C = usePalette();
  const { dark } = useTheme();

  const [expandedParents, setExpandedParents] = useState<Record<number, boolean>>({});
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

  const tree = useMemo(() => buildChapterTree(chapters), [chapters]);

  if (!chapters.length) return null;

  function emitIntervals(newIndices: number[]) {
    setSelectedIndices(newIndices);
    if (onSelectionChange) {
      const selectedChapters = chapters.filter((_, idx) => newIndices.includes(idx));
      const intervals = selectedChapters.map((c) => ({
        fromPage: c.fromPage,
        toPage: c.toPage,
      }));
      onSelectionChange(intervals);
    }
  }

  function toggleParentSelection(item: ChapterTreeItem) {
    const allChildIndices = item.children.map((c) => c.index);
    const itemIndices = [item.index, ...allChildIndices];
    const isSelected = selectedIndices.includes(item.index);

    let next: number[];
    if (isSelected) {
      next = selectedIndices.filter((idx) => !itemIndices.includes(idx));
    } else {
      next = Array.from(new Set([...selectedIndices, ...itemIndices]));
    }
    emitIntervals(next);
    onSelect?.(item.chapter);
  }

  function toggleChildSelection(childIndex: number, parentItem: ChapterTreeItem) {
    const isSelected = selectedIndices.includes(childIndex);
    let next: number[];
    if (isSelected) {
      next = selectedIndices.filter((idx) => idx !== childIndex && idx !== parentItem.index);
    } else {
      const childIndices = parentItem.children.map((c) => c.index);
      const afterAdd = Array.from(new Set([...selectedIndices, childIndex]));
      const allChildrenSelected = childIndices.every((idx) => afterAdd.includes(idx));
      next = allChildrenSelected ? Array.from(new Set([...afterAdd, parentItem.index])) : afterAdd;
    }
    emitIntervals(next);
    onSelect?.(chapters[childIndex]);
  }

  function toggleExpand(parentIndex: number) {
    setExpandedParents((prev) => ({
      ...prev,
      [parentIndex]: !prev[parentIndex],
    }));
  }

  // Genera le chip riassuntive
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  tree.forEach((item) => {
    const parentSelected = selectedIndices.includes(item.index);
    if (parentSelected) {
      chips.push({
        key: `p-${item.index}`,
        label: `${item.chapter.title} · pp. ${item.chapter.fromPage}–${item.chapter.toPage}`,
        onRemove: () => toggleParentSelection(item),
      });
    } else {
      item.children.forEach((child) => {
        if (selectedIndices.includes(child.index)) {
          chips.push({
            key: `c-${child.index}`,
            label: `${child.chapter.title} · pp. ${child.chapter.fromPage}–${child.chapter.toPage}`,
            onRemove: () => toggleChildSelection(child.index, item),
          });
        }
      });
    }
  });

  return (
    <View
      style={[
        styles.chaptersBox,
        dark && { backgroundColor: C.surface, borderColor: C.border },
      ]}
    >
      <Text style={[styles.chaptersTitle, dark && { color: C.text }]}>
        📖 Capitoli e sezioni rilevati nel libro (multi-selezione con albero)
      </Text>

      {/* Chip riassuntive delle selezioni attive */}
      {chips.length > 0 && (
        <View style={styles.chipsContainer}>
          <Text style={[styles.chipsHeading, dark && { color: C.textMuted }]}>
            {`Selezionati (${chips.length}):`}
          </Text>
          <View style={styles.chipsRow}>
            {chips.map((chip) => (
              <Pressable
                key={chip.key}
                accessibilityRole="button"
                accessibilityLabel={`Rimuovi ${chip.label}`}
                disabled={disabled}
                onPress={chip.onRemove}
                style={[
                  styles.chip,
                  dark && { backgroundColor: C.surfaceHover, borderColor: C.border },
                ]}
              >
                <Text style={[styles.chipText, dark && { color: C.text }]} numberOfLines={1}>
                  {chip.label}
                </Text>
                <Text style={styles.chipClose}>×</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Lista gerarchica capitoli */}
      <View style={styles.treeList}>
        {tree.map((item) => {
          const isParentSelected =
            selectedIndices.includes(item.index) ||
            (range && from === String(item.chapter.fromPage) && to === String(item.chapter.toPage));
          const isExpanded = !!expandedParents[item.index];
          const hasChildren = item.children.length > 0;
          const pageLabel =
            item.chapter.fromPage === item.chapter.toPage
              ? `p. ${item.chapter.fromPage}`
              : `pp. ${item.chapter.fromPage}–${item.chapter.toPage}`;

          return (
            <View key={`node-${item.chapter.title}-${item.index}`} style={styles.nodeWrapper}>
              <View
                style={[
                  styles.nodeRow,
                  isParentSelected && (dark ? styles.nodeRowSelectedDark : styles.nodeRowSelected),
                ]}
              >
                {/* Espansione albero */}
                {hasChildren ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isExpanded }}
                    accessibilityLabel={isExpanded ? `Collassa sezioni di ${item.chapter.title}` : `Espandi sezioni di ${item.chapter.title}`}
                    disabled={disabled}
                    onPress={() => toggleExpand(item.index)}
                    style={styles.expandBtn}
                  >
                    <Text style={[styles.expandBtnText, dark && { color: C.text }]}>
                      {isExpanded ? '▼' : '▶'}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.expandPlaceholder} />
                )}

                {/* Checkbox e selezione */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Seleziona ${item.chapter.title} · ${pageLabel}`}
                  disabled={disabled}
                  onPress={() => toggleParentSelection(item)}
                  style={styles.checkTarget}
                >
                  <View style={[styles.checkbox, isParentSelected && styles.checkboxActive]}>
                    {isParentSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text
                    style={[
                      styles.nodeTitle,
                      dark && { color: C.text },
                      isParentSelected && styles.nodeTitleActive,
                    ]}
                    numberOfLines={1}
                  >
                    {item.chapter.title}
                  </Text>
                  <Text style={[styles.nodePages, dark && { color: C.textMuted }]}>
                    {pageLabel}
                  </Text>
                </Pressable>
              </View>

              {/* Sezioni figlie (livello 2+) */}
              {hasChildren && isExpanded && (
                <View style={styles.childrenContainer}>
                  {item.children.map((child) => {
                    const isChildSelected =
                      selectedIndices.includes(child.index) ||
                      (range && from === String(child.chapter.fromPage) && to === String(child.chapter.toPage));
                    const childPageLabel =
                      child.chapter.fromPage === child.chapter.toPage
                        ? `p. ${child.chapter.fromPage}`
                        : `pp. ${child.chapter.fromPage}–${child.chapter.toPage}`;

                    return (
                      <View
                        key={`child-${child.chapter.title}-${child.index}`}
                        style={[
                          styles.childRow,
                          isChildSelected && (dark ? styles.nodeRowSelectedDark : styles.nodeRowSelected),
                        ]}
                      >
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Seleziona ${child.chapter.title} · ${childPageLabel}`}
                          disabled={disabled}
                          onPress={() => toggleChildSelection(child.index, item)}
                          style={styles.checkTarget}
                        >
                          <View style={[styles.checkbox, isChildSelected && styles.checkboxActive]}>
                            {isChildSelected && <Text style={styles.checkmark}>✓</Text>}
                          </View>
                          <Text
                            style={[
                              styles.childTitle,
                              dark && { color: C.text },
                              isChildSelected && styles.nodeTitleActive,
                            ]}
                            numberOfLines={1}
                          >
                            {child.chapter.title}
                          </Text>
                          <Text style={[styles.nodePages, dark && { color: C.textMuted }]}>
                            {childPageLabel}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
