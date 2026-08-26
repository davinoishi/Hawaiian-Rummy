/**
 * useHaptics - Hook for vibration feedback on mobile devices
 */

import { useCallback, useState } from 'react';
import { useSettingsStore } from '../store/settings-store';

// Vibration patterns (durations in milliseconds)
const PATTERNS = {
  // Short tap feedback
  tap: [10],

  // Card selection
  select: [15],
  deselect: [8],

  // Card interactions
  cardPickup: [20],
  cardDrop: [15, 30, 10],
  cardInvalid: [50, 30, 50],

  // Meld actions
  meldCreate: [20, 40, 20],
  meldError: [100, 50, 100],

  // Game events
  turnStart: [30, 50, 30],
  buyRequest: [20, 30, 20, 30, 20],
  buyGranted: [30, 50, 30, 50, 30],
  buyDenied: [100],

  // Round/Game end
  roundEnd: [50, 100, 50],
  gameWin: [50, 50, 50, 50, 100, 100],
  gameLose: [200, 100, 200],

  // UI feedback
  success: [20, 40, 20],
  warning: [50, 30, 50],
  error: [100, 50, 100, 50, 100]
} as const;

type PatternName = keyof typeof PATTERNS;

// Check if vibration is supported
const isVibrationSupported = (): boolean => {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
};

export function useHaptics() {
  // The preference lives in the settings store, not in local state: this hook
  // is called from a dozen components, and a useState here would give each of
  // them a private copy that a settings toggle could never reach.
  const enabled = useSettingsStore((state) => state.hapticsEnabled);
  const setEnabled = useSettingsStore((state) => state.setHapticsEnabled);
  const toggleEnabled = useSettingsStore((state) => state.toggleHaptics);
  const [supported] = useState(isVibrationSupported);

  // Play a vibration pattern
  const vibrate = useCallback((pattern: PatternName | number | number[]) => {
    if (!enabled || !supported) return;

    try {
      if (typeof pattern === 'string') {
        navigator.vibrate(PATTERNS[pattern]);
      } else {
        navigator.vibrate(pattern);
      }
    } catch (err) {
      // Ignore vibration errors
      console.debug('Vibration failed:', err);
    }
  }, [enabled, supported]);

  // Stop vibration
  const stop = useCallback(() => {
    if (!supported) return;

    try {
      navigator.vibrate(0);
    } catch {
      // Ignore
    }
  }, [supported]);

  // Convenience methods
  const tap = useCallback(() => vibrate('tap'), [vibrate]);
  const select = useCallback(() => vibrate('select'), [vibrate]);
  const deselect = useCallback(() => vibrate('deselect'), [vibrate]);
  const cardPickup = useCallback(() => vibrate('cardPickup'), [vibrate]);
  const cardDrop = useCallback(() => vibrate('cardDrop'), [vibrate]);
  const cardInvalid = useCallback(() => vibrate('cardInvalid'), [vibrate]);
  const meldCreate = useCallback(() => vibrate('meldCreate'), [vibrate]);
  const meldError = useCallback(() => vibrate('meldError'), [vibrate]);
  const turnStart = useCallback(() => vibrate('turnStart'), [vibrate]);
  const buyRequest = useCallback(() => vibrate('buyRequest'), [vibrate]);
  const buyGranted = useCallback(() => vibrate('buyGranted'), [vibrate]);
  const buyDenied = useCallback(() => vibrate('buyDenied'), [vibrate]);
  const roundEnd = useCallback(() => vibrate('roundEnd'), [vibrate]);
  const gameWin = useCallback(() => vibrate('gameWin'), [vibrate]);
  const gameLose = useCallback(() => vibrate('gameLose'), [vibrate]);
  const success = useCallback(() => vibrate('success'), [vibrate]);
  const warning = useCallback(() => vibrate('warning'), [vibrate]);
  const error = useCallback(() => vibrate('error'), [vibrate]);

  return {
    // State
    enabled,
    supported,

    // Controls
    setEnabled,
    toggleEnabled,

    // Generic vibrate
    vibrate,
    stop,

    // Convenience methods
    tap,
    select,
    deselect,
    cardPickup,
    cardDrop,
    cardInvalid,
    meldCreate,
    meldError,
    turnStart,
    buyRequest,
    buyGranted,
    buyDenied,
    roundEnd,
    gameWin,
    gameLose,
    success,
    warning,
    error
  };
}
