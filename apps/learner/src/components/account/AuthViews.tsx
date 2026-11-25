import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { ACCOUNT_MICROCOPY } from './microcopy';
import { type AuthMode } from './types';

interface ViewProps {
  dark: boolean;
  C: any;
  primaryColor: string;
}

export function WelcomeView({
  dark,
  C,
  primaryColor,
  onSwitchMode,
}: ViewProps & { onSwitchMode: (mode: AuthMode) => void }) {
  return (
    <View style={styles.viewSection}>
      <Text style={[styles.subtitle, dark && { color: C.textMuted }]}>
        {ACCOUNT_MICROCOPY['auth.welcome.subtitle']}
      </Text>

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
        onPress={() => onSwitchMode('login')}
        accessibilityRole="button"
        accessibilityLabel="Vai al login con email"
      >
        <Text style={styles.primaryBtnText}>{ACCOUNT_MICROCOPY['auth.welcome.ctaLogin']}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondaryBtn, dark && { borderColor: C.border, backgroundColor: C.surfaceHover }]}
        onPress={() => onSwitchMode('register')}
        accessibilityRole="button"
        accessibilityLabel="Vai alla registrazione"
      >
        <Text style={[styles.secondaryBtnText, dark && { color: C.text }]}>
          {ACCOUNT_MICROCOPY['auth.welcome.ctaRegister']}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.hintText, dark && { color: C.textMuted }]}>
        {ACCOUNT_MICROCOPY['auth.welcome.guestNote']}
      </Text>
    </View>
  );
}

