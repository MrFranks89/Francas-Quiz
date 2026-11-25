import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { type UtenteVista } from '@formazione/contracts';
import { ACCOUNT_MICROCOPY } from './microcopy';

interface ProfileDetailsProps {
  utente: UtenteVista;
  dark: boolean;
  C: any;
  primaryColor: string;
  onUpdateName?: (newName: string) => Promise<void>;
  onLogout?: () => void;
  onNavigateToReferral?: () => void;
  onNavigateToDuels?: () => void;
}

export function ProfileDetails({
  utente,
  dark,
  C,
  primaryColor,
  onUpdateName,
  onLogout,
  onNavigateToReferral,
  onNavigateToDuels,
}: ProfileDetailsProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(utente.nome_visualizzato || '');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError('Il nome non può essere vuoto.');
      return;
    }
    if (trimmed.length > 40) {
      setNameError('Il nome non può superare 40 caratteri.');
      return;
    }
    setNameError(null);
    setSavingName(true);
    try {
      if (onUpdateName) {
        await onUpdateName(trimmed);
      }
      setEditingName(false);
    } catch (e: any) {
      setNameError(e.message || 'Errore durante l’aggiornamento.');
    } finally {
      setSavingName(false);
    }
  };

  const usati = utente.corsi_usati ?? 0;
  const limite = utente.limite_effettivo ?? null;
  const percentuale = limite && limite > 0 ? Math.min(100, Math.round((usati / limite) * 100)) : 0;

  return (
    <View style={styles.accountDetails}>
      {/* NOME VISUALIZZATO MODIFICABILE */}
      <View style={styles.fieldRow}>
        <Text style={[styles.fieldLabel, dark && { color: C.textMuted }]}>
          {ACCOUNT_MICROCOPY['profile.nameLabel']}
        </Text>
        {editingName ? (
          <View style={styles.inlineEdit}>
            <TextInput
              style={[styles.editInput, dark && { backgroundColor: C.surfaceHover, color: C.text, borderColor: C.border }]}
              value={nameInput}
              onChangeText={setNameInput}
              maxLength={40}
              accessibilityLabel="Modifica nome visualizzato"
            />
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: primaryColor }]}
              onPress={handleSaveName}
              disabled={savingName}
              accessibilityRole="button"
            >
              {savingName ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.smallBtnText}>Salva</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setNameInput(utente.nome_visualizzato || '');
                setEditingName(false);
                setNameError(null);
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.cancelBtnText, dark && { color: C.textMuted }]}>Annulla</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.nameDisplayRow}>
            <Text style={[styles.fieldValue, dark && { color: C.text }]}>
              {utente.nome_visualizzato || 'Nessun nome impostato'}
            </Text>
            {onUpdateName && (
              <TouchableOpacity
                onPress={() => {
                  setNameInput(utente.nome_visualizzato || '');
                  setEditingName(true);
                }}
                style={styles.editIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Modifica nome"
              >
                <Text style={styles.editIcon}>✏️</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {nameError && <Text style={styles.errorText}>{nameError}</Text>}
      </View>

      {/* EMAIL */}
      {utente.email && (
        <View style={styles.fieldRow}>
          <Text style={[styles.fieldLabel, dark && { color: C.textMuted }]}>Email</Text>
          <Text style={[styles.fieldValue, dark && { color: C.text }]}>{utente.email}</Text>
        </View>
      )}

      {/* AVANZAMENTO CORSI USATI / LIMITE */}
      <View style={styles.progressContainer}>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressLabel, dark && { color: C.text }]}>
            {ACCOUNT_MICROCOPY['profile.coursesUsed'](usati, limite)}
          </Text>
          {limite !== null && (
            <Text style={[styles.progressPercent, dark && { color: C.textMuted }]}>{percentuale}%</Text>
          )}
        </View>
        {limite !== null && (
          <View style={[styles.progressBarTrack, dark && { backgroundColor: C.surfaceHover }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${percentuale}%`,
                  backgroundColor: percentuale >= 100 ? '#ef4444' : primaryColor,
                },
              ]}
            />
          </View>
        )}
        {utente.corsi_extra_referral > 0 && (
          <Text style={[styles.extraCoursesNote, { color: primaryColor }]}>
            {ACCOUNT_MICROCOPY['profile.extraCourses'](utente.corsi_extra_referral)}
          </Text>
        )}
      </View>

      {/* NAVIGAZIONE CONTESTUALE */}
      <View style={styles.shortcutsRow}>
        {onNavigateToReferral && (
          <TouchableOpacity
            style={[styles.shortcutBtn, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}
            onPress={onNavigateToReferral}
            accessibilityRole="button"
            accessibilityLabel="Apri sezione referral"
          >
            <Text style={styles.shortcutIcon}>🎁</Text>
            <Text style={[styles.shortcutText, dark && { color: C.text }]}>Invita Amici</Text>
          </TouchableOpacity>
        )}
        {onNavigateToDuels && (
          <TouchableOpacity
            style={[styles.shortcutBtn, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}
            onPress={onNavigateToDuels}
            accessibilityRole="button"
            accessibilityLabel="Apri sezione duelli"
          >
            <Text style={styles.shortcutIcon}>⚔️</Text>
            <Text style={[styles.shortcutText, dark && { color: C.text }]}>Duelli</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* LOGOUT */}
      {onLogout && (
        <View style={styles.logoutSection}>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={onLogout}
            accessibilityRole="button"
            accessibilityLabel="Disconnetti account"
          >
            <Text style={styles.logoutBtnText}>{ACCOUNT_MICROCOPY['profile.logout']}</Text>
          </TouchableOpacity>
          <Text style={[styles.logoutWarning, dark && { color: C.textMuted }]}>
            {ACCOUNT_MICROCOPY['profile.logoutWarning']}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  accountDetails: {
    gap: 14,
  },
  fieldRow: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  fieldValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editIconBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editIcon: {
    fontSize: 16,
  },
  inlineEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  editInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: '#ffffff',
  },
  smallBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  cancelBtn: {
    height: 44,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#6b7280',
    fontSize: 13,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
    marginTop: 4,
  },
  progressContainer: {
    marginTop: 4,
    gap: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  progressPercent: {
    fontSize: 13,
    color: '#6b7280',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  extraCoursesNote: {
    fontSize: 12,
    fontWeight: '500',
  },
  shortcutsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  shortcutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  shortcutIcon: {
    fontSize: 16,
  },
  shortcutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  logoutSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
  },
  logoutBtn: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutBtnText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
  },
  logoutWarning: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 16,
  },
});
