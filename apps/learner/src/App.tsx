import React, { useCallback, useEffect, useReducer, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  Platform,
} from 'react-native';
import * as Picker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { TESTO } from '@formazione/civis-ui/src/tema';
import { Button, Card, colors, useUiStyles } from './components/ui';
import { Avviso, InterruttoreTema } from './components/lettore';
import { TemaIniziale } from './components/TemaIniziale';
import { Guscio, Pannello } from './components/Guscio';
import { CampoTesto } from './components/CampoTesto';
import { useIndietro } from './components/useIndietro';
import { ImportScreen } from './screens/ImportScreen';
import { CourseScreen } from './screens/CourseScreen';
import { EditorScreen } from './screens/EditorScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { leggiImpostazioni } from './api/settings';
import { apriImpostazioniAllAvvio } from './state/impostazioni';
import { navigate, initialNavigation } from './state/navigation';
import { corsoImportato } from './state/lettura';
import { recoverDraft as fetchDraft } from './api/generation';

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <TemaIniziale>
        <Shell />
      </TemaIniziale>
    </SafeAreaProvider>
  );
}

// Importazione ed editor usano ancora components/ui.tsx, con colori chiari
// fissi: il tema unico arriva con il TASK-08 (decisioni 002 e 005).
const FONDO_STRUMENTI = '#f3f7f8';

