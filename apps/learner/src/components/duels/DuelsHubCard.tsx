import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { type DuelsHubCardProps } from './types';
import { DUELS_MICROCOPY } from './microcopy';
import { type StatoDuello, type DuelloVista } from '@formazione/contracts';

type FilterTab = 'all' | 'in_attesa' | 'aperto' | 'completato';

export function DuelsHubCard({
  duelli,
  loading = false,
  onRefresh,
  onCreateDuel,
  onEnterInviteCode,
  onOpenDuel,
}: DuelsHubCardProps) {
  const C = usePalette(), { dark } = useTheme();
  const primaryColor = C.indigoLight || '#4f46e5';

  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const filtered = duelli.filter((d) => {
    if (activeTab === 'all') return true;
    return d.stato === activeTab;
  });

  const getStatusBadge = (stato: StatoDuello) => {
    switch (stato) {
      case 'in_attesa':
        return { text: 'In Attesa', bg: '#fef3c7', color: '#92400e' };
      case 'aperto':
        return { text: 'Aperto', bg: '#dbeafe', color: '#1e40af' };
      case 'completato':
        return { text: 'Completato', bg: '#d1fae5', color: '#065f46' };
      case 'scaduto':
        return { text: 'Scaduto', bg: '#fee2e2', color: '#991b1b' };
      case 'annullato':
        return { text: 'Annullato', bg: '#f3f4f6', color: '#6b7280' };
    }
  };

  return (
    <View style={[styles.card, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
      {/* HEADER CON BOTTONI AZIONE */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.icon}>⚔️</Text>
          <Text style={[styles.title, dark && { color: C.text }]}>{DUELS_MICROCOPY['hub.title']}</Text>
        </View>
        <View style={styles.topActions}>
          {onCreateDuel && (
            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: primaryColor }]}
              onPress={onCreateDuel}
              accessibilityRole="button"
              accessibilityLabel="Crea una nuova sfida duello"
            >
              <Text style={styles.primaryActionText}>{DUELS_MICROCOPY['hub.ctaNew']}</Text>
            </TouchableOpacity>
          )}
          {onEnterInviteCode && (
            <TouchableOpacity
              style={[styles.secondaryActionBtn, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}
              onPress={onEnterInviteCode}
              accessibilityRole="button"
              accessibilityLabel="Inserisci un codice duello per unirti"
            >
              <Text style={[styles.secondaryActionText, dark && { color: C.text }]}>
                {DUELS_MICROCOPY['hub.ctaJoin']}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* FILTRI TABS */}
      <View style={styles.tabBar}>
        {(['all', 'in_attesa', 'aperto', 'completato'] as FilterTab[]).map((tab) => {
          const isActive = activeTab === tab;
          const label =
            tab === 'all'
              ? DUELS_MICROCOPY['hub.filterAll']
              : tab === 'in_attesa'
                ? DUELS_MICROCOPY['hub.filterPending']
                : tab === 'aperto'
                  ? DUELS_MICROCOPY['hub.filterActive']
                  : DUELS_MICROCOPY['hub.filterCompleted'];

          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabBtn,
                isActive && { borderBottomColor: primaryColor, borderBottomWidth: 2 },
              ]}
              onPress={() => setActiveTab(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  isActive ? { color: primaryColor, fontWeight: '700' } : dark ? { color: C.textMuted } : { color: '#6b7280' },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* LISTA DEI DUELLI */}
      {filtered.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>🥊</Text>
          <Text style={[styles.emptyText, dark && { color: C.textMuted }]}>
            {DUELS_MICROCOPY['hub.empty']}
          </Text>
        </View>
      ) : (
        <View style={styles.duelsList}>
          {filtered.map((duello) => {
            const badge = getStatusBadge(duello.stato);
            return (
              <TouchableOpacity
                key={duello.duello_id}
                style={[
                  styles.duelItem,
                  dark && { backgroundColor: C.surfaceHover, borderColor: C.border },
                ]}
                onPress={() => onOpenDuel && onOpenDuel(duello)}
                accessibilityRole="button"
                accessibilityLabel={`Apri duello su ${duello.titolo_corso}`}
              >
                <View style={styles.duelTopRow}>
                  <Text style={[styles.courseTitle, dark && { color: C.text }]} numberOfLines={1}>
                    {duello.titolo_corso}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: badge.color }]}>{badge.text}</Text>
                  </View>
                </View>

                <View style={styles.vsRow}>
                  <Text style={[styles.vsText, dark && { color: C.textMuted }]}>
                    {DUELS_MICROCOPY['hub.vsLabel'](duello.creatore_nome, duello.avversario_nome)}
                  </Text>
                </View>

                <View style={styles.duelMetaRow}>
                  <Text style={[styles.metaText, dark && { color: C.textMuted }]}>
                    {DUELS_MICROCOPY['hub.questionsCount'](duello.n_domande)}
                  </Text>
                  <Text style={[styles.metaText, dark && { color: C.textMuted }]}>
                    {DUELS_MICROCOPY['hub.expiresIn'](duello.scade_il)}
                  </Text>
                </View>

                {duello.codice_invito && (
                  <View style={styles.codeRow}>
                    <Text style={styles.codeLabel}>Codice invito:</Text>
                    <Text style={[styles.codeValue, { color: primaryColor }]}>{duello.codice_invito}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
  },
  header: {
    gap: 12,
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 22,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  topActions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryActionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryActionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  secondaryActionText: {
    color: '#1f2937',
    fontSize: 13,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: 16,
  },
  tabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  duelsList: {
    gap: 12,
  },
  duelItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 6,
  },
  duelTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  courseTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  vsRow: {
    marginVertical: 2,
  },
  vsText: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '500',
  },
  duelMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
    color: '#6b7280',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    backgroundColor: '#ffffff',
    padding: 6,
    borderRadius: 6,
  },
  codeLabel: {
    fontSize: 11,
    color: '#6b7280',
  },
  codeValue: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
