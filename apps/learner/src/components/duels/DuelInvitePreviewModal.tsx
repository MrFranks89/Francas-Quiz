import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { type DuelInvitePreviewModalProps } from './types';
import { DUELS_MICROCOPY } from './microcopy';

export function DuelInvitePreviewModal({
  visible,
  inviteData,
  loading = false,
  onClose,
  onAccept,
}: DuelInvitePreviewModalProps) {
  const C = usePalette(), { dark } = useTheme();
  const primaryColor = C.indigoLight || '#4f46e5';

  if (!inviteData) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
          <View style={styles.header}>
            <Text style={[styles.headerTitle, dark && { color: C.text }]}>
              {DUELS_MICROCOPY['invite.title']}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Chiudi anteprima invito"
              style={styles.closeBtn}
            >
              <Text style={[styles.closeBtnText, dark && { color: C.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.iconBox}>
              <Text style={styles.icon}>🎯</Text>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, dark && { color: C.textMuted }]}>
                  {DUELS_MICROCOPY['invite.creatorLabel']}
                </Text>
                <Text style={[styles.infoValue, dark && { color: C.text }]}>
                  {inviteData.creatore_nome}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, dark && { color: C.textMuted }]}>
                  {DUELS_MICROCOPY['invite.courseLabel']}
                </Text>
                <Text style={[styles.infoValue, dark && { color: C.text }]}>
                  {inviteData.titolo_corso}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, dark && { color: C.textMuted }]}>Domande</Text>
                <Text style={[styles.infoValue, dark && { color: C.text }]}>
                  {inviteData.n_domande} domande
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, dark && { color: C.textMuted }]}>Scadenza</Text>
                <Text style={[styles.infoValue, dark && { color: C.text }]}>
                  {new Date(inviteData.scade_il).toLocaleDateString()}
                </Text>
              </View>
            </View>

            <View style={[styles.noticeBox, dark && { backgroundColor: C.surfaceHover }]}>
              <Text style={[styles.noticeText, dark && { color: C.textMuted }]}>
                {DUELS_MICROCOPY['invite.noSolutionsNote']}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
              onPress={() => onAccept(inviteData.duello_id, '')}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Accetta sfida ed entra nel duello"
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryBtnText}>{DUELS_MICROCOPY['invite.ctaAccept']}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 20,
    color: '#6b7280',
    fontWeight: '600',
  },
  body: {
    padding: 20,
    alignItems: 'center',
    gap: 14,
  },
  iconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 30,
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  noticeBox: {
    width: '100%',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 10,
  },
  noticeText: {
    fontSize: 12,
    color: '#4b5563',
    textAlign: 'center',
  },
  primaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
