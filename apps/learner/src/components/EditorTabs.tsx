import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from './ui';

export interface TabItem {
  id: string;
  label: string;
  badge?: number | string;
}

export function EditorTabs({
  tabs,
  activeTab,
  onSelectTab,
}: {
  tabs: TabItem[];
  activeTab: string;
  onSelectTab: (id: string) => void;
}) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityLabel={`Scheda ${tab.label}`}
              accessibilityState={{ selected: isActive }}
              onPress={() => onSelectTab(tab.id)}
              style={({ pressed }) => [
                styles.tab,
                isActive ? styles.tabActive : styles.tabInactive,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[styles.tabLabel, isActive ? styles.labelActive : styles.labelInactive]}>
                {tab.label}
              </Text>
              {tab.badge !== undefined && (
                <View style={[styles.badge, isActive ? styles.badgeActive : styles.badgeInactive]}>
                  <Text
                    style={[
                      styles.badgeText,
                      isActive ? styles.badgeTextActive : styles.badgeTextInactive,
                    ]}
                  >
                    {tab.badge}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  scrollContent: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingVertical: 2,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  tabInactive: {
    backgroundColor: '#ffffff',
    borderColor: colors.line,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  labelActive: {
    color: '#ffffff',
  },
  labelInactive: {
    color: colors.ink,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
  },
  badgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  badgeInactive: {
    backgroundColor: colors.pale,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: '#ffffff',
  },
  badgeTextInactive: {
    color: colors.teal,
  },
});
