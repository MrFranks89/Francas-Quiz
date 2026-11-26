import { navigate, initialNavigation } from './navigation';
import { CourseSchema } from '@formazione/contracts';
import sample from '../../../../packages/contracts/fixtures/sample-course.json';
it('keeps server draft available when switching to demo and preserves publication status', () => {
  const draft = {
    id: 'draft-1',
    revision: 2,
    status: 'published' as const,
    course: CourseSchema.parse(sample),
  };
  const editor = navigate(initialNavigation, { type: 'draft', draft });
  expect(editor.selected?.kind).toBe('published');
  const demo = navigate(editor, { type: 'demo' });
  expect(demo.selected).toBeNull();
  expect(demo.draft).toBe(draft);
  expect(navigate(demo, { type: 'draft', draft }).screen).toBe('editor');
});
it('Impostazioni è una schermata che conserva la bozza e torna ai materiali', () => {
  const draft = {
    id: 'draft-1',
    revision: 1,
    status: 'draft' as const,
    course: CourseSchema.parse(sample),
  };
  const impostazioni = navigate(navigate(initialNavigation, { type: 'draft', draft }), {
    type: 'screen',
    screen: 'settings',
  });
  expect(impostazioni.screen).toBe('settings');
  expect(impostazioni.draft).toBe(draft);
  expect(navigate(impostazioni, { type: 'screen', screen: 'import' }).screen).toBe('import');
});
it('Profilo & Rete supporta deep-link a sotto-schede e conserva la bozza', () => {
  const draft = {
    id: 'draft-1',
    revision: 1,
    status: 'draft' as const,
    course: CourseSchema.parse(sample),
  };
  const profile = navigate(navigate(initialNavigation, { type: 'draft', draft }), {
    type: 'profile',
    tab: 'referral',
  });
  expect(profile.screen).toBe('profile');
  expect(profile.profileTab).toBe('referral');
  expect(profile.draft).toBe(draft);
});
it('Giochi è una schermata dedicata accessibile dalla navigazione', () => {
  const giochi = navigate(initialNavigation, { type: 'screen', screen: 'giochi' });
  expect(giochi.screen).toBe('giochi');
});
