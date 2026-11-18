import React from 'react';
import {
  Text,
  View,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { apiUrl } from '../api/documents';
import { colors } from './ui';

export type PagePreviewPanelProps = {
  documentId: string;
  pages: number[];
  safeIndex: number;
  currentPage: number;
  isValidRange: boolean;
  onSelectIndex: (index: number) => void;
  onClose: () => void;
};

export function PagePreviewPanel({
  documentId,
  pages,
  safeIndex,
  currentPage,
  isValidRange,
  onSelectIndex,
  onClose,
}: PagePreviewPanelProps) {
  const C = usePalette(), { dark } = useTheme();
  const total = pages.length;
  const isFirst = safeIndex <= 0;
  const isLast = safeIndex >= total - 1;

  return (
    <View style={[styles.card, dark && { backgroundColor: C.surface, borderColor: C.border }]}>
      {/* Intestazione anteprima */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, dark && { color: C.text }]}>Anteprima documento</Text>
          <View style={[styles.counterBadge, dark && { backgroundColor: C.surfaceHover }]}>
            <Text style={[styles.counterText, dark && { color: C.teal }]}>
              {safeIndex + 1} di {total}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi anteprima"
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeBtn,
            dark && { backgroundColor: C.surfaceHover },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.closeBtnText, dark && { color: C.textMuted }]}>✕ Chiudi</Text>
        </Pressable>
      </View>

      {!isValidRange && (
        <Text style={[styles.editingNotice, dark && { color: C.orange }]}>
          Intervallo in modifica: visualizzazione dell’ultimo intervallo valido
        </Text>
      )}

      {/* Striscia di selezione rapida pagina */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stripContainer}
      >
        {pages.map((page, idx) => {
          const isActive = idx === safeIndex;
          return (
            <Pressable
              key={page}
              accessibilityRole="button"
              accessibilityLabel={`Vai a pagina ${page}`}
              onPress={() => onSelectIndex(idx)}
              style={({ pressed }) => [
                styles.stripPill,
                dark && { backgroundColor: C.surfaceDark, borderColor: C.border },
                isActive &&
                  (dark
                    ? { backgroundColor: '#0e7490', borderColor: C.teal }
                    : styles.stripPillActive),
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text
                style={[
                  styles.stripPillText,
                  dark && { color: C.text },
                  isActive && styles.stripPillTextActive,
                ]}
              >
                p. {page}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Cornice elegante dell'immagine */}
      <View
        style={[
          styles.imageViewer,
          dark && { backgroundColor: C.surfaceDark, borderColor: C.border },
        ]}
      >
        <View style={styles.imagePageBadge}>
          <Text style={styles.imagePageBadgeText}>Pagina originale {currentPage}</Text>
        </View>
        <Image
          accessibilityLabel={`Anteprima pagina ${currentPage}`}
          source={{ uri: `${apiUrl}/documents/${documentId}/pages/${currentPage}/preview` }}
          style={styles.previewImage}
          resizeMode="contain"
        />
      </View>

      {/* Controlli di navigazione */}
      <View style={styles.navRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pagina precedente"
          disabled={isFirst}
          onPress={() => onSelectIndex(Math.max(0, safeIndex - 1))}
          style={({ pressed }) => [
            styles.navBtn,
            dark && { backgroundColor: C.surfaceHover },
            isFirst && styles.navBtnDisabled,
            pressed && !isFirst && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.navBtnText, dark && { color: C.teal }]}>← Precedente</Text>
        </Pressable>

        <Text style={[styles.navCenterText, dark && { color: C.textMuted }]}>
          Pagina {safeIndex + 1} di {total} (originale {currentPage})
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pagina successiva"
          disabled={isLast}
          onPress={() => onSelectIndex(Math.min(total - 1, safeIndex + 1))}
          style={({ pressed }) => [
            styles.navBtn,
            dark && { backgroundColor: C.surfaceHover },
            isLast && styles.navBtnDisabled,
            pressed && !isLast && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.navBtnText, dark && { color: C.teal }]}>Successiva →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 14,
    shadowColor: '#132c3e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  counterBadge: {
    backgroundColor: colors.pale,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  counterText: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: '700',
  },
  closeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  closeBtnText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  editingNotice: {
    fontSize: 12,
    color: '#9d3a24',
    fontStyle: 'italic',
  },
  stripContainer: {
    gap: 6,
    paddingVertical: 4,
    alignItems: 'center',
  },
  stripPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'white',
  },
  stripPillActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  stripPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
  },
  stripPillTextActive: {
    color: 'white',
  },
  imageViewer: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 8,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imagePageBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(19, 44, 62, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 2,
  },
  imagePageBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  previewImage: {
    width: '100%',
    height: Platform.OS === 'web' ? 420 : 320,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.pale,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.teal,
  },
  navCenterText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
});
