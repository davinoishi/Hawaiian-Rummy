/**
 * SettingsPanel - Settings modal for audio and theme preferences
 */

import { createPortal } from 'react-dom';
import { useSettingsStore, type ThemeMode } from '../../store';
import { useAudio } from '../../hooks';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const {
    soundEnabled,
    soundVolume,
    themeMode,
    resolvedTheme,
    setSoundEnabled,
    setSoundVolume,
    setThemeMode
  } = useSettingsStore();

  const { playClick } = useAudio();

  const isLight = resolvedTheme === 'light';

  const handleThemeChange = (mode: ThemeMode) => {
    playClick();
    setThemeMode(mode);
  };

  const handleSoundToggle = () => {
    setSoundEnabled(!soundEnabled);
    // Play click after enabling sound
    if (!soundEnabled) {
      setTimeout(() => playClick(), 50);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSoundVolume(parseFloat(e.target.value));
  };

  const handleClose = () => {
    playClick();
    onClose();
  };

  if (!isOpen) return null;

  // Use portal to render at document body level to avoid stacking context issues
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Panel */}
      <div className="relative panel p-6 w-full max-w-sm animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className={`text-xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>Settings</h2>
          <button
            onClick={handleClose}
            className={`${isLight ? 'text-emerald-700 hover:text-emerald-900' : 'text-emerald-300 hover:text-white'} transition-colors`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sound Settings */}
        <div className="mb-6">
          <h3 className={`text-sm font-medium ${isLight ? 'text-emerald-800' : 'text-emerald-200'} mb-3`}>Audio</h3>

          {/* Sound toggle */}
          <div className="flex items-center justify-between mb-4">
            <span className={isLight ? 'text-emerald-900' : 'text-white'}>Sound Effects</span>
            <button
              onClick={handleSoundToggle}
              className={`
                relative w-12 h-6 rounded-full transition-colors
                ${soundEnabled ? 'bg-emerald-500' : 'bg-gray-600'}
              `}
            >
              <span
                className={`
                  absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform
                  ${soundEnabled ? 'translate-x-6' : 'translate-x-0'}
                `}
              />
            </button>
          </div>

          {/* Volume slider */}
          <div className="flex items-center gap-3">
            <svg className={`w-5 h-5 ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={soundVolume}
              onChange={handleVolumeChange}
              disabled={!soundEnabled}
              className={`
                flex-1 h-2 rounded-full appearance-none cursor-pointer
                ${soundEnabled
                  ? (isLight ? 'bg-emerald-200' : 'bg-emerald-700')
                  : 'bg-emerald-400 opacity-50'}
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-emerald-500
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:w-4
                [&::-moz-range-thumb]:h-4
                [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-emerald-500
                [&::-moz-range-thumb]:border-none
                [&::-moz-range-thumb]:cursor-pointer
              `}
            />
            <span className={`text-sm ${isLight ? 'text-emerald-700' : 'text-emerald-300'} w-8 text-right`}>
              {Math.round(soundVolume * 100)}%
            </span>
          </div>
        </div>

        {/* Theme Settings */}
        <div className="mb-6">
          <h3 className={`text-sm font-medium ${isLight ? 'text-emerald-800' : 'text-emerald-200'} mb-3`}>Theme</h3>

          <div className="grid grid-cols-3 gap-2">
            {(['light', 'dark', 'auto'] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => handleThemeChange(mode)}
                className={`
                  py-2 px-3 rounded-lg text-sm font-medium transition-all
                  ${themeMode === mode
                    ? 'bg-emerald-500 text-white'
                    : isLight
                      ? 'bg-emerald-200 text-emerald-800 hover:bg-emerald-300'
                      : 'bg-emerald-700/50 text-emerald-200 hover:bg-emerald-700'}
                `}
              >
                {mode === 'light' && (
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    Light
                  </span>
                )}
                {mode === 'dark' && (
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                    Dark
                  </span>
                )}
                {mode === 'auto' && (
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Auto
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className={`text-xs ${isLight ? 'text-emerald-600' : 'text-emerald-400/60'} mt-2`}>
            {themeMode === 'auto' ? 'Follows your system preference' : `Using ${themeMode} theme`}
          </p>
        </div>

        {/* Keyboard Shortcuts Hint */}
        <div>
          <p className={`text-xs ${isLight ? 'text-emerald-600' : 'text-emerald-400/60'}`}>
            Press <kbd className={`px-1 py-0.5 ${isLight ? 'bg-emerald-200' : 'bg-emerald-700/50'} rounded text-xs`}>H</kbd> or <kbd className={`px-1 py-0.5 ${isLight ? 'bg-emerald-200' : 'bg-emerald-700/50'} rounded text-xs`}>?</kbd> for keyboard shortcuts
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