export function LoginView({
  dark,
  C,
  primaryColor,
  email,
  setEmail,
  password,
  setPassword,
  loading,
  onLogin,
  onSwitchMode,
}: ViewProps & {
  email: string;
  setEmail: (s: string) => void;
  password: string;
  setPassword: (s: string) => void;
  loading: boolean;
  onLogin: () => void;
  onSwitchMode: (mode: AuthMode) => void;
}) {
  return (
    <View style={styles.viewSection}>
      <TextInput
        style={[styles.input, dark && { backgroundColor: C.surfaceHover, color: C.text, borderColor: C.border }]}
        placeholder={ACCOUNT_MICROCOPY['auth.login.emailPlaceholder']}
        placeholderTextColor={dark ? '#888' : '#aaa'}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        accessibilityLabel="Campo email login"
      />
      <TextInput
        style={[styles.input, dark && { backgroundColor: C.surfaceHover, color: C.text, borderColor: C.border }]}
        placeholder={ACCOUNT_MICROCOPY['auth.login.passwordPlaceholder']}
        placeholderTextColor={dark ? '#888' : '#aaa'}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        accessibilityLabel="Campo password login"
      />

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
        onPress={onLogin}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Effettua il login"
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryBtnText}>{ACCOUNT_MICROCOPY['auth.login.ctaSubmit']}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => onSwitchMode('reset_password')} style={styles.linkBtn} accessibilityRole="button">
        <Text style={[styles.linkBtnText, { color: primaryColor }]}>
          {ACCOUNT_MICROCOPY['auth.login.forgotPassword']}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => onSwitchMode('register')} style={styles.linkBtn} accessibilityRole="button">
        <Text style={[styles.linkBtnText, { color: primaryColor }]}>
          {ACCOUNT_MICROCOPY['auth.login.noAccount']}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export function RegisterView({
  dark,
  C,
  primaryColor,
  nomeVisualizzato,
  setNomeVisualizzato,
  email,
  setEmail,
  password,
  setPassword,
  referralCode,
  setReferralCode,
  loading,
  onRegister,
  onSwitchMode,
}: ViewProps & {
  nomeVisualizzato: string;
  setNomeVisualizzato: (s: string) => void;
  email: string;
  setEmail: (s: string) => void;
  password: string;
  setPassword: (s: string) => void;
  referralCode: string;
  setReferralCode: (s: string) => void;
  loading: boolean;
  onRegister: () => void;
  onSwitchMode: (mode: AuthMode) => void;
}) {
  return (
    <View style={styles.viewSection}>
      <TextInput
        style={[styles.input, dark && { backgroundColor: C.surfaceHover, color: C.text, borderColor: C.border }]}
        placeholder={ACCOUNT_MICROCOPY['auth.register.namePlaceholder']}
        placeholderTextColor={dark ? '#888' : '#aaa'}
        value={nomeVisualizzato}
        onChangeText={setNomeVisualizzato}
        maxLength={40}
        accessibilityLabel="Campo nome visualizzato"
      />
      <TextInput
        style={[styles.input, dark && { backgroundColor: C.surfaceHover, color: C.text, borderColor: C.border }]}
        placeholder={ACCOUNT_MICROCOPY['auth.register.emailPlaceholder']}
        placeholderTextColor={dark ? '#888' : '#aaa'}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        accessibilityLabel="Campo email registrazione"
      />
      <TextInput
        style={[styles.input, dark && { backgroundColor: C.surfaceHover, color: C.text, borderColor: C.border }]}
        placeholder={ACCOUNT_MICROCOPY['auth.register.passwordPlaceholder']}
        placeholderTextColor={dark ? '#888' : '#aaa'}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        accessibilityLabel="Campo password registrazione"
      />
      <TextInput
        style={[styles.input, dark && { backgroundColor: C.surfaceHover, color: C.text, borderColor: C.border }]}
        placeholder={ACCOUNT_MICROCOPY['auth.register.referralPlaceholder']}
        placeholderTextColor={dark ? '#888' : '#aaa'}
        value={referralCode}
        onChangeText={setReferralCode}
        autoCapitalize="characters"
        accessibilityLabel="Campo codice invito referral opzionale"
      />

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
        onPress={onRegister}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Completa registrazione"
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryBtnText}>{ACCOUNT_MICROCOPY['auth.register.ctaSubmit']}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => onSwitchMode('login')} style={styles.linkBtn} accessibilityRole="button">
        <Text style={[styles.linkBtnText, { color: primaryColor }]}>
          {ACCOUNT_MICROCOPY['auth.register.hasAccount']}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export function VerifyEmailView({
  dark,
  C,
  primaryColor,
  onSwitchMode,
}: ViewProps & { onSwitchMode: (mode: AuthMode) => void }) {
  return (
    <View style={styles.viewSection}>
      <Text style={styles.verifyIcon}>✉️</Text>
      <Text style={[styles.subtitle, dark && { color: C.textMuted }]}>
        {ACCOUNT_MICROCOPY['auth.verify.description']}
      </Text>
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
        onPress={() => onSwitchMode('login')}
        accessibilityRole="button"
      >
        <Text style={styles.primaryBtnText}>{ACCOUNT_MICROCOPY['auth.verify.ctaDone']}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function ResetPasswordView({
  dark,
  C,
  primaryColor,
  email,
  setEmail,
  loading,
  resetSuccess,
  onResetPassword,
  onSwitchMode,
}: ViewProps & {
  email: string;
  setEmail: (s: string) => void;
  loading: boolean;
  resetSuccess: boolean;
  onResetPassword: () => void;
  onSwitchMode: (mode: AuthMode) => void;
}) {
  if (resetSuccess) {
    return (
      <View style={styles.viewSection}>
        <View style={styles.successBox}>
          <Text style={styles.successText}>
            Link inviato con successo! Controlla la tua casella di posta per reimpostare la password.
          </Text>
          <TouchableOpacity
            onPress={() => onSwitchMode('login')}
            style={[styles.primaryBtn, { backgroundColor: primaryColor, marginTop: 16 }]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>{ACCOUNT_MICROCOPY['auth.reset.backToLogin']}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.viewSection}>
      <Text style={[styles.subtitle, dark && { color: C.textMuted }]}>
        {ACCOUNT_MICROCOPY['auth.reset.description']}
      </Text>
      <TextInput
        style={[styles.input, dark && { backgroundColor: C.surfaceHover, color: C.text, borderColor: C.border }]}
        placeholder={ACCOUNT_MICROCOPY['auth.login.emailPlaceholder']}
        placeholderTextColor={dark ? '#888' : '#aaa'}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        accessibilityLabel="Campo email recupero password"
      />
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
        onPress={onResetPassword}
        disabled={loading}
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryBtnText}>{ACCOUNT_MICROCOPY['auth.reset.ctaSubmit']}</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onSwitchMode('login')} style={styles.linkBtn} accessibilityRole="button">
        <Text style={[styles.linkBtnText, { color: primaryColor }]}>
          {ACCOUNT_MICROCOPY['auth.reset.backToLogin']}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  viewSection: {
    gap: 14,
  },
  subtitle: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
    marginBottom: 6,
  },
  hintText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    backgroundColor: '#f9fafb',
    color: '#111827',
  },
  primaryBtn: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  secondaryBtnText: {
    color: '#1f2937',
    fontSize: 15,
    fontWeight: '600',
  },
  linkBtn: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  verifyIcon: {
    fontSize: 48,
    textAlign: 'center',
    marginVertical: 12,
  },
  successBox: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  successText: {
    color: '#065f46',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
