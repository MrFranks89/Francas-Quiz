import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { usePalette } from '@formazione/civis-ui/src/ThemeProvider';
import { TESTO } from '@formazione/civis-ui/src/tema';
import { etichettaFonti, type FonteSlide } from '../state/fonti';

/**
 * Fonte leggera sotto la slide (componente nostro). Chiusa è una riga
 * discreta, es. «Fonte: pagina 172», sottolineata a tratteggio come le sigle
 * toccabili di Civis (EmojiText): il segno dice «qui si può toccare» prima
 * che lo si scopra per caso. Al tocco si apre in linea, sotto la riga, un
 * riquadro come la nuvoletta delle sigle (fondo scuro, bordo teal) con
 * etichetta ed estratto di ogni fonte citata; si richiude con lo stesso tocco
 * o con «Chiudi». Niente finestra sopra la lezione: l'estratto può essere
 * lungo (una pagina intera) e scorre dentro il riquadro.
 */
export function SourceNote({
  fonti,
  dimostrativa = false,
}: {
  fonti: FonteSlide[];
  dimostrativa?: boolean;
}) {
  const C = usePalette();
  const [aperta, setAperta] = useState(false);
  if (!fonti.length) return null;
  const etichetta = etichettaFonti(fonti, dimostrativa);
  return (
    <View style={{ marginTop: 14 }}>
      <Pressable
        onPress={() => setAperta((a) => !a)}
        accessibilityRole="button"
        accessibilityLabel={`${etichetta}. ${aperta ? 'Nascondi' : 'Mostra'} l'estratto`}
        accessibilityState={{ expanded: aperta }}
        hitSlop={8}
        style={{ alignSelf: 'flex-start' }}
      >
        <Text
          style={{
            color: C.textDim,
            fontSize: TESTO.minuscolo,
            textDecorationLine: 'underline',
            textDecorationStyle: 'dashed',
            textDecorationColor: C.teal,
          }}
        >
          {etichetta}
          {aperta ? ' · nascondi' : ''}
        </Text>
      </Pressable>
      {aperta && (
        <View
          style={{
            marginTop: 8,
            backgroundColor: C.surfaceDark,
            borderColor: C.teal,
            borderWidth: 1,
            borderRadius: 10,
            paddingVertical: 10,
            paddingHorizontal: 12,
            gap: 10,
          }}
        >
          <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
            {fonti.map((f, i) => (
              <View key={f.id} style={{ marginTop: i ? 12 : 0 }}>
                <Text
                  style={{
                    color: C.text,
                    fontSize: TESTO.minuscolo,
                    fontWeight: '700',
                    marginBottom: 4,
                  }}
                >
                  {f.label}
                </Text>
                <Text
                  style={{ color: C.textMuted, fontSize: TESTO.minuscolo, lineHeight: 19 }}
                >{`“${f.excerpt.trim()}”`}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable
            onPress={() => setAperta(false)}
            accessibilityRole="button"
            accessibilityLabel="Chiudi la fonte"
            hitSlop={8}
            style={{ alignSelf: 'flex-end' }}
          >
            <Text style={{ color: C.teal, fontSize: TESTO.minuscolo, fontWeight: '700' }}>
              Chiudi
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
