import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { type DuelResultModalProps } from './types';
import { DUELS_MICROCOPY } from './microcopy';
import { DuelSolutionsList } from './DuelSolutionsList';

export function DuelResultModal({
  visible,
  duello,
  resultData,
  onClose,
}: DuelResultModalProps) {
  const C = usePalette(), { dark } = useTheme();
  const primaryColor = C.indigoLight || '#4f46e5';

  if (!visible || !duello) return null;

  const esito = resultData?.esito || null;
  const isCompleted = duello.stato === 'completato' && esito !== null;
  const isWaitingOpponent = duello.la_mia_giocata === 'consegnata' && duello.stato === 'aperto';

  const creatoreNome = duello.creatore_nome || 'Creatore';
  const avversarioNome = duello.avversario_nome || 'Avversario';

  const isWinner = esito?.vincitore_id && esito.vincitore_id === (duello.ruolo === 'creatore' ? 'creatore' : 'avversario');
  const isDraw = esito?.motivo === 'PAREGGIO';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
          <View style={styles.header}>
            <Text style={[styles.headerTitle, dark && { color: C.text }]}>
              {DUELS_MICROCOPY['result.title']}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Chiudi risultato duello"
              style={styles.closeBtn}
            >
              <Text style={[styles.closeBtnText, dark && { color: C.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {/* STATO ATTESA AVVERSARIO */}
            {isWaitingOpponent ? (
              <View style={styles.waitingCard}>
                <Text style={styles.waitingIcon}>🚀</Text>
                <Text style={[styles.waitingTitle, dark && { color: C.text }]}>
                  Prova Consegnata con Successo!
                </Text>
                <Text style={[styles.waitingDesc, dark && { color: C.textMuted }]}>
                  {DUELS_MICROCOPY['result.waitingOpponent']}
                </Text>
                {duello.codice_invito && (
                  <View style={[styles.shareBox, dark && { backgroundColor: C.surfaceHover }]}>
                    <Text style={styles.shareBoxLabel}>Condividi il codice con il tuo sfidante:</Text>
                    <Text style={[styles.shareBoxCode, { color: primaryColor }]}>{duello.codice_invito}</Text>
                  </View>
                )}
              </View>
            ) : isCompleted ? (
              <View style={styles.completedSection}>
                {/* BANNER ESITO */}
                <View style={[styles.outcomeBanner, isWinner ? styles.winBanner : isDraw ? styles.drawBanner : styles.defeatBanner]}>
                  <Text style={styles.outcomeIcon}>
                    {isWinner ? '🏆' : isDraw ? '🤝' : '🎖️'}
                  </Text>
                  <Text style={styles.outcomeTitle}>
                    {isWinner
                      ? DUELS_MICROCOPY['result.victory']
                      : isDraw
                        ? DUELS_MICROCOPY['result.draw']
                        : DUELS_MICROCOPY['result.defeat']}
                  </Text>
                  <Text style={styles.outcomeReason}>
                    Motivo: {esito.motivo}
                  </Text>
                </View>

                {/* ACCREDITO XP */}
                <View style={styles.xpBadge}>
                  <Text style={styles.xpText}>
                    {DUELS_MICROCOPY['result.xpEarned'](isWinner ? 50 : isDraw ? 25 : 10)}
                  </Text>
                </View>

                {/* CONFRONTO A DUE COLONNE */}
                <Text style={[styles.comparisonTitle, dark && { color: C.text }]}>
                  Confronto Partecipanti
                </Text>
                <View style={styles.twoColumnGrid}>
                  {/* COLONNA 1: CREATORE */}
                  <View style={[styles.columnCard, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}>
                    <Text style={styles.roleLabel}>Creatore</Text>
                    <Text style={[styles.playerName, dark && { color: C.text }]}>{creatoreNome}</Text>
                    {esito.punteggi && Object.values(esito.punteggi)[0] && (
                      <View style={styles.scoreDetails}>
                        <Text style={[styles.scoreValue, { color: primaryColor }]}>
                          {`${Object.values(esito.punteggi)[0].corrette} corrette`}
                        </Text>
                        <Text style={[styles.timeValue, dark && { color: C.textMuted }]}>
                          {`${Math.round(Object.values(esito.punteggi)[0].tempo_totale_ms / 1000)} s`}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* COLONNA 2: AVVERSARIO */}
                  <View style={[styles.columnCard, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}>
                    <Text style={styles.roleLabel}>Avversario</Text>
                    <Text style={[styles.playerName, dark && { color: C.text }]}>{avversarioNome}</Text>
                    {esito.punteggi && Object.values(esito.punteggi)[1] && (
                      <View style={styles.scoreDetails}>
                        <Text style={[styles.scoreValue, { color: primaryColor }]}>
                          {`${Object.values(esito.punteggi)[1].corrette} corrette`}
                        </Text>
                        <Text style={[styles.timeValue, dark && { color: C.textMuted }]}>
                          {`${Math.round(Object.values(esito.punteggi)[1].tempo_totale_ms / 1000)} s`}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* SOLUZIONI E SPIEGAZIONI (SE DISPONIBILI) */}
                <DuelSolutionsList
                  soluzioni={resultData?.soluzioni || []}
                  dark={dark}
                  C={C}
                />
              </View>
            ) : (
              <View style={styles.pendingSection}>
                <Text style={styles.pendingText}>
                  Stato del duello: {duello.stato}. La prova sarà completata appena entrambi i partecipanti avranno consegnato.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>Chiudi</Text>
            </TouchableOpacity>
          </ScrollView>
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
    maxWidth: 460,
    maxHeight: '90%',
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
    gap: 16,
  },
  waitingCard: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  waitingIcon: {
    fontSize: 44,
  },
  waitingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  waitingDesc: {
    fontSize: 13,
    color: '#4b5563',
    textAlign: 'center',
    lineHeight: 18,
  },
  shareBox: {
    width: '100%',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  shareBoxLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  shareBoxCode: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
  },
  completedSection: {
    gap: 14,
  },
  outcomeBanner: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  winBanner: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  drawBanner: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  defeatBanner: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  outcomeIcon: {
    fontSize: 36,
  },
  outcomeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  outcomeReason: {
    fontSize: 12,
    color: '#4b5563',
  },
  xpBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  xpText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400e',
  },
  comparisonTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginTop: 4,
  },
  twoColumnGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  columnCard: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    gap: 4,
  },
  roleLabel: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  playerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  scoreDetails: {
    alignItems: 'center',
    marginTop: 6,
    gap: 2,
  },
  scoreValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  timeValue: {
    fontSize: 12,
    color: '#6b7280',
  },
  pendingSection: {
    padding: 16,
    alignItems: 'center',
  },
  pendingText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
  primaryBtn: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
