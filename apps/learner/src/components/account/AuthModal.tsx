import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { type AuthModalProps, type AuthMode } from './types';
import { ACCOUNT_MICROCOPY } from './microcopy';
import {
  WelcomeView,
  LoginView,
  RegisterView,
  VerifyEmailView,
  ResetPasswordView,
} from './AuthViews';
import { signInWithEmail, signUpWithEmail, requestPasswordReset, getMe } from '../../api/account';

export function AuthModal({
  visible,
  onClose,
  onAuthSuccess,
  initialMode = 'welcome',
  initialReferralCode = '',
}: AuthModalProps) {
  const C = usePalette(), { dark } = useTheme();
  const primaryColor = C.indigoLight || '#4f46e5';

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nomeVisualizzato, setNomeVisualizzato] = useState('');
  const [referralCode, setReferralCode] = useState(initialReferralCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  const resetForm = () => {
    setError(null);
    setLoading(false);
    setResetSuccess(false);
  };

  const switchMode = (newMode: AuthMode) => {
    resetForm();
    setMode(newMode);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Inserisci sia email che password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(email.trim(), password);
      const user = await getMe();
      onAuthSuccess(user);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Errore durante l’accesso.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email.trim() || !password) {
      setError('Inserisci email e password.');
      return;
    }
    if (password.length < 6) {
      setError('La password deve contenere almeno 6 caratteri.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await signUpWithEmail(email.trim(), password, {
        nome_visualizzato: nomeVisualizzato.trim() || undefined,
        referral_code: referralCode.trim() || undefined,
      });
      if (res.session) {
        const user = await getMe();
        onAuthSuccess(user);
        onClose();
      } else {
        switchMode('verify_email');
      }
    } catch (e: any) {
      setError(e.message || 'Errore durante la registrazione.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setError('Inserisci la tua email.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setResetSuccess(true);
    } catch (e: any) {
      setError(e.message || 'Errore durante l’invio del reset.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={[styles.container, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
          <View style={styles.header}>
            <Text style={[styles.headerTitle, dark && { color: C.text }]}>
              {mode === 'welcome' && ACCOUNT_MICROCOPY['auth.welcome.title']}
              {mode === 'login' && ACCOUNT_MICROCOPY['auth.login.title']}
              {mode === 'register' && ACCOUNT_MICROCOPY['auth.register.title']}
              {mode === 'verify_email' && ACCOUNT_MICROCOPY['auth.verify.title']}
              {mode === 'reset_password' && ACCOUNT_MICROCOPY['auth.reset.title']}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Chiudi modale autenticazione"
              style={styles.closeBtn}
            >
              <Text style={[styles.closeBtnText, dark && { color: C.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.bodyScroll} keyboardShouldPersistTaps="handled">
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {mode === 'welcome' && (
              <WelcomeView
                dark={dark}
                C={C}
                primaryColor={primaryColor}
                onSwitchMode={switchMode}
              />
            )}

            {mode === 'login' && (
              <LoginView
                dark={dark}
                C={C}
                primaryColor={primaryColor}
                email={email}
                setEmail={setEmail}
                password={password}
                setPassword={setPassword}
                loading={loading}
                onLogin={handleLogin}
                onSwitchMode={switchMode}
              />
            )}

            {mode === 'register' && (
              <RegisterView
                dark={dark}
                C={C}
                primaryColor={primaryColor}
                nomeVisualizzato={nomeVisualizzato}
                setNomeVisualizzato={setNomeVisualizzato}
                email={email}
                setEmail={setEmail}
                password={password}
                setPassword={setPassword}
                referralCode={referralCode}
                setReferralCode={setReferralCode}
                loading={loading}
                onRegister={handleRegister}
                onSwitchMode={switchMode}
              />
            )}

            {mode === 'verify_email' && (
              <VerifyEmailView
                dark={dark}
                C={C}
                primaryColor={primaryColor}
                onSwitchMode={switchMode}
              />
            )}

            {mode === 'reset_password' && (
              <ResetPasswordView
                dark={dark}
                C={C}
                primaryColor={primaryColor}
                email={email}
                setEmail={setEmail}
                loading={loading}
                resetSuccess={resetSuccess}
                onResetPassword={handleResetPassword}
                onSwitchMode={switchMode}
              />
            )}
          </ScrollView>
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
    maxWidth: 440,
    maxHeight: '90%',
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
  bodyScroll: {
    padding: 20,
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#991b1b',
    fontSize: 13,
  },
});
