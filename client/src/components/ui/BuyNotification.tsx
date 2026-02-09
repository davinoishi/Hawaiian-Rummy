/**
 * BuyNotification - Displays buy request notifications
 */

interface BuyNotificationProps {
  notification: {
    type: 'granted' | 'denied' | 'info';
    message: string;
  };
}

export function BuyNotification({ notification }: BuyNotificationProps) {
  const bgColor = {
    granted: 'bg-green-600/90 border-green-400/50',
    denied: 'bg-red-600/90 border-red-400/50',
    info: 'bg-blue-600/90 border-blue-400/50'
  }[notification.type];

  const icon = {
    granted: (
      <svg className="w-5 h-5 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    denied: (
      <svg className="w-5 h-5 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }[notification.type];

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className={`panel px-4 py-3 flex items-center gap-3 ${bgColor}`}>
        {icon}
        <span className="text-white text-sm font-medium">{notification.message}</span>
      </div>
    </div>
  );
}
