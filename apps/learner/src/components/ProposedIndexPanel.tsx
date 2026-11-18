import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Switch } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { Extraction } from '../api/documents';
import { colors } from './ui';

export type ExtractionBlock = Extraction['blocks'][number];

export type ProposedSection = {
  id: string;
  index: number;
  title: string;
  topic: string;
  pages: number[];
  pageRangeLabel: string;
  blocksCount: number;
  charCount: number;
  preview: string;
  blocks: ExtractionBlock[];
};

export function extractTopic(text: string, defaultTopic: string): string {
  if (!text) return defaultTopic;
  const lines = text.split('\n');
  for (const rawLine of lines) {
    const cleaned = rawLine
      .replace(/^[\s#*_\-–—=>0-9.)]+/, '')
      .replace(/^[A-Za-z0-9]\)\s*/, '')
      .trim();
    if (cleaned.length >= 3) {
      if (cleaned.length <= 80) return cleaned;
      const sub = cleaned.slice(0, 77);
      const lastSpace = sub.lastIndexOf(' ');
      return (lastSpace > 30 ? sub.slice(0, lastSpace) : sub).trimEnd() + '…';
    }
  }
  return defaultTopic;
}

export function formatPageRange(pages: number[]): string {
  if (pages.length === 0) return 'Senza pagina';
  if (pages.length === 1) return `Pagina ${pages[0]}`;
  const min = Math.min(...pages);
  const max = Math.max(...pages);
  return min === max ? `Pagina ${min}` : `Pagine ${min}–${max}`;
}

export function getSectionBadge(section: ProposedSection): 'Capitolo' | 'Paragrafo' | null {
  const h = section.blocks.find(
    (b) => b.kind === 'section_header' || b.kind === 'title' || Boolean(b.section && b.section.trim()),
  );
  if (!h && !section.topic) return null;
  const t = (h?.section || section.topic || '').trim().toLowerCase();
  const k = h?.kind?.toLowerCase() || '';
  if (t.startsWith('capitolo') || k === 'title' || (h?.level === 1 && !/^\d+\.\d+/.test(t))) {
    return 'Capitolo';
  }
  if (
    t.startsWith('paragrafo') ||
    k === 'section_header' ||
    (h?.level !== undefined && h.level > 1) ||
    /^\d+\.\d+/.test(t)
  ) {
    return 'Paragrafo';
  }
  return 'Capitolo';
}

export function buildProposedSections(blocks: ExtractionBlock[]): ProposedSection[] {
  if (!blocks || blocks.length === 0) return [];

  const hasSections = blocks.some((b) => Boolean(b.section && b.section.trim()));
  const groups: ExtractionBlock[][] = [];
  let currentGroup: ExtractionBlock[] = [];
  let currentSection: string | undefined = undefined;
  let currentPage: number | null | undefined = undefined;

  for (const block of blocks) {
    const bPage = block.page ?? null;
    const bSection = block.section?.trim();
    const isHeader = block.kind === 'section_header' || block.kind === 'title';

    let isNew = false;
    if (currentGroup.length === 0) {
      isNew = false;
    } else if (hasSections) {
      isNew = isHeader || (bSection !== undefined && bSection !== currentSection);
    } else {
      isNew =
        !(bPage !== null && currentPage !== null && bPage === currentPage) &&
        !(bPage === null && currentPage === null && currentGroup.length < 4);
    }

    if (isNew) {
      groups.push(currentGroup);
      currentGroup = [block];
      currentSection = bSection;
      currentPage = bPage;
    } else {
      currentGroup.push(block);
      if (!currentSection && bSection) currentSection = bSection;
      if (currentPage === undefined) currentPage = bPage;
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  return groups.map((grp, idx) => {
    const index = idx + 1;
    const pages = Array.from(
      new Set(grp.map((b) => b.page).filter((p): p is number => p !== null && p !== undefined)),
    ).sort((a, b) => a - b);
    const pageRangeLabel = formatPageRange(pages);

    const sectionName = grp.find((b) => b.section && b.section.trim())?.section?.trim();
    let topic: string;
    if (sectionName) {
      topic = sectionName;
    } else {
      const first = grp.find((b) => b.text.trim().length > 0) ?? grp[0];
      const defaultTopic = first?.label?.trim() || `Argomento ${index}`;
      topic = extractTopic(first?.text ?? '', defaultTopic);
    }

    const title =
      pages.length > 0
        ? `Sezione ${index} · ${pageRangeLabel} — ${topic}`
        : `Sezione ${index} — ${topic}`;

    const blocksCount = grp.length;
    const charCount = grp.reduce((acc, b) => acc + (b.text?.length ?? 0), 0);
    const combined = grp.map((b) => b.text?.trim() ?? '').filter(Boolean).join(' ').replace(/\s+/g, ' ');
    const preview = combined.length > 150 ? `${combined.slice(0, 147).trimEnd()}…` : combined;

    return {
      id: `section-${index}`,
      index,
      title,
      topic,
      pages,
      pageRangeLabel,
      blocksCount,
      charCount,
      preview,
      blocks: grp,
    };
  });
}

export type PageGroup = {
  page: number | null;
  label: string;
  blocks: ExtractionBlock[];
  charCount: number;
  blockCount: number;
  warnings: string[];
  hasFigures: boolean;
};

export function buildPageGroups(
  blocks: ExtractionBlock[],
  warnings: string[] = [],
): PageGroup[] {
  const map = new Map<number | null, ExtractionBlock[]>();
  for (const block of blocks) {
    const pageKey = block.page ?? null;
    const existing = map.get(pageKey) ?? [];
    existing.push(block);
    map.set(pageKey, existing);
  }

  const sortedKeys = Array.from(map.keys()).sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });

  return sortedKeys.map((pageKey) => {
    const pageBlocks = map.get(pageKey) ?? [];
    const charCount = pageBlocks.reduce((acc, b) => acc + (b.text?.length ?? 0), 0);
    const blockCount = pageBlocks.length;
    const label = pageKey !== null ? `Pagina ${pageKey}` : 'Senza pagina';

    const pageWarnings = warnings.filter((w) => {
      if (pageKey === null) return false;
      const lower = w.toLowerCase();
      return (
        lower.includes(`pagina ${pageKey}`) ||
        lower.includes(`p. ${pageKey}`) ||
        lower.includes(`p.${pageKey}`)
      );
    });

    const hasFigures =
      pageWarnings.some((w) => w.toLowerCase().includes('figura')) ||
      pageBlocks.some(
        (b) =>
          (b.label ?? '').toLowerCase().includes('picture') ||
          (b.label ?? '').toLowerCase().includes('figura'),
      );

    return {
      page: pageKey,
      label,
      blocks: pageBlocks,
      charCount,
      blockCount,
      warnings: pageWarnings,
      hasFigures,
    };
  });
}

export type ProposedIndexPanelProps = {
  extraction: Extraction;
  excludedPages?: number[];
  onTogglePage?: (page: number) => void;
};

export function ProposedIndexPanel({
  extraction,
  excludedPages = [],
  onTogglePage,
}: ProposedIndexPanelProps) {
  const C = usePalette(), { dark } = useTheme();
  const localStyles = useMemo(() => buildStyles(C, dark), [C, dark]);
  const [viewMode, setViewMode] = useState<'index' | 'sources'>('index');
  const [visibleSources, setVisibleSources] = useState(20);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({});
  const [collapsedPages, setCollapsedPages] = useState<Record<string, boolean>>({});

  const sections = useMemo(
    () => buildProposedSections(extraction.blocks),
    [extraction.blocks],
  );

  const pageGroups = useMemo(
    () => buildPageGroups(extraction.blocks, extraction.warnings),
    [extraction.blocks, extraction.warnings],
  );

  const totalPages = useMemo(() => {
    const set = new Set<number>();
    extraction.blocks.forEach((b) => {
      if (b.page !== null && b.page !== undefined) set.add(b.page);
    });
    return set.size;
  }, [extraction.blocks]);

  const totalChars = useMemo(
    () => extraction.blocks.reduce((acc, b) => acc + (b.text?.length ?? 0), 0),
    [extraction.blocks],
  );

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const sectionCountText = `${sections.length} ${
    sections.length === 1 ? 'sezione individuata' : 'sezioni individuate'
  }`;

  return (
    <View style={localStyles.container}>
      <View style={localStyles.header}>
        <View style={localStyles.headerTextCol}>
          <Text style={localStyles.mainTitle}>
            {`📚 Indice didattico proposto · ${sectionCountText}`}
          </Text>
          <Text style={localStyles.summarySubtitle}>
            {totalPages > 0
              ? `${totalPages} ${totalPages === 1 ? 'pagina coperta' : 'pagine coperte'} · `
              : ''}
            {`${extraction.blocks.length} blocchi totali · ${totalChars.toLocaleString('it-IT')} caratteri`}
          </Text>
        </View>

        <View style={localStyles.tabSwitcher}>
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Vista indice strutturato"
            onPress={() => setViewMode('index')}
            style={[localStyles.tabButton, viewMode === 'index' && localStyles.tabButtonActive]}
          >
            <Text
              style={[
                localStyles.tabButtonText,
                viewMode === 'index' && localStyles.tabButtonTextActive,
              ]}
            >
              Indice strutturato
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Vista testo integrale"
            onPress={() => setViewMode('sources')}
            style={[localStyles.tabButton, viewMode === 'sources' && localStyles.tabButtonActive]}
          >
            <Text
              style={[
                localStyles.tabButtonText,
                viewMode === 'sources' && localStyles.tabButtonTextActive,
              ]}
            >
              Testo fonti completo
            </Text>
          </Pressable>
        </View>
      </View>

      {viewMode === 'index' && (
        <View style={localStyles.sectionsList}>
          {sections.length === 0 ? (
            <Text style={localStyles.emptyText}>
              Nessun blocco di testo rilevato nelle pagine selezionate.
            </Text>
          ) : (
            sections.map((section) => {
              const isExpanded = !!expandedSections[section.id];
              const structuralBadge = getSectionBadge(section);
              return (
                <View key={section.id} style={localStyles.sectionCard}>
                  <View style={localStyles.sectionHeaderRow}>
                    <Text style={localStyles.sectionTitle}>{section.title}</Text>
                  </View>

                  <View style={localStyles.pillRow}>
                    {structuralBadge && (
                      <View style={localStyles.structuralBadge}>
                        <Text style={localStyles.structuralBadgeText}>{structuralBadge}</Text>
                      </View>
                    )}
                    {section.pages.length > 0 && (
                      <View style={localStyles.pageBadge}>
                        <Text style={localStyles.pageBadgeText}>{section.pageRangeLabel}</Text>
                      </View>
                    )}
                    <View style={localStyles.infoPill}>
                      <Text style={localStyles.infoPillText}>
                        {`${section.blocksCount} ${section.blocksCount === 1 ? 'blocco' : 'blocchi'}`}
                      </Text>
                    </View>
                    <View style={localStyles.infoPill}>
                      <Text style={localStyles.infoPillText}>
                        {`${section.charCount.toLocaleString('it-IT')} caratteri`}
                      </Text>
                    </View>
                  </View>

                  <Text style={localStyles.sectionPreview}>{section.preview}</Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      isExpanded
                        ? `Nascondi blocchi sezione ${section.index}`
                        : `Mostra blocchi sezione ${section.index}`
                    }
                    onPress={() => toggleSection(section.id)}
                    style={localStyles.expandBtn}
                  >
                    <Text style={localStyles.expandBtnText}>
                      {isExpanded
                        ? '▲ Nascondi blocchi inclusi'
                        : `▼ Mostra blocchi inclusi (${section.blocksCount})`}
                    </Text>
                  </Pressable>

                  {isExpanded && (
                    <View style={localStyles.expandedBlocksList}>
                      {section.blocks.map((block) => (
                        <View key={block.id} style={localStyles.subBlockItem}>
                          <Text style={localStyles.subBlockLabel}>
                            {block.page ? `${block.label} · p. ${block.page}` : block.label}
                          </Text>
                          <Text style={localStyles.subBlockText}>{block.text}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}

      {viewMode === 'sources' && (
        <View style={localStyles.sourcesList}>
          {pageGroups.length === 0 ? (
            <Text style={localStyles.emptyText}>
              Nessun blocco di testo rilevato nelle pagine selezionate.
            </Text>
          ) : (
            pageGroups.map((group) => {
              const isExcluded =
                group.page !== null && (excludedPages?.includes(group.page) ?? false);
              const isCollapsed = !!collapsedPages[String(group.page)];

              return (
                <View
                  key={String(group.page)}
                  style={[
                    localStyles.pageCard,
                    isExcluded && localStyles.pageCardExcluded,
                  ]}
                >
                  <View style={localStyles.pageCardHeader}>
                    <View style={localStyles.pageCardHeaderLeft}>
                      <View
                        style={[
                          localStyles.pageBadgeMain,
                          isExcluded && localStyles.pageBadgeExcluded,
                        ]}
                      >
                        <Text
                          style={[
                            localStyles.pageBadgeMainText,
                            isExcluded && localStyles.pageBadgeExcludedText,
                          ]}
                        >
                          {group.label}
                        </Text>
                      </View>
                      <Text style={localStyles.pageMetaText}>
                        {`${group.blockCount} ${group.blockCount === 1 ? 'blocco' : 'blocchi'} · ${group.charCount.toLocaleString('it-IT')} caratteri`}
                      </Text>
                    </View>

                    {group.page !== null && onTogglePage && (
                      <View style={localStyles.pageToggleRow}>
                        <Text
                          style={[
                            localStyles.pageToggleLabel,
                            isExcluded && localStyles.pageToggleLabelExcluded,
                          ]}
                        >
                          {isExcluded ? 'Esclusa' : 'Includi'}
                        </Text>
                        <Switch
                          accessibilityLabel={`Includi ${group.label} nella generazione didattica`}
                          value={!isExcluded}
                          onValueChange={() => onTogglePage(group.page!)}
                        />
                      </View>
                    )}
                  </View>

                  {isExcluded && (
                    <View style={localStyles.excludedNoticeBadge}>
                      <Text style={localStyles.excludedNoticeText}>
                        ⚠️ Pagina esclusa dalla generazione didattica
                      </Text>
                    </View>
                  )}

                  {group.hasFigures && (
                    <View style={localStyles.figureNoticeBadge}>
                      <Text style={localStyles.figureNoticeText}>
                        🖼️ Contiene figure o elementi visivi
                      </Text>
                    </View>
                  )}

                  {group.warnings.length > 0 && (
                    <View style={localStyles.pageWarningsBox}>
                      {group.warnings.map((w, wi) => (
                        <Text key={wi} style={localStyles.pageWarningItemText}>
                          ⚠️ {w}
                        </Text>
                      ))}
                    </View>
                  )}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      isCollapsed
                        ? `Mostra blocchi ${group.label}`
                        : `Nascondi blocchi ${group.label}`
                    }
                    onPress={() =>
                      setCollapsedPages((prev) => ({
                        ...prev,
                        [String(group.page)]: !isCollapsed,
                      }))
                    }
                    style={localStyles.toggleBlocksBtn}
                  >
                    <Text style={localStyles.toggleBlocksBtnText}>
                      {isCollapsed
                        ? `▼ Mostra testo estratto (${group.blockCount} ${group.blockCount === 1 ? 'blocco' : 'blocchi'})`
                        : '▲ Nascondi testo estratto'}
                    </Text>
                  </Pressable>

                  {!isCollapsed && (
                    <View style={localStyles.pageBlocksList}>
                      {group.blocks.map((block) => (
                        <View key={block.id} style={localStyles.rawBlockItem}>
                          <Text style={localStyles.rawBlockHeader}>
                            {block.page ? `${block.label} · pagina ${block.page}` : block.label}
                          </Text>
                          <Text style={localStyles.rawBlockText}>{block.text}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

function buildStyles(C: typeof import('@formazione/civis-ui/src/tema').C, dark: boolean) {
  const txt = dark ? C.text : colors.navy;
  const muted = dark ? C.textMuted : colors.muted;
  const body = dark ? C.lightText : colors.ink;
  const line = dark ? C.border : colors.line;
  const teal = dark ? C.teal : colors.teal;
  const pale = dark ? 'rgba(34,211,238,0.14)' : colors.pale;
  const paleBorder = dark ? 'rgba(34,211,238,0.35)' : '#cde4e0';
  return StyleSheet.create({
    container: { gap: 16, marginVertical: 4 },
    header: { gap: 12 },
    headerTextCol: { gap: 4 },
    mainTitle: { fontSize: 16, fontWeight: '700', color: txt },
    summarySubtitle: { fontSize: 13, color: muted },
    tabSwitcher: {
      flexDirection: 'row', backgroundColor: dark ? C.surfaceDark : '#edf2f7',
      borderRadius: 10, padding: 3, gap: 4,
    },
    tabButton: {
      flex: 1, paddingVertical: 8, paddingHorizontal: 12,
      borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    },
    tabButtonActive: {
      backgroundColor: dark ? C.surfaceHover : 'white', shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2,
    },
    tabButtonText: { fontSize: 13, fontWeight: '600', color: muted },
    tabButtonTextActive: { color: txt },
    sectionsList: { gap: 12 },
    emptyText: { fontSize: 14, color: muted, fontStyle: 'italic', paddingVertical: 10 },
    sectionCard: {
      backgroundColor: dark ? C.surface : '#f8fafc', borderRadius: 12,
      borderWidth: 1, borderColor: line, padding: 14, gap: 8,
    },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: txt, flex: 1 },
    pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    structuralBadge: {
      backgroundColor: dark ? 'rgba(34,211,238,0.14)' : '#e6fffa',
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
      borderWidth: 1, borderColor: dark ? 'rgba(34,211,238,0.35)' : '#b2f5ea',
    },
    structuralBadgeText: { color: dark ? C.teal : '#234e52', fontSize: 12, fontWeight: '700' },
    pageBadge: {
      backgroundColor: pale, paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 6, borderWidth: 1, borderColor: paleBorder,
    },
    pageBadgeText: { color: teal, fontSize: 12, fontWeight: '700' },
    infoPill: { backgroundColor: dark ? C.surfaceHover : '#edf2f7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    infoPillText: { color: dark ? C.textMuted : colors.navy, fontSize: 12, fontWeight: '500' },
    sectionPreview: { fontSize: 14, lineHeight: 20, color: body },
    expandBtn: { alignSelf: 'flex-start', paddingVertical: 4, marginTop: 2 },
    expandBtnText: { fontSize: 12, fontWeight: '600', color: teal },
    expandedBlocksList: { gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: line },
    subBlockItem: {
      backgroundColor: dark ? C.surfaceDark : 'white', borderRadius: 8,
      borderWidth: 1, borderColor: line, padding: 10, gap: 4,
    },
    subBlockLabel: { fontSize: 12, fontWeight: '700', color: txt },
    subBlockText: { fontSize: 13, lineHeight: 18, color: body },
    sourcesList: { gap: 12 },
    pageCard: {
      backgroundColor: dark ? C.surface : '#ffffff', borderRadius: 12, borderWidth: 1,
      borderColor: line, padding: 14, gap: 10, shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
    },
    pageCardExcluded: {
      backgroundColor: dark ? C.surfaceDark : '#fafbfc',
      borderColor: dark ? C.borderSubtle : '#e2e8f0', opacity: 0.75,
    },
    pageCardHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      gap: 8, flexWrap: 'wrap',
    },
    pageCardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    pageBadgeMain: {
      backgroundColor: pale, paddingHorizontal: 10, paddingVertical: 4,
      borderRadius: 8, borderWidth: 1, borderColor: paleBorder,
    },
    pageBadgeMainText: { color: teal, fontSize: 13, fontWeight: '700' },
    pageBadgeExcluded: { backgroundColor: dark ? C.surfaceHover : '#edf2f7', borderColor: dark ? C.border : '#cbd5e0' },
    pageBadgeExcludedText: { color: muted },
    pageMetaText: { fontSize: 13, color: muted, fontWeight: '500' },
    pageToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pageToggleLabel: { fontSize: 12, fontWeight: '600', color: teal },
    pageToggleLabelExcluded: { color: dark ? C.textDim : '#a0aec0' },
    excludedNoticeBadge: {
      backgroundColor: dark ? C.yellowBg : '#fffaf0', paddingHorizontal: 10, paddingVertical: 5,
      borderRadius: 6, borderWidth: 1, borderColor: dark ? C.yellow : '#feebc8',
    },
    excludedNoticeText: { fontSize: 12, color: dark ? C.yellow : '#c05621', fontWeight: '600' },
    figureNoticeBadge: {
      backgroundColor: dark ? 'rgba(59,130,246,0.16)' : '#ebf8ff', paddingHorizontal: 10,
      paddingVertical: 5, borderRadius: 6, borderWidth: 1,
      borderColor: dark ? 'rgba(96,165,250,0.35)' : '#bee3f8',
    },
    figureNoticeText: { fontSize: 12, color: dark ? '#93c5fd' : '#2b6cb0', fontWeight: '600' },
    pageWarningsBox: {
      backgroundColor: dark ? C.redBg : '#fff5f5', padding: 8, borderRadius: 6,
      borderWidth: 1, borderColor: dark ? C.red : '#fed7d7', gap: 4,
    },
    pageWarningItemText: { fontSize: 12, color: dark ? C.redText : '#c53030' },
    toggleBlocksBtn: { alignSelf: 'flex-start', paddingVertical: 3 },
    toggleBlocksBtnText: { fontSize: 12, fontWeight: '600', color: teal },
    pageBlocksList: {
      gap: 10, marginTop: 4, paddingTop: 8,
      borderTopWidth: 1, borderTopColor: dark ? C.border : '#edf2f7',
    },
    rawBlockItem: {
      gap: 6, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: dark ? C.border : '#edf2f7',
    },
    rawBlockHeader: { fontSize: 14, fontWeight: '700', color: txt },
    rawBlockText: { fontSize: 14, lineHeight: 20, color: body },
  });
}
