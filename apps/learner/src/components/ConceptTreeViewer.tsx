import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { ConceptNode, ConceptTree } from '@formazione/contracts';
import { colors } from './ui';
import { ConceptNodeDetailCard } from './ConceptNodeDetailCard';

function formatSourceRef(ref: string): string {
  const trimmed = ref.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed;
  return `[${trimmed}]`;
}

export function ConceptTreeViewer({
  tree,
  onPracticeVoice,
  onPracticeQuiz,
}: {
  tree: ConceptTree;
  onPracticeVoice?: (node: ConceptNode) => void;
  onPracticeQuiz?: (node: ConceptNode) => void;
}) {
  const C = usePalette(), { dark } = useTheme();
  const localStyles = useMemo(() => buildTreeStyles(C, dark), [C, dark]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<{ branchId: string; branchTitle: string; node: ConceptNode } | null>(null);

  useEffect(() => {
    setCollapsed({});
    setSelected(null);
  }, [tree.id, tree.rootTitle]);

  const branchCount = tree.branches.length;
  const allCollapsed =
    branchCount > 0 && tree.branches.every((branch) => Boolean(collapsed[branch.id]));

  function toggleBranch(branchId: string) {
    const willCollapse = !collapsed[branchId];
    setCollapsed((prev) => ({ ...prev, [branchId]: !prev[branchId] }));
    if (willCollapse && selected?.branchId === branchId) {
      setSelected(null);
    }
  }

  function toggleAll() {
    if (allCollapsed) {
      setCollapsed({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const branch of tree.branches) {
      next[branch.id] = true;
    }
    setCollapsed(next);
    setSelected(null);
  }

  return (
    <View style={localStyles.wrapper}>
      <View style={localStyles.rootHeader}>
        <View style={localStyles.rootCard}>
          <View style={localStyles.rootBadge}>
            <Text style={localStyles.rootBadgeText}>TEMA CENTRALE</Text>
          </View>
          <Text style={localStyles.rootTitle}>{tree.rootTitle}</Text>
          {!!tree.summary && <Text style={localStyles.rootSummary}>{tree.summary}</Text>}
          <View style={localStyles.rootMetaRow}>
            <Text style={localStyles.rootMetaText}>
              {`${branchCount} ${branchCount === 1 ? 'ramo concettuale' : 'rami concettuali'}`}
            </Text>
            {branchCount > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={allCollapsed ? 'Espandi tutti i rami' : 'Comprimi tutti i rami'}
                onPress={toggleAll}
                style={({ pressed }) => [localStyles.toggleAllBtn, pressed && { opacity: 0.75 }]}
              >
                <Text style={localStyles.toggleAllText}>
                  {allCollapsed ? '▼ Espandi tutti' : '▲ Comprimi tutti'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
        <View style={localStyles.trunkConnector} />
      </View>

      <View style={localStyles.branchesGrid}>
        {tree.branches.map((branch, branchIndex) => {
          const isCollapsed = !!collapsed[branch.id];
          const nodeCount = branch.nodes.length;
          return (
            <View key={branch.id} style={localStyles.branchColumn}>
              <View style={localStyles.branchConnectorTop} />
              <View style={localStyles.branchCard}>
                <View style={localStyles.branchHeader}>
                  <View style={localStyles.branchTitleWrap}>
                    <View style={localStyles.branchIndexBadge}>
                      <Text style={localStyles.branchIndexText}>{branchIndex + 1}</Text>
                    </View>
                    <Text style={localStyles.branchTitle}>{branch.title}</Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      isCollapsed
                        ? `Espandi ramo ${branch.title}`
                        : `Comprimi ramo ${branch.title}`
                    }
                    onPress={() => toggleBranch(branch.id)}
                    style={({ pressed }) => [
                      localStyles.branchToggleBtn,
                      pressed && { opacity: 0.75 },
                    ]}
                  >
                    <Text style={localStyles.branchToggleText}>
                      {isCollapsed ? `▼ Espandi (${nodeCount})` : '▲ Comprimi'}
                    </Text>
                  </Pressable>
                </View>

                {!!branch.description && (
                  <Text style={localStyles.branchDescription}>{branch.description}</Text>
                )}

                {!isCollapsed && (
                  <View style={localStyles.nodesList}>
                    {branch.nodes.map((node) => {
                      const isNodeSelected = selected?.node.id === node.id;
                      return (
                        <Pressable
                          key={node.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Apri scheda concetto ${node.title}`}
                          accessibilityState={{ selected: isNodeSelected }}
                          onPress={() =>
                            setSelected(
                              isNodeSelected
                                ? null
                                : { branchId: branch.id, branchTitle: branch.title, node },
                            )
                          }
                          style={({ pressed }) => [
                            localStyles.nodeCard,
                            isNodeSelected && localStyles.nodeCardSelected,
                            pressed && { opacity: 0.85 },
                          ]}
                        >
                          <Text style={localStyles.nodeTitle}>{node.title}</Text>
                          <Text style={localStyles.nodeSummary}>{node.summary}</Text>
                          {node.sourceRefs.length > 0 && (
                            <View style={localStyles.refsRow}>
                              {node.sourceRefs.map((ref, refIndex) => (
                                <View key={`${node.id}-ref-${refIndex}`} style={localStyles.refBadge}>
                                  <Text style={localStyles.refBadgeText}>{formatSourceRef(ref)}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {selected && (
        <ConceptNodeDetailCard
          branchTitle={selected.branchTitle}
          node={selected.node}
          formatSourceRef={formatSourceRef}
          onClose={() => setSelected(null)}
          onPracticeVoice={onPracticeVoice}
          onPracticeQuiz={onPracticeQuiz}
        />
      )}
    </View>
  );
}

function buildTreeStyles(C: typeof import('@formazione/civis-ui/src/tema').C, dark: boolean) {
  const txt = dark ? C.text : colors.navy;
  const body = dark ? C.lightText : colors.ink;
  const muted = dark ? C.textMuted : colors.muted;
  const line = dark ? C.border : colors.line;
  const teal = dark ? C.teal : colors.teal;
  const connector = dark ? 'rgba(34,211,238,0.45)' : '#a5f3fc';
  return StyleSheet.create({
    wrapper: { gap: 0, paddingTop: 4 },
    rootHeader: { alignItems: 'center' },
    rootCard: {
      width: '100%',
      backgroundColor: dark ? 'rgba(34,211,238,0.1)' : '#f0fdfa',
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: dark ? 'rgba(34,211,238,0.4)' : '#99f6e4',
      padding: 16,
      alignItems: 'center',
      gap: 8,
    },
    rootBadge: {
      backgroundColor: dark ? 'rgba(34,211,238,0.2)' : '#cffafe',
      borderWidth: 1,
      borderColor: dark ? C.teal : '#67e8f9',
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    rootBadgeText: {
      color: dark ? C.teal : '#0e7490',
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    rootTitle: { fontSize: 18, fontWeight: '700', color: txt, textAlign: 'center' },
    rootSummary: { fontSize: 13, lineHeight: 19, color: body, textAlign: 'center' },
    rootMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      flexWrap: 'wrap',
      marginTop: 2,
    },
    rootMetaText: { fontSize: 12, fontWeight: '600', color: muted },
    toggleAllBtn: {
      backgroundColor: dark ? C.surfaceDark : 'white',
      borderWidth: 1,
      borderColor: connector,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    toggleAllText: { fontSize: 12, fontWeight: '700', color: dark ? C.teal : '#0e7490' },
    trunkConnector: { width: 2, height: 16, backgroundColor: connector },
    branchesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      borderTopWidth: 2,
      borderTopColor: connector,
      paddingTop: 0,
    },
    branchColumn: { flex: 1, minWidth: 250, alignItems: 'center' },
    branchConnectorTop: { width: 2, height: 12, backgroundColor: connector },
    branchCard: {
      width: '100%',
      backgroundColor: dark ? C.surface : '#f8fafc',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: line,
      padding: 14,
      gap: 10,
    },
    branchHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      flexWrap: 'wrap',
    },
    branchTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    branchIndexBadge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.teal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    branchIndexText: { color: 'white', fontSize: 12, fontWeight: '700' },
    branchTitle: { fontSize: 15, fontWeight: '700', color: txt, flex: 1 },
    branchToggleBtn: {
      backgroundColor: dark ? C.surfaceHover : colors.pale,
      borderWidth: 1,
      borderColor: dark ? C.border : '#cde4e0',
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    branchToggleText: { fontSize: 12, fontWeight: '700', color: teal },
    branchDescription: { fontSize: 13, lineHeight: 18, color: muted },
    nodesList: {
      gap: 10,
      paddingLeft: 10,
      borderLeftWidth: 2,
      borderLeftColor: dark ? C.border : '#cde4e0',
    },
    nodeCard: {
      backgroundColor: dark ? C.surfaceDark : 'white',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: line,
      padding: 12,
      gap: 6,
    },
    nodeCardSelected: {
      borderWidth: 2,
      borderColor: teal,
      backgroundColor: dark ? 'rgba(34,211,238,0.12)' : '#f0fdfa',
    },
    nodeTitle: { fontSize: 14, fontWeight: '700', color: txt },
    nodeSummary: { fontSize: 13, lineHeight: 19, color: body },
    refsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
    refBadge: {
      backgroundColor: dark ? 'rgba(56,189,248,0.16)' : '#e0f2fe',
      borderWidth: 1,
      borderColor: dark ? 'rgba(56,189,248,0.35)' : '#bae6fd',
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    refBadgeText: { fontSize: 11, fontWeight: '700', color: dark ? '#7dd3fc' : '#0369a1' },
  });
}
