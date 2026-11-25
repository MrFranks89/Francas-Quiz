import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Share,
  Platform,
} from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { type ReferralCardProps } from './types';
import { REFERRAL_MICROCOPY } from './microcopy';
import { buildReferralShareUrl } from '../../api/referral';
import { RedeemCodeModal } from './RedeemCodeModal';
import { ReferralHistoryList } from './ReferralHistoryList';

export function ReferralCard({
  stato,
  loading = false,
  onRefresh,
  onOpenRedeemModal,
}: ReferralCardProps) {
  const C = usePalette(), { dark } = useTheme();
  const primaryColor = C.indigoLight || '#4f46e5';

  const [copied, setCopied] = useState(false);
  const [internalRedeemOpen, setInternalRedeemOpen] = useState(false);

  const codice = stato?.codice || 'REF-CARICAMENTO';
  const shareUrl = buildReferralShareUrl(codice);

  const handleCopyCode = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(codice);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleShare = async () => {
    const message = REFERRAL_MICROCOPY['referral.shareMessage'](codice, shareUrl);
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(shareUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        }
      } else {
        await Share.share({
          message,
          url: shareUrl,
          title: 'Invito a Civis Formazione',
        });
      }
    } catch {
      // Ignore dismiss
    }
  };

  const openRedeem = onOpenRedeemModal || (() => setInternalRedeemOpen(true));

  return (
    <View style={[styles.card, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
      {/* HEADER */}
      <View style={styles.topRow}>
        <View style={styles.iconBox}>
          <Text style={styles.icon}>🎁</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{REFERRAL_MICROCOPY['referral.badge']}</Text>
        </View>
      </View>

      <Text style={[styles.title, dark && { color: C.text }]}>{REFERRAL_MICROCOPY['referral.title']}</Text>
      <Text style={[styles.subtitle, dark && { color: C.textMuted }]}>
        {REFERRAL_MICROCOPY['referral.subtitle']}
      </Text>

      {/* BOX CODICE PERSONALE */}
      <View style={[styles.codeBox, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}>
        <Text style={[styles.codeLabel, dark && { color: C.textMuted }]}>
          {REFERRAL_MICROCOPY['referral.codeLabel']}
        </Text>
        <View style={styles.codeRow}>
          <Text style={[styles.codeText, { color: primaryColor }]}>{codice}</Text>
          <TouchableOpacity
            style={[styles.copyBtn, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}
            onPress={handleCopyCode}
            accessibilityRole="button"
            accessibilityLabel="Copia codice referral"
          >
            <Text style={[styles.copyBtnText, dark && { color: C.text }]}>
              {copied ? '✓ Copiato!' : REFERRAL_MICROCOPY['referral.ctaCopy']}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* AZIONI CONDIVIDI & RISCATTO */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.shareBtn, { backgroundColor: primaryColor }]}
          onPress={handleShare}
          accessibilityRole="button"
          accessibilityLabel="Condividi link invito"
        >
          <Text style={styles.shareBtnText}>{REFERRAL_MICROCOPY['referral.ctaShare']}</Text>
        </TouchableOpacity>
      </View>

      {/* STATISTICHE ACCREDITI */}
      <View style={styles.statsSection}>
        <Text style={[styles.sectionTitle, dark && { color: C.text }]}>
          {REFERRAL_MICROCOPY['referral.statsTitle']}
        </Text>
        <View style={styles.statsGrid}>
          <View style={[styles.statBox, dark && { backgroundColor: C.surfaceHover }]}>
            <Text style={[styles.statNumber, { color: primaryColor }]}>
              {stato?.registrazioni_accreditate ?? 0}
            </Text>
            <Text style={[styles.statLabel, dark && { color: C.textMuted }]}>
              {REFERRAL_MICROCOPY['referral.statAccredited']}
            </Text>
          </View>
          <View style={[styles.statBox, dark && { backgroundColor: C.surfaceHover }]}>
            <Text style={[styles.statNumber, { color: '#059669' }]}>
              {`+${stato?.corsi_extra_guadagnati ?? 0}`}
            </Text>
            <Text style={[styles.statLabel, dark && { color: C.textMuted }]}>
              {REFERRAL_MICROCOPY['referral.statExtra']}
            </Text>
          </View>
        </View>
        {stato?.tetto_corsi_extra !== null && stato?.tetto_corsi_extra !== undefined && (
          <Text style={[styles.capText, dark && { color: C.textMuted }]}>
            {REFERRAL_MICROCOPY['referral.statCap'](stato.tetto_corsi_extra)}
          </Text>
        )}
      </View>

      {/* ULTIME REGISTRAZIONI */}
      <ReferralHistoryList
        registrazioni={stato?.ultime_registrazioni || []}
        dark={dark}
        C={C}
      />

      {/* LINK PER RISCATTO MANUALE INVITATO */}
      <TouchableOpacity
        style={styles.redeemLinkBtn}
        onPress={openRedeem}
        accessibilityRole="button"
        accessibilityLabel="Riscatta un codice invito ricevuto"
      >
        <Text style={[styles.redeemLinkText, { color: primaryColor }]}>
          {REFERRAL_MICROCOPY['referral.ctaRedeem']}
        </Text>
      </TouchableOpacity>

      {/* MODALE INTERNO RISCATTO (SE NON FORNITO ESTERNAMENTE) */}
      {!onOpenRedeemModal && (
        <RedeemCodeModal
          visible={internalRedeemOpen}
          onClose={() => setInternalRedeemOpen(false)}
          onSuccess={() => {
            if (onRefresh) onRefresh();
          }}
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 22,
  },
  badge: {
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#7e22ce',
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#4b5563',
    marginBottom: 16,
  },
  codeBox: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 14,
    gap: 6,
  },
  codeLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  codeText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  copyBtn: {
    height: 44,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copyBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
  },
  actionRow: {
    marginBottom: 16,
  },
  shareBtn: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  statsSection: {
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
  },
  capText: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'right',
  },
  redeemLinkBtn: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  redeemLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
