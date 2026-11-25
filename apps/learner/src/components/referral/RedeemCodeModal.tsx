import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { type RedeemCodeModalProps } from './types';
import { REFERRAL_MICROCOPY } from './microcopy';
import { redeemReferralCode, normalizeReferralCode } from '../../api/referral';
import { type RiscattoEsito } from '@formazione/contracts';

export function RedeemCodeModal({
  visible,
  onClose,
  onSuccess,
}: RedeemCodeModalProps) {
  const C = usePalette(), { dark } = useTheme();
  const primaryColor = C.indigoLight || '#4f46e5';

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultOutcome, setResultOutcome] = useState<RiscattoEsito | null>(null);

  const handleClose = () => {
    setCode('');
    setError(null);
    setResultOutcome(null);
    setLoading(false);
    onClose();
  };

  const handleRedeem = async () => {
    const clean = normalizeReferralCode(code);
    if (!clean) {
      setError('Inserisci un codice invito.');
      return;
    }
    setLoading(true);
    setError(null);
    setResultOutcome(null);
    try {
      const res = await redeemReferralCode(clean);
      setResultOutcome(res.esito);
      if (res.accreditato) {
        onSuccess(res);
      }
    } catch (e: any) {
      setError(e.message || REFERRAL_MICROCOPY['redeem.outcome.UNKNOWN']);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={[styles.container, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
          <View style={styles.header}>
            <Text style={[styles.headerTitle, dark && { color: C.text }]}>
              {REFERRAL_MICROCOPY['redeem.modalTitle']}
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Chiudi modale riscatto codice"
              style={styles.closeBtn}
            >
              <Text style={[styles.closeBtnText, dark && { color: C.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {resultOutcome ? (
              <View style={[styles.outcomeBox, resultOutcome === 'ACCREDITATO' ? styles.successBox : styles.warningBox]}>
                <Text style={styles.outcomeIcon}>
                  {resultOutcome === 'ACCREDITATO' ? '🎉' : 'ℹ️'}
                </Text>
                <Text style={styles.outcomeText}>
                  {resultOutcome === 'ACCREDITATO' && REFERRAL_MICROCOPY['redeem.outcome.ACCREDITATO']}
                  {resultOutcome === 'GIA_ACCREDITATO' && REFERRAL_MICROCOPY['redeem.outcome.GIA_ACCREDITATO']}
                  {resultOutcome === 'AUTO_INVITO' && REFERRAL_MICROCOPY['redeem.outcome.AUTO_INVITO']}
                  {resultOutcome === 'EMAIL_GIA_REGISTRATA' && REFERRAL_MICROCOPY['redeem.outcome.EMAIL_GIA_REGISTRATA']}
                  {resultOutcome === 'FINESTRA_SCADUTA' && REFERRAL_MICROCOPY['redeem.outcome.FINESTRA_SCADUTA']}
                  {resultOutcome === 'TETTO_RAGGIUNTO' && REFERRAL_MICROCOPY['redeem.outcome.TETTO_RAGGIUNTO']}
                </Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: primaryColor, marginTop: 14 }]}
                  onPress={handleClose}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryBtnText}>OK</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.formSection}>
                <Text style={[styles.hint, dark && { color: C.textMuted }]}>
                  {REFERRAL_MICROCOPY['redeem.hint']}
                </Text>

                <TextInput
                  style={[styles.input, dark && { backgroundColor: C.surfaceHover, color: C.text, borderColor: C.border }]}
                  placeholder={REFERRAL_MICROCOPY['redeem.inputPlaceholder']}
                  placeholderTextColor={dark ? '#888' : '#aaa'}
                  value={code}
                  onChangeText={(val) => {
                    setCode(val.toUpperCase());
                    if (error) setError(null);
                  }}
                  autoCapitalize="characters"
                  maxLength={12}
                  accessibilityLabel="Campo codice referral da riscattare"
                />

                {error && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
                  onPress={handleRedeem}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel="Invia codice referral"
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>{REFERRAL_MICROCOPY['redeem.ctaSubmit']}</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
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
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
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
  },
  formSection: {
    gap: 14,
  },
  hint: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 18,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 16,
    letterSpacing: 1.5,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: '#f9fafb',
    color: '#111827',
  },
  primaryBtn: {
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
  errorBox: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    color: '#991b1b',
    fontSize: 13,
  },
  outcomeBox: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  successBox: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  warningBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  outcomeIcon: {
    fontSize: 36,
  },
  outcomeText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    color: '#1f2937',
  },
});
