import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { type CourseLimitBannerProps } from './types';
import { ACCOUNT_MICROCOPY } from './microcopy';

export function CourseLimitBanner({
  corsiUsati,
  limiteEffettivo,
  limiteBase,
  corsiExtraReferral,
  piano,
  referralDisponibile,
  onInviteFriend,
  onUpgradePro,
}: CourseLimitBannerProps) {
  const C = usePalette(), { dark } = useTheme();
  const primaryColor = C.indigoLight || '#4f46e5';

  // Se utente Pro con corsi illimitati, nessun blocco
  if (piano === 'pro' && limiteEffettivo === null) {
    return null;
  }

  const isBlocked = limiteEffettivo !== null && corsiUsati >= limiteEffettivo;

  if (isBlocked) {
    return (
      <View
        style={[
          styles.blockedCard,
          dark && { backgroundColor: '#2a1215', borderColor: '#7f1d1d' },
        ]}
        accessibilityRole="alert"
        accessibilityLabel="Limite corsi raggiunto"
      >
        <View style={styles.topRow}>
          <Text style={styles.blockedIcon}>⚠️</Text>
          <View style={styles.blockedTexts}>
            <Text style={[styles.blockedTitle, dark && { color: '#fca5a5' }]}>
              {ACCOUNT_MICROCOPY['limit.blocked.title']}
            </Text>
            <Text style={[styles.blockedDesc, dark && { color: '#fecaca' }]}>
              {referralDisponibile
                ? ACCOUNT_MICROCOPY['limit.blocked.descWithReferral']
                : ACCOUNT_MICROCOPY['limit.blocked.descWithoutReferral']}
            </Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          {referralDisponibile && onInviteFriend && (
            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: primaryColor }]}
              onPress={onInviteFriend}
              accessibilityRole="button"
              accessibilityLabel="Invita un amico per sbloccare un corso extra"
            >
              <Text style={styles.actionBtnText}>{ACCOUNT_MICROCOPY['limit.cta.invite']}</Text>
            </TouchableOpacity>
          )}

          {onUpgradePro && (
            <TouchableOpacity
              style={[
                styles.secondaryActionBtn,
                dark && { backgroundColor: C.surfaceHover, borderColor: C.border },
              ]}
              onPress={onUpgradePro}
              accessibilityRole="button"
              accessibilityLabel="Passa alla versione Pro"
            >
              <Text style={[styles.secondaryActionText, dark && { color: C.text }]}>
                {ACCOUNT_MICROCOPY['limit.cta.upgrade']}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // Banner informativo quando non bloccato
  if (limiteEffettivo !== null) {
    return (
      <View
        style={[
          styles.infoBanner,
          dark && { backgroundColor: C.surfaceDark, borderColor: C.border },
        ]}
      >
        <Text style={styles.infoIcon}>📚</Text>
        <Text style={[styles.infoText, dark && { color: C.text }]}>
          {ACCOUNT_MICROCOPY['limit.banner.info'](corsiUsati, limiteEffettivo)}
        </Text>
        {corsiExtraReferral > 0 && (
          <Text style={[styles.infoExtra, { color: primaryColor }]}>
            (+{corsiExtraReferral} extra)
          </Text>
        )}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  blockedCard: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  blockedIcon: {
    fontSize: 24,
  },
  blockedTexts: {
    flex: 1,
    gap: 4,
  },
  blockedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#9f1239',
  },
  blockedDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: '#881337',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  primaryActionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryActionBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  secondaryActionText: {
    color: '#1f2937',
    fontSize: 14,
    fontWeight: '600',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 8,
  },
  infoIcon: {
    fontSize: 16,
  },
  infoText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  infoExtra: {
    fontSize: 12,
    fontWeight: '700',
  },
});
