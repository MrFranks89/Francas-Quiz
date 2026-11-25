import { StyleSheet } from 'react-native';
import { colors } from './ui';

export const styles = StyleSheet.create({
  chaptersBox: {
    backgroundColor: '#f0fdfa',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#99f6e4',
    padding: 14,
    gap: 12,
  },
  chaptersTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  chipsContainer: {
    gap: 6,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ccfbf1',
  },
  chipsHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f766e',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ccfbf1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
    maxWidth: '100%',
  },
  chipText: {
    fontSize: 12,
    color: '#0f766e',
    fontWeight: '600',
  },
  chipClose: {
    fontSize: 14,
    color: '#0f766e',
    fontWeight: '700',
  },
  treeList: {
    gap: 6,
  },
  nodeWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 4,
    minHeight: 44,
  },
  nodeRowSelected: {
    backgroundColor: '#e6fffa',
  },
  nodeRowSelectedDark: {
    backgroundColor: '#134e4a',
  },
  expandBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandBtnText: {
    fontSize: 12,
    color: colors.navy,
  },
  expandPlaceholder: {
    width: 44,
  },
  checkTarget: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingRight: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  nodeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.navy,
    flex: 1,
  },
  nodeTitleActive: {
    color: colors.teal,
    fontWeight: '700',
  },
  nodePages: {
    fontSize: 12,
    color: colors.muted,
  },
  childrenContainer: {
    paddingLeft: 34,
    gap: 4,
    marginTop: 4,
    marginBottom: 4,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 8,
    minHeight: 44,
  },
  childTitle: {
    fontSize: 13,
    color: colors.navy,
    flex: 1,
  },
});
