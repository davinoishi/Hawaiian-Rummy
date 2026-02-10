/**
 * useOnlineStatus - Hook for detecting online/offline status
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

export interface OnlineStatus {
  isOnline: boolean;
  wasOffline: boolean; // True if we were offline at some point (for sync purposes)
  isForceOffline: boolean; // True if offline mode forced via URL param
}

/**
 * Check if offline mode is forced via URL parameter
 */
function isOfflineModeForced(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('offline') === 'true';
}

export function useOnlineStatus(): OnlineStatus {
  // Check if offline mode is forced via URL (computed once)
  const isForceOffline = useMemo(() => isOfflineModeForced(), []);

  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState(false);

  const handleOnline = useCallback(() => {
    console.log('[Online] Connection restored');
    setBrowserOnline(true);
  }, []);

  const handleOffline = useCallback(() => {
    console.log('[Online] Connection lost');
    setBrowserOnline(false);
    setWasOffline(true);
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  // isOnline is false if browser is offline OR if offline mode is forced
  const isOnline = browserOnline && !isForceOffline;

  return { isOnline, wasOffline, isForceOffline };
}

/**
 * Check if we should use offline mode
 * - Explicitly requested via URL param
 * - Or browser is offline
 */
export function shouldUseOfflineMode(): boolean {
  if (typeof window === 'undefined') return false;

  // Check URL parameter
  if (isOfflineModeForced()) return true;

  // Check browser online status
  return !navigator.onLine;
}
