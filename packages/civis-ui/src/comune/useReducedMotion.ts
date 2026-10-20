import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion() {
  // RN 0.85: Libraries/Components/AccessibilityInfo/AccessibilityInfo.d.ts.
  // Default to no motion while the asynchronous preference is loading.
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let alive = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      if (alive) setReduced(value);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (alive && !changed) setReduced(value);
    }).catch(error => console.warn('Cannot read motion preference', error));
    return () => { alive = false; subscription.remove(); };
  }, []);
  return reduced;
}
