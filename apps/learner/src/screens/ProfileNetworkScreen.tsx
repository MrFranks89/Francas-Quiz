import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { type UtenteVista, type ReferralStato, type DuelloVista } from '@formazione/contracts';
import { getMe, patchMe, signOut } from '../api/account';
import { getReferralMe } from '../api/referral';
import { getDuels } from '../api/duels';
import { ProfileCard, AuthModal } from '../components/account';
import { ReferralCard, RedeemCodeModal } from '../components/referral';
import {
  ProDuelGuardCard,
  DuelsHubCard,
  CreateDuelModal,
  DuelInvitePreviewModal,
  DuelPlayModal,
  DuelResultModal,
} from '../components/duels';
import { type ProfileTab } from '../state/navigation';

export interface ProfileNetworkScreenProps {
  initialTab?: ProfileTab;
  onNavigateTab?: (tab: ProfileTab) => void;
}

export function ProfileNetworkScreen({
  initialTab = 'profile',
  onNavigateTab,
}: ProfileNetworkScreenProps) {
  const C = usePalette(),
    { dark } = useTheme();
  const primaryColor = C.indigoLight || '#4f46e5';

  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
  const [utente, setUtente] = useState<UtenteVista | null>(null);
  const [referralStato, setReferralStato] = useState<ReferralStato | null>(null);
  const [duelli, setDuelli] = useState<DuelloVista[]>([]);
  const [loading, setLoading] = useState(false);

  // Modali
  const [showAuth, setShowAuth] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [showCreateDuel, setShowCreateDuel] = useState(false);
  const [invitePreviewCode, setInvitePreviewCode] = useState<string | null>(null);
  const [activePlayDuelId, setActivePlayDuelId] = useState<string | null>(null);
  const [selectedResultDuel, setSelectedResultDuel] = useState<DuelloVista | null>(null);

  // Sincronizza con initialTab se cambia dall'esterno (deep link)
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const ricaricaDati = useCallback(async () => {
    setLoading(true);
    try {
      const u = await getMe().catch(() => null);
      setUtente(u);
      if (u) {
        const ref = await getReferralMe().catch(() => null);
        setReferralStato(ref);
        const d = await getDuels().catch(() => []);
        setDuelli(d);
      } else {
        setReferralStato(null);
        setDuelli([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    ricaricaDati();
  }, [ricaricaDati]);

  const handleTabChange = (t: ProfileTab) => {
    setActiveTab(t);
    onNavigateTab?.(t);
  };

  const isPro = utente?.piano_effettivo === 'pro';

  return (
    <View style={styles.container}>
      {/* Sotto-Schede / Pillole di Navigazione */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          accessibilityRole="tab"
          accessibilityLabel="Scheda Profilo"
          accessibilityState={{ selected: activeTab === 'profile' }}
          style={[
            styles.tabItem,
            activeTab === 'profile' && { backgroundColor: primaryColor },
            dark && activeTab !== 'profile' && { backgroundColor: C.surfaceHover },
          ]}
          onPress={() => handleTabChange('profile')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'profile' ? styles.tabTextActive : dark && { color: C.textMuted },
            ]}
          >
            👤 Profilo
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="tab"
          accessibilityLabel="Scheda Invita Amici"
          accessibilityState={{ selected: activeTab === 'referral' }}
          style={[
            styles.tabItem,
            activeTab === 'referral' && { backgroundColor: primaryColor },
            dark && activeTab !== 'referral' && { backgroundColor: C.surfaceHover },
          ]}
          onPress={() => handleTabChange('referral')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'referral' ? styles.tabTextActive : dark && { color: C.textMuted },
            ]}
          >
            🎁 Invita Amici
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="tab"
          accessibilityLabel="Scheda Duelli Pro"
          accessibilityState={{ selected: activeTab === 'duels' }}
          style={[
            styles.tabItem,
            activeTab === 'duels' && { backgroundColor: primaryColor },
            dark && activeTab !== 'duels' && { backgroundColor: C.surfaceHover },
          ]}
          onPress={() => handleTabChange('duels')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'duels' ? styles.tabTextActive : dark && { color: C.textMuted },
            ]}
          >
            ⚔️ Duelli Pro
          </Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.loaderBox}>
          <ActivityIndicator color={primaryColor} />
        </View>
      )}

      {/* CONTENUTO SCHEDA ATTIVA */}
      <ScrollView contentContainerStyle={styles.content}>
        {activeTab === 'profile' && (
          <ProfileCard
            utente={utente}
            onOpenAuth={() => setShowAuth(true)}
            onUpdateName={async (nuovoNome) => {
              await patchMe({ nome_visualizzato: nuovoNome });
              await ricaricaDati();
            }}
            onLogout={async () => {
              await signOut();
              await ricaricaDati();
            }}
          />
        )}

        {activeTab === 'referral' && (
          <ReferralCard
            stato={
              referralStato || {
                codice: utente?.user_id ? `REF-${utente.user_id.substring(0, 8).toUpperCase()}` : 'REF-LOCAL',
                registrazioni_accreditate: utente?.corsi_extra_referral || 0,
                registrazioni_non_accreditate: 0,
                corsi_extra_guadagnati: utente?.corsi_extra_referral || 0,
                tetto_corsi_extra: 5,
                ultime_registrazioni: [],
              }
            }
            onOpenRedeemModal={() => setShowRedeem(true)}
          />
        )}

        {activeTab === 'duels' && (
          <>
            {!isPro ? (
              <ProDuelGuardCard onUpgradePro={() => setShowAuth(true)} />
            ) : (
              <DuelsHubCard
                duelli={duelli}
                onOpenDuel={(d) => {
                  if (d.stato === 'completato' || d.la_mia_giocata === 'consegnata') {
                    setSelectedResultDuel(d);
                  } else {
                    setActivePlayDuelId(d.duello_id);
                  }
                }}
                onCreateDuel={() => setShowCreateDuel(true)}
                onEnterInviteCode={() => setInvitePreviewCode('')}
              />
            )}
          </>
        )}
      </ScrollView>

      {/* MODALI CONDIVISE */}
      <AuthModal
        visible={showAuth}
        onClose={() => setShowAuth(false)}
        onAuthSuccess={async () => {
          setShowAuth(false);
          await ricaricaDati();
        }}
      />

      <RedeemCodeModal
        visible={showRedeem}
        onClose={() => setShowRedeem(false)}
        onSuccess={async () => {
          setShowRedeem(false);
          await ricaricaDati();
        }}
      />

      <CreateDuelModal
        visible={showCreateDuel}
        courses={[]}
        onClose={() => setShowCreateDuel(false)}
        onDuelCreated={async () => {
          setShowCreateDuel(false);
          await ricaricaDati();
        }}
      />

      <DuelInvitePreviewModal
        visible={invitePreviewCode !== null}
        inviteData={null}
        onClose={() => setInvitePreviewCode(null)}
        onAccept={async () => {
          setInvitePreviewCode(null);
          await ricaricaDati();
        }}
      />

      <DuelPlayModal
        visible={!!activePlayDuelId}
        duelloId={activePlayDuelId || ''}
        titoloCorso="Duello di Studio"
        playData={null}
        onClose={() => setActivePlayDuelId(null)}
        onSubmit={async () => {
          setActivePlayDuelId(null);
          await ricaricaDati();
          return { corrette: 0, tempo_totale_ms: 0, duello_chiuso: false };
        }}
      />

      <DuelResultModal
        visible={!!selectedResultDuel}
        duello={selectedResultDuel}
        resultData={null}
        onClose={() => setSelectedResultDuel(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  loaderBox: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  content: {
    paddingBottom: 24,
    gap: 16,
  },
});
