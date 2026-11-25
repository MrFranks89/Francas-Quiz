import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { useStyles } from '@formazione/civis-ui/src/comune/stili';
import { TESTO } from '@formazione/civis-ui/src/tema';
import { Btn } from '@formazione/civis-ui/src/comune/Btn';
import { Card } from '@formazione/civis-ui/src/comune/Card';
import { InterruttoreTema } from '../components/lettore';

/**
 * Schermata impostazioni utente (tema e preferenze di fruizione).
 * La configurazione dei provider AI è demandata all'ambiente server.
 */
export function SettingsScreen({
  onChiudi,
}: {
  primoAvvio?: boolean;
  onChiudi: () => void;
}) {
  const C = usePalette();
  const { dark } = useTheme();
  const s = useStyles();

  return (
    <View style={localStyles.container}>
      <View style={localStyles.header}>
        <Text style={s.eyebrow}>Impostazioni</Text>
        <Text style={[s.slideHeading, { marginBottom: 0 }]}>Preferenze dell'applicazione</Text>
      </View>

      <Card style={{ gap: 14 }}>
        <Text style={s.eyebrow}>Aspetto e tema</Text>
        <Text style={[localStyles.bodyText, { color: C.textMuted }]}>
          Scegli la modalità di visualizzazione preferita per lo studio e la lettura dei contenuti.
        </Text>
        <View style={localStyles.row}>
          <Text style={[localStyles.rowLabel, { color: C.text }]}>Tema dell'interfaccia</Text>
          <InterruttoreTema />
        </View>
      </Card>

      <Card style={{ gap: 14 }}>
        <Text style={s.eyebrow}>Esperienza di studio</Text>
        <Text style={[localStyles.bodyText, { color: C.textMuted }]}>
          La piattaforma ottimizza automaticamente le sessioni di ripasso, il tracciamento dei progressi
          e la sincronizzazione locale del materiale.
        </Text>
        <View style={localStyles.infoBox}>
          <Text style={[localStyles.infoTitle, { color: C.text }]}>Stato archivio locale</Text>
          <Text style={[localStyles.infoDesc, { color: C.textMuted }]}>
            Documenti, estrazioni e percorsi formativi salvati localmente.
          </Text>
        </View>
      </Card>

      <Btn label="Torna ai materiali" primary color={C.indigo} onPress={onChiudi} />
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: {
    gap: 18,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  header: {
    gap: 6,
  },
  bodyText: {
    fontSize: TESTO.corpoPiccolo,
    lineHeight: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowLabel: {
    fontSize: TESTO.corpo,
    fontWeight: '600',
  },
  infoBox: {
    gap: 4,
    paddingTop: 4,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  infoDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
});
