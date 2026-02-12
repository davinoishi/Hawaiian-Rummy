/**
 * OnlineStatusIndicator - Shows online/offline status in the UI
 */

import { useOnlineStatus } from '../../hooks';
import { useSettingsStore } from '../../store';

interface OnlineStatusIndicatorProps {
  showOnline?: boolean; // Whether to show indicator when online (default: false)
}

export function OnlineStatusIndicator({ showOnline = false }: OnlineStatusIndicatorProps) {
  const { isOnline } = useOnlineStatus();
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  // Don't show when online unless explicitly requested
  if (isOnline && !showOnline) {
    return null;
  }

  return (
    <div
      className={`
        fixed top-2 left-2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full
        text-xs font-medium shadow-lg transition-all duration-300
        ${isOnline
          ? isLight
            ? 'bg-green-100 text-green-800 border border-green-200'
            : 'bg-green-900/80 text-green-200 border border-green-700'
          : isLight
            ? 'bg-amber-100 text-amber-800 border border-amber-200'
            : 'bg-amber-900/80 text-amber-200 border border-amber-700'
        }
      `}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          isOnline ? 'bg-green-500 animate-pulse' : 'bg-amber-500'
        }`}
      />
      {isOnline ? 'Online' : 'Offline'}
    </div>
  );
}
