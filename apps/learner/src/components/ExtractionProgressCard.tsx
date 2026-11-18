import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Card, colors } from './ui';

interface ExtractionProgressCardProps {
  engine: 'native' | 'docling';
  pageCount: number | null;
  selectedPagesCount: number;
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getPhaseLabel(engine: 'native' | 'docling', elapsed: number): string {
  if (elapsed < 5) return 'Inizializzazione pipeline';
  if (engine === 'docling' && elapsed < 25) return 'Riconoscimento caratteri e layout';
  return 'Strutturazione blocchi e fonti';
}

export function ExtractionProgressCard({
  engine,
  pageCount,
  selectedPagesCount,
}: ExtractionProgressCardProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [engine]);

  const engineMessage =
    engine === 'native'
      ? 'Estrazione istantanea del testo nativo in corso…'
      : 'Riconoscimento ottico caratteri (OCR) in corso… ~10-15s a pagina';

  const pagesSummary =
    pageCount === null
      ? 'Documento intero in elaborazione'
      : `${selectedPagesCount} ${selectedPagesCount === 1 ? 'pagina' : 'pagine'} su ${pageCount}`;

  return (
    <Card>
      <View style={progressStyles.header}>
        <ActivityIndicator
          size="small"
          color={colors.teal}
          accessibilityLabel="Estrazione in corso"
        />
        <View style={progressStyles.headerBody}>
          <Text style={progressStyles.engineText}>{engineMessage}</Text>
          <Text style={progressStyles.pagesText}>{pagesSummary}</Text>
        </View>
        <View style={progressStyles.timerBadge}>
          <Text style={progressStyles.timerText}>
            {`Tempo trascorso: ${formatElapsed(elapsed)}`}
          </Text>
        </View>
      </View>

      <View style={progressStyles.phaseRow}>
        <Text style={progressStyles.phaseText}>
          {`Fase attuale: ${getPhaseLabel(engine, elapsed)}`}
        </Text>
      </View>

      <Text style={progressStyles.reassurance}>
        Processo attivo in background sul tuo computer. Non chiudere la finestra.
      </Text>
    </Card>
  );
}

const progressStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  headerBody: {
    flex: 1,
    minWidth: 180,
    gap: 2,
  },
  engineText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
  },
  pagesText: {
    fontSize: 13,
    color: colors.muted,
  },
  timerBadge: {
    backgroundColor: colors.pale,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cde4e0',
  },
  timerText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.teal,
  },
  phaseRow: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  phaseText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  reassurance: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
});
