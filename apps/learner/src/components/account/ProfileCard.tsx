import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { type ProfileCardProps } from './types';
import { ACCOUNT_MICROCOPY } from './microcopy';
import { ProfileDetails } from './ProfileDetails';

export function ProfileCard({
  utente,
  onUpdateName,
  onOpenAuth,
  onLogout,
  onNavigateToReferral,
  onNavigateToDuels,
  loading = false,
}: ProfileCardProps) {
  const C = usePalette(), { dark } = useTheme();
  const primaryColor = C.indigoLight || '#4f46e5';

  const isLocalMode = !utente || !utente.auth_required || utente.user_id === 'local';
  const isPro = utente?.piano_effettivo === 'pro';

  return (
    <View style={[styles.card, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.titleWithIcon}>
          <Text style={styles.icon}>👤</Text>
          <Text style={[styles.title, dark && { color: C.text }]}>{ACCOUNT_MICROCOPY['profile.title']}</Text>
        </View>
        <View style={[styles.badge, isPro ? styles.proBadge : styles.baseBadge]}>
          <Text style={[styles.badgeText, isPro ? styles.proBadgeText : styles.baseBadgeText]}>
            {isPro ? ACCOUNT_MICROCOPY['profile.planPro'] : ACCOUNT_MICROCOPY['profile.planBase']}
          </Text>
        </View>
      </View>

      {/* STATO MODALITÀ LOCALE O UTENTE AUTENTICATO */}
      {isLocalMode ? (
        <View style={[styles.localBox, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}>
          <Text style={[styles.localTitle, dark && { color: C.text }]}>
            {ACCOUNT_MICROCOPY['profile.localModeBadge']}
          </Text>
          <Text style={[styles.localDesc, dark && { color: C.textMuted }]}>
            {ACCOUNT_MICROCOPY['profile.localModeDesc']}
          </Text>
          {onOpenAuth && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
              onPress={onOpenAuth}
              accessibilityRole="button"
              accessibilityLabel="Collega o crea account"
            >
              <Text style={styles.primaryBtnText}>{ACCOUNT_MICROCOPY['profile.ctaConnect']}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ProfileDetails
          utente={utente}
          dark={dark}
          C={C}
          primaryColor={primaryColor}
          onUpdateName={onUpdateName}
          onLogout={onLogout}
          onNavigateToReferral={onNavigateToReferral}
          onNavigateToDuels={onNavigateToDuels}
        />
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleWithIcon: {
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
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  baseBadge: {
    backgroundColor: '#e5e7eb',
  },
  baseBadgeText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '600',
  },
  proBadge: {
    backgroundColor: '#fef3c7',
  },
  proBadgeText: {
    color: '#92400e',
    fontSize: 12,
    fontWeight: '700',
  },
  localBox: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  localTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  localDesc: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 14,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
