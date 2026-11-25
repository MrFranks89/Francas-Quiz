import type { Course } from '@formazione/contracts';
import type { Draft } from '../api/generation';

export type ProfileTab = 'profile' | 'referral' | 'duels';

export type Navigation = {
  screen: 'import' | 'course' | 'editor' | 'settings' | 'profile';
  selected: { course: Course; kind: 'draft' | 'published' | 'imported' | 'practice' } | null;
  draft: Draft | null;
  profileTab?: ProfileTab;
};

export const initialNavigation: Navigation = { screen: 'import', selected: null, draft: null };

export type NavigationAction =
  | { type: 'screen'; screen: Navigation['screen'] }
  | { type: 'profile'; tab?: ProfileTab }
  | { type: 'draft'; draft: Draft }
  | { type: 'imported'; course: Course }
  | { type: 'practice'; course: Course }
  | { type: 'demo' };

export function navigate(state: Navigation, action: NavigationAction): Navigation {
  switch (action.type) {
    case 'screen':
      return { ...state, screen: action.screen };
    case 'profile':
      return { ...state, screen: 'profile', profileTab: action.tab || 'profile' };
    case 'demo':
      return { ...state, screen: 'course', selected: null };
    case 'draft':
      return {
        ...state,
        screen: 'editor',
        draft: action.draft,
        selected: { course: action.draft.course, kind: action.draft.status },
      };
    case 'imported':
      return { ...state, screen: 'course', selected: { course: action.course, kind: 'imported' } };
    case 'practice':
      return { ...state, screen: 'course', selected: { course: action.course, kind: 'practice' } };
  }
}
