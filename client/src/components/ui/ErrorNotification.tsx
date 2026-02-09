/**
 * ErrorNotification - Displays error messages
 */

import { useUIStore } from '../../store';

interface ErrorNotificationProps {
  message: string;
}

export function ErrorNotification({ message }: ErrorNotificationProps) {
  const setErrorMessage = useUIStore((state) => state.setErrorMessage);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="panel px-4 py-3 flex items-center gap-3 border-red-500/50 bg-red-900/90">
        <span className="text-red-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
        <span className="text-white text-sm">{message}</span>
        <button
          onClick={() => setErrorMessage(null)}
          className="text-white/60 hover:text-white ml-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
