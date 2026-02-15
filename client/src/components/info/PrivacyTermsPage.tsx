/**
 * PrivacyTermsPage - Privacy policy and terms of use
 */

import { useSettingsStore } from '../../store';

interface PrivacyTermsPageProps {
  onBack: () => void;
}

export function PrivacyTermsPage({ onBack }: PrivacyTermsPageProps) {
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  return (
    <div className={`min-h-screen p-4 ${isLight ? 'bg-gradient-to-br from-emerald-100 to-emerald-50' : 'bg-gradient-to-br from-emerald-800 to-emerald-950'}`}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <div className="flex items-center justify-between">
            <h1 className={`text-2xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              Privacy & Terms
            </h1>
            <button
              onClick={onBack}
              className={`p-2 rounded-lg ${isLight ? 'hover:bg-emerald-100' : 'hover:bg-emerald-700'}`}
            >
              <svg className={`w-5 h-5 ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Privacy Policy */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <h2 className={`text-lg font-bold mb-3 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
            Privacy Policy
          </h2>
          <ul className={`space-y-3 ${isLight ? 'text-emerald-800' : 'text-emerald-100'}`}>
            <li className="flex gap-2">
              <span className="shrink-0">•</span>
              <span>No user identity or public IPs are logged</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0">•</span>
              <span>Profiles are anonymous — no personal information is collected, stored, or sold</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0">•</span>
              <span>Local storage (settings, preferences) stays entirely on your device</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0">•</span>
              <span>
                The demo is proxied through{' '}
                <a
                  href="https://nobgp.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline ${isLight ? 'text-emerald-600 hover:text-emerald-800' : 'text-emerald-300 hover:text-emerald-100'}`}
                >
                  noBGP
                </a>
                , which does not log user data
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0">•</span>
              <span>
                The game is open source:{' '}
                <a
                  href="https://github.com/davinoishi/Hawaiian-Rummy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline ${isLight ? 'text-emerald-600 hover:text-emerald-800' : 'text-emerald-300 hover:text-emerald-100'}`}
                >
                  github.com/davinoishi/Hawaiian-Rummy
                </a>
              </span>
            </li>
          </ul>
        </div>

        {/* Terms of Use */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <h2 className={`text-lg font-bold mb-3 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
            Terms of Use
          </h2>
          <ul className={`space-y-3 ${isLight ? 'text-emerald-800' : 'text-emerald-100'}`}>
            <li className="flex gap-2">
              <span className="shrink-0">•</span>
              <span>Software is provided "as is" without warranty of any kind</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0">•</span>
              <span>Use at your own risk — developers are not liable for any damages</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0">•</span>
              <span>No guarantee of availability or uptime for the demo instance</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0">•</span>
              <span>The source code is available under open source license</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0">•</span>
              <span>By using this application you agree to these terms</span>
            </li>
          </ul>
        </div>

        {/* Footer */}
        <div className="text-center">
          <button onClick={onBack} className="btn-primary">
            Back to Game
          </button>
        </div>
      </div>
    </div>
  );
}
