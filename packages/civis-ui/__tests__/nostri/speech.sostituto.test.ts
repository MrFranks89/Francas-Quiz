/**
 * Test nostro sul sostituto src/speech.ts: l'hook non legge nulla e non
 * cambia stato. Il pulsante che lo userebbe non è disegnato dal lettore
 * (vedi SlideStep.lettore.test.tsx).
 */
import { useSpeech } from '../../src/speech';

test('useSpeech non parla e toggle non ha effetti', () => {
  const { speaking, toggle } = useSpeech();
  expect(speaking).toBe(false);
  expect(() => toggle(['testo'])).not.toThrow();
  expect(useSpeech().speaking).toBe(false);
});