function NavPillola({
  label,
  attiva = false,
  dark,
  onPress,
}: {
  label: string;
  attiva?: boolean;
  dark: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: attiva }}
      style={({ pressed }) => [
        {
          maxWidth: '100%',
          minHeight: 44,
          justifyContent: 'center',
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: 99,
          borderWidth: 1,
          borderColor: attiva
            ? dark
              ? '#60a5fa'
              : '#4338ca'
            : dark
              ? 'rgba(255,255,255,0.14)'
              : '#cbd5e1',
          backgroundColor: attiva
            ? dark
              ? '#2563eb'
              : '#4f46e5'
            : dark
              ? 'rgba(255,255,255,0.06)'
              : '#ffffff',
        },
        pressed && { opacity: 0.82 },
      ]}
    >
      <Text
        style={{
          flexShrink: 1,
          color: attiva ? '#ffffff' : dark ? '#cbd5e1' : '#334155',
          fontSize: TESTO.piccolo,
          fontWeight: attiva ? '700' : '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Shell() {
  const C = usePalette(),
    { dark } = useTheme(),
    ui = useUiStyles();
  const [{ screen, selected, draft }, dispatch] = useReducer(navigate, initialNavigation);
  const { width } = useWindowDimensions();
  const [error, setError] = useState(''),
    [draftId, setDraftId] = useState(''),
    [loading, setLoading] = useState(false),
    [primoAvvio, setPrimoAvvio] = useState(false);
  // Senza fornitore configurato la prima schermata è Impostazioni (state/impostazioni.ts).
  useEffect(() => {
    let vivo = true;
    leggiImpostazioni()
      .then((stato) => {
        if (vivo && apriImpostazioniAllAvvio(stato)) {
          setPrimoAvvio(true);
          dispatch({ type: 'screen', screen: 'settings' });
        }
      })
      .catch((e) => {
        if (vivo) setError(e instanceof Error ? e.message : 'Server non raggiungibile.');
      });
    return () => {
      vivo = false;
    };
  }, []);
  async function importCourse() {
    try {
      const picked = await Picker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const text =
        Platform.OS === 'web' ? await asset.file!.text() : await new File(asset.uri).text();
      dispatch({ type: 'imported', course: corsoImportato(text) });
      setError('');
    } catch {
      setError(
        'Corso JSON non valido: controlla struttura, fonti e riferimenti prima di importarlo.',
      );
    }
  }
  async function recoverDraft() {
    setLoading(true);
    setError('');
    try {
      if (!/^[a-zA-Z0-9_-]+$/.test(draftId)) throw new Error('ID bozza non valido.');
      dispatch({ type: 'draft', draft: await fetchDraft(draftId) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bozza non recuperabile.');
    } finally {
      setLoading(false);
    }
  }
  const tornaAiMateriali = useCallback(() => dispatch({ type: 'screen', screen: 'import' }), []);
  // Tasto Indietro Android: da qualsiasi schermata si torna ai Materiali.
  useIndietro(screen !== 'import', tornaAiMateriali);
  const piede = (
    <Text style={{ color: C.textDim, fontSize: TESTO.minuscolo }}>
      Prototipo locale · materiali e progressi sul tuo ambiente di sviluppo
    </Text>
  );
  // Sotto 600 px le pillole di navigazione scorrono in orizzontale invece di
  // andare a capo: la testata non si allunga (ordine n. 2, blocco F5).
  const pillole = (
    <>
      <NavPillola
        label="Materiali"
        attiva={screen === 'import'}
        dark={dark}
        onPress={() => dispatch({ type: 'screen', screen: 'import' })}
      />
      <NavPillola
        label="Prova il corso"
        attiva={screen === 'course' && selected === null}
        dark={dark}
        onPress={() => dispatch({ type: 'demo' })}
      />
      <NavPillola label="Importa corso JSON" dark={dark} onPress={importCourse} />
      {draft && (
        <NavPillola
          label="Gestisci bozza"
          attiva={screen === 'editor'}
          dark={dark}
          onPress={() => dispatch({ type: 'draft', draft })}
        />
      )}
      <NavPillola
        label="Impostazioni"
        attiva={screen === 'settings'}
        dark={dark}
        onPress={() => dispatch({ type: 'screen', screen: 'settings' })}
      />
    </>
  );
  // Testata fissa: estetica Socrate (palette slate/blue, badge traslucido e navigazione blu/indaco).
  const testata = (
    <>
      <View
        style={{
          backgroundColor: dark ? '#0f172a' : '#eff6ff',
          borderColor: dark ? 'rgba(96,165,250,0.22)' : '#bfdbfe',
          borderWidth: 1,
          borderRadius: 18,
          paddingVertical: width < 600 ? 12 : 16,
          paddingHorizontal: width < 600 ? 14 : 18,
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View style={{ gap: 6, flexShrink: 1 }}>
            <View
              style={{
                alignSelf: 'flex-start',
                backgroundColor: dark ? 'rgba(59,130,246,0.2)' : 'rgba(37,99,235,0.1)',
                borderColor: dark ? 'rgba(96,165,250,0.35)' : 'rgba(37,99,235,0.28)',
                borderWidth: 1,
                borderRadius: 99,
                paddingHorizontal: 10,
                paddingVertical: 3,
              }}
            >
              <Text
                style={{
                  color: dark ? '#93c5fd' : '#1d4ed8',
                  fontSize: TESTO.minuto,
                  fontWeight: '700',
                }}
              >
                Studio Formazione
              </Text>
            </View>
            <Text
              style={{
                fontSize: TESTO.titoloMedio,
                fontWeight: '800',
                color: dark ? '#f8fafc' : '#0f172a',
              }}
            >
              studio
              <Text style={{ color: dark ? '#38bdf8' : '#2563eb' }}> / formazione</Text>
            </Text>
            <Text style={{ color: dark ? '#94a3b8' : '#475569', fontSize: TESTO.piccolo }}>
              Il sapere aziendale, un passo alla volta.
            </Text>
          </View>
          <InterruttoreTema />
        </View>
        <View style={{ height: 1, backgroundColor: dark ? 'rgba(255,255,255,0.1)' : '#dbeafe' }} />
        {width < 600 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingRight: 16 }}
          >
            {pillole}
          </ScrollView>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{pillole}</View>
        )}
      </View>
      {!!error && <Avviso testo={error} errore />}
    </>
  );
  // Cornice chiara degli strumenti fino al TASK-08.
  const corniceStrumenti = {
    backgroundColor: dark ? C.bg : FONDO_STRUMENTI,
    borderRadius: 20,
    padding: width < 600 ? 12 : 24,
    gap: 28,
  } as const;
  // Importazione ed editor restano montati (nascosti) quando non attivi:
  // il documento estratto, le modifiche e la posizione di scroll non si perdono.
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Guscio sfondo={C.bg} testata={testata}>
        <Pannello attivo={screen === 'import'} persistente piede={piede}>
          <View style={corniceStrumenti}>
            <ImportScreen
              onDraft={(draft) => dispatch({ type: 'draft', draft })}
              onStartPractice={(course) => dispatch({ type: 'practice', course })}
            />
            <Card>
              <Text style={ui.subtitle}>Riprendi una bozza salvata</Text>
              <Text style={ui.muted}>
                Inserisci l’ID restituito dal server. Un corso JSON importato rimane una sola
                anteprima locale.
              </Text>
              <CampoTesto
                accessibilityLabel="ID bozza salvata"
                style={ui.input}
                placeholderTextColor={dark ? C.textVeryDim : colors.muted}
                value={draftId}
                onChangeText={setDraftId}
                autoCapitalize="none"
              />
              <Button
                label="Recupera bozza"
                disabled={loading || !draftId.trim()}
                onPress={recoverDraft}
              />
            </Card>
          </View>
        </Pannello>
        {draft && (
          <Pannello attivo={screen === 'editor'} persistente piede={piede}>
            <View style={corniceStrumenti}>
              <EditorScreen
                key={draft.id}
                draft={draft}
                onChange={(draft) => dispatch({ type: 'draft', draft })}
                onPreview={() => dispatch({ type: 'screen', screen: 'course' })}
              />
            </View>
          </Pannello>
        )}
        <Pannello attivo={screen === 'course'} piede={piede}>
          <CourseScreen
            key={selected ? `${selected.course.id}:${selected.course.version}` : 'demo'}
            currentCourse={selected?.course}
            kind={selected?.kind}
          />
        </Pannello>
        <Pannello attivo={screen === 'settings'} piede={piede}>
          <SettingsScreen primoAvvio={primoAvvio} onChiudi={tornaAiMateriali} />
        </Pannello>
      </Guscio>
    </>
  );
}
