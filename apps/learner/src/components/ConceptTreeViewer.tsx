import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ConceptTree } from '@formazione/contracts';
import { colors } from './ui';

function formatSourceRef(ref: string): string {
  const trimmed = ref.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed;
  return `[${trimmed}]`;
}

export function ConceptTreeViewer({ tree }: { tree: ConceptTree }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCollapsed({});
  }, [tree.id, tree.rootTitle]);

  const branchCount = tree.branches.length;
  const allCollapsed =
    branchCount > 0 && tree.branches.every((branch) => Boolean(collapsed[branch.id]));

  function toggleBranch(branchId: string) {
    setCollapsed((prev) => ({ ...prev, [branchId]: !prev[branchId] }));
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
                    {branch.nodes.map((node) => (
                      <View key={node.id} style={localStyles.nodeCard}>
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
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  wrapper: {
    gap: 0,
    paddingTop: 4,
  },
  rootHeader: {
    alignItems: 'center',
  },
  rootCard: {
    width: '100%',
    backgroundColor: '#f0fdfa',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#99f6e4',
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  rootBadge: {
    backgroundColor: '#cffafe',
    borderWidth: 1,
    borderColor: '#67e8f9',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  rootBadgeText: {
    color: '#0e7490',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  rootTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.navy,
    textAlign: 'center',
  },
  rootSummary: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
    textAlign: 'center',
  },
  rootMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  rootMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  toggleAllBtn: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#a5f3fc',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  toggleAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0e7490',
  },
  trunkConnector: {
    width: 2,
    height: 16,
    backgroundColor: '#a5f3fc',
  },
  branchesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    borderTopWidth: 2,
    borderTopColor: '#a5f3fc',
    paddingTop: 0,
  },
  branchColumn: {
    flex: 1,
    minWidth: 250,
    alignItems: 'center',
  },
  branchConnectorTop: {
    width: 2,
    height: 12,
    backgroundColor: '#a5f3fc',
  },
  branchCard: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
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
  branchTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  branchIndexBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchIndexText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  branchTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
    flex: 1,
  },
  branchToggleBtn: {
    backgroundColor: colors.pale,
    borderWidth: 1,
    borderColor: '#cde4e0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  branchToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.teal,
  },
  branchDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  nodesList: {
    gap: 10,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#cde4e0',
  },
  nodeCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 6,
  },
  nodeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  nodeSummary: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  refsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  refBadge: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  refBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1',
  },
});
