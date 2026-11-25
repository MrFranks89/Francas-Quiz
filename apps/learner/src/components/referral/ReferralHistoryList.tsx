import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type RegistrazioneVista } from '@formazione/contracts';
import { REFERRAL_MICROCOPY } from './microcopy';

interface ReferralHistoryListProps {
  registrazioni: RegistrazioneVista[];
  dark: boolean;
  C: any;
}

export function ReferralHistoryList({
  registrazioni,
  dark,
  C,
}: ReferralHistoryListProps) {
  return (
    <View style={styles.historySection}>
      <Text style={[styles.sectionTitle, dark && { color: C.text }]}>
        {REFERRAL_MICROCOPY['referral.historyTitle']}
      </Text>
      {!registrazioni || registrazioni.length === 0 ? (
        <Text style={[styles.emptyHistoryText, dark && { color: C.textMuted }]}>
          {REFERRAL_MICROCOPY['referral.historyEmpty']}
        </Text>
      ) : (
        <View style={styles.historyList}>
          {registrazioni.map((reg, idx) => (
            <View
              key={`${reg.data}-${idx}`}
              style={[styles.historyItem, dark && { borderBottomColor: C.border }]}
            >
              <View style={styles.historyAvatar}>
                <Text style={styles.avatarText}>{reg.nome_o_iniziali.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.historyInfo}>
                <Text style={[styles.historyName, dark && { color: C.text }]}>
                  {reg.nome_o_iniziali}
                </Text>
                <Text style={[styles.historyDate, dark && { color: C.textMuted }]}>
                  {new Date(reg.data).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.creditedBadge}>+1 Corso</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  historySection: {
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  emptyHistoryText: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  historyList: {
    gap: 8,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  historyAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4338ca',
  },
  historyInfo: {
    flex: 1,
  },
  historyName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
  },
  historyDate: {
    fontSize: 11,
    color: '#6b7280',
  },
  creditedBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    backgroundColor: '#d1fae5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
});
