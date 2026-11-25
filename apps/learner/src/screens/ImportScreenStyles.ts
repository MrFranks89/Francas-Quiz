import { StyleSheet } from 'react-native';
import { colors } from '../components/ui';

export const localStyles = StyleSheet.create({
  stepNavRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  backLink: { paddingVertical: 4 },
  backLinkText: { color: '#2563eb', fontSize: 13, fontWeight: '700' },
  docCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 8,
  },
  docHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  formatBadge: {
    backgroundColor: colors.pale,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cde4e0',
  },
  formatBadgeText: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  docName: { fontSize: 16, fontWeight: '700', color: colors.navy, flex: 1 },
});
