import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Course } from '@formazione/contracts';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { TESTO } from '@formazione/civis-ui/src/tema';

type Modulo = Course['modules'][number];
type Slide = Modulo['lessons'][number]['slides'][number];
type SlideConFlag = Slide & {
  isPracticalExample?: boolean;
  is_practical_example?: boolean;
};

export function isEsempioPratico(slide: SlideConFlag): boolean {
  if (slide.isPracticalExample || slide.is_practical_example) return true;
  const testo = `${slide.heading} ${slide.body} ${slide.highlight}`.toLowerCase();
  return testo.includes('esempio') || testo.includes('pratico') || testo.includes('caso di studio');
}

/** Riga/card di un modulo nella lista con stato (completato, in corso, bloccato) e soglia esame. */
export function RigaModulo({
  modulo,
  indice,
  available,
  completed,
  selezionato,
  doneCount,
  disabled,
  onPress,
}: {
  modulo: Modulo;
  indice: number;
  available: boolean;
  completed: boolean;
  selezionato: boolean;
  doneCount: number;
  disabled: boolean;
  onPress: () => void;
}) {
  const C = usePalette();
  const { dark } = useTheme();
  const sogliaPct = modulo.exam
    ? Math.round((modulo.exam.passingScore / modulo.exam.questionIds.length) * 100)
    : null;
  const statoLabel = completed ? 'completato' : available ? 'in corso' : 'bloccato';
  const badgeTesto = completed ? '✓ Completato' : !available ? '🔒 Bloccato' : 'In corso';
  const badgeColore = completed
    ? C.greenText
    : !available
      ? C.textDim
      : dark
        ? C.indigoPale
        : C.indigo;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Modulo ${indice + 1}: ${modulo.title}, ${statoLabel}`}
      accessibilityState={{ selected: selezionato, disabled }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 14,
          borderWidth: selezionato ? 2 : 1,
          borderColor: selezionato ? C.selBorder : C.border,
          backgroundColor: selezionato ? (dark ? 'rgba(79,70,229,0.14)' : '#eef2ff') : C.surface,
          opacity: available ? 1 : 0.72,
        },
        pressed && available && { opacity: 0.85 },
      ]}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          backgroundColor: completed
            ? C.greenBg
            : !available
              ? C.surfaceHover
              : selezionato
                ? C.indigo
                : C.selBg,
          borderColor: completed ? C.green : !available ? C.border : C.selBorder,
        }}
      >
        <Text
          style={{
            fontSize: TESTO.piccolo,
            fontWeight: '800',
            color: completed
              ? C.greenText
              : !available
                ? C.textDim
                : selezionato
                  ? C.white
                  : dark
                    ? C.indigoPale
                    : C.indigo,
          }}
        >
          {completed ? '✓' : !available ? '🔒' : String(indice + 1)}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          style={{
            color: available ? C.text : C.textDim,
            fontSize: TESTO.corpoPiccolo,
            fontWeight: '700',
          }}
        >
          {indice + 1}. {modulo.title}
        </Text>
        <Text style={{ color: C.textDim, fontSize: TESTO.minuto }}>
          {available
            ? `${doneCount}/${modulo.lessons.length} lezioni`
            : 'Completa il modulo precedente per sbloccare'}
          {sogliaPct !== null ? ` · Soglia minima esame: ${sogliaPct}%` : ''}
        </Text>
      </View>
      <View
        style={{
          borderRadius: 99,
          borderWidth: 1,
          paddingHorizontal: 10,
          paddingVertical: 4,
          backgroundColor: completed ? C.greenBg : !available ? C.surface : C.selBg,
          borderColor: completed ? C.green : !available ? C.border : C.selBorder,
        }}
      >
        <Text style={{ fontSize: TESTO.minuto, fontWeight: '700', color: badgeColore }}>
          {badgeTesto}
        </Text>
      </View>
    </Pressable>
  );
}

/** Barra di avanzamento a pillole segmentate stile Socrate, cliccabile per slide. */
export function BarraSlideSegmentata({
  slides,
  currentIndex,
  onSelect,
}: {
  slides: Slide[];
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  const C = usePalette();
  const { dark } = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}
      accessibilityRole="progressbar"
      accessibilityLabel="Avanzamento slide"
      accessibilityValue={{ min: 1, max: slides.length, now: currentIndex + 1 }}
    >
      {slides.map((sItem, i) => {
        const corrente = i === currentIndex;
        const completata = i < currentIndex;
        const bg = corrente
          ? C.indigo
          : completata
            ? dark
              ? 'rgba(129,140,248,0.45)'
              : '#c7d2fe'
            : C.divider;
        return (
          <Pressable
            key={sItem.id}
            onPress={() => onSelect(i)}
            accessibilityRole="button"
            accessibilityLabel={`Slide ${i + 1} di ${slides.length}: ${sItem.heading}`}
            accessibilityState={{ selected: corrente }}
            hitSlop={{ top: 8, bottom: 8 }}
            style={({ pressed }) => [
              { flex: corrente ? 2 : 1, height: 7, borderRadius: 99, backgroundColor: bg },
              pressed && { opacity: 0.75 },
            ]}
          />
        );
      })}
    </View>
  );
}

/** Banner semantico della slide: ambra per Esempio Pratico, azzurro per Concetto Chiave. */
export function BannerTipoSlide({ slide }: { slide: Slide }) {
  const { dark } = useTheme();
  const esempio = isEsempioPratico(slide);
  const bg = esempio
    ? dark
      ? 'rgba(245,158,11,0.14)'
      : '#fef3c7'
    : dark
      ? 'rgba(59,130,246,0.14)'
      : '#eff6ff';
  const border = esempio
    ? dark
      ? 'rgba(245,158,11,0.4)'
      : '#fcd34d'
    : dark
      ? 'rgba(96,165,250,0.35)'
      : '#bfdbfe';
  const text = esempio ? (dark ? '#fbbf24' : '#92400e') : dark ? '#93c5fd' : '#1e40af';
  const badgeBg = esempio
    ? dark
      ? 'rgba(245,158,11,0.22)'
      : '#fde68a'
    : dark
      ? 'rgba(59,130,246,0.24)'
      : '#dbeafe';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        backgroundColor: bg,
        borderColor: border,
        marginBottom: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
        <Text style={{ fontSize: 16 }}>{esempio ? '💡' : '📖'}</Text>
        <Text style={{ color: text, fontSize: TESTO.piccolo, fontWeight: '700', flexShrink: 1 }}>
          {esempio ? 'Applicazione pratica' : 'Approfondimento teorico'}
        </Text>
      </View>
      <View
        style={{
          backgroundColor: badgeBg,
          borderRadius: 99,
          paddingHorizontal: 10,
          paddingVertical: 3,
        }}
      >
        <Text style={{ color: text, fontSize: TESTO.minuto, fontWeight: '700' }}>
          {esempio ? 'Esempio Pratico' : 'Concetto Chiave'}
        </Text>
      </View>
    </View>
  );
}
