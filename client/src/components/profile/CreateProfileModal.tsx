/**
 * CreateProfileModal - Modal for creating a new profile
 */

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useProfileStore, useSettingsStore } from '../../store';

interface CreateProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (profileId: string) => void;
}

export function CreateProfileModal({ isOpen, onClose, onCreated }: CreateProfileModalProps) {
  const { createProfile, isLoading, error, setError } = useProfileStore();
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  const [nickname, setNickname] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdProfileId, setCreatedProfileId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }

    const profile = await createProfile(nickname.trim());
    if (profile) {
      setCreatedProfileId(profile.id);
      setShowSuccess(true);
    }
  }, [nickname, createProfile, setError]);

  const handleCopyLink = useCallback(() => {
    if (createdProfileId) {
      const url = `${window.location.origin}/p/${createdProfileId}`;
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [createdProfileId]);

  const handleContinue = useCallback(() => {
    if (createdProfileId) {
      onCreated(createdProfileId);
    }
  }, [createdProfileId, onCreated]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className={`w-full max-w-md rounded-xl shadow-2xl ${isLight ? 'bg-white' : 'bg-emerald-900'}`}>
        {/* Header */}
        <div className={`p-4 border-b ${isLight ? 'border-emerald-200' : 'border-emerald-700'}`}>
          <div className="flex items-center justify-between">
            <h2 className={`text-xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              {showSuccess ? 'Profile Created!' : 'Create Your Profile'}
            </h2>
            {!showSuccess && (
              <button
                onClick={onClose}
                className={`p-1 rounded ${isLight ? 'hover:bg-emerald-100' : 'hover:bg-emerald-800'}`}
              >
                <svg className={`w-5 h-5 ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {showSuccess && createdProfileId ? (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg ${isLight ? 'bg-emerald-50' : 'bg-emerald-800'}`}>
                <p className={`text-sm mb-2 ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                  Your personal game URL:
                </p>
                <code className={`block p-2 rounded text-sm break-all ${isLight ? 'bg-white border border-emerald-200 text-emerald-900' : 'bg-emerald-700 text-white'}`}>
                  {window.location.origin}/p/{createdProfileId}
                </code>
                <button
                  onClick={handleCopyLink}
                  className={`mt-2 text-sm px-3 py-1 rounded ${isLight ? 'bg-emerald-200 hover:bg-emerald-300 text-emerald-800' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
                >
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>

              <div className={`p-4 rounded-lg border ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-900/30 border-amber-700'}`}>
                <div className="flex items-start gap-2">
                  <svg className={`w-5 h-5 mt-0.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className={`font-medium text-sm ${isLight ? 'text-amber-800' : 'text-amber-200'}`}>
                      Important: Save this link!
                    </p>
                    <p className={`text-xs mt-1 ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>
                      This is your only way to access your profile. There is no recovery if you lose it.
                    </p>
                  </div>
                </div>
              </div>

              <label className={`flex items-center gap-2 text-sm ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                <input type="checkbox" className="rounded" />
                I understand there is no recovery
              </label>

              <button
                onClick={handleContinue}
                className="btn-primary w-full"
              >
                Continue to Game
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className={`text-sm ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                Create a profile to track your stats, appear on leaderboards, and join tournaments.
              </p>

              <div>
                <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-emerald-800' : 'text-emerald-200'}`}>
                  Choose a nickname
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Enter your nickname"
                  maxLength={30}
                  className={`w-full px-4 py-2 rounded-lg border ${isLight ? 'bg-white border-emerald-300 text-emerald-900 placeholder-emerald-400' : 'bg-emerald-800 border-emerald-600 text-white placeholder-emerald-400'} focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
                <p className={`text-xs mt-1 ${isLight ? 'text-emerald-500' : 'text-emerald-400'}`}>
                  {nickname.length}/30 characters
                </p>
              </div>

              {error && (
                <p className="text-red-500 text-sm">{error}</p>
              )}

              <button
                onClick={handleCreate}
                disabled={isLoading || !nickname.trim()}
                className="btn-primary w-full"
              >
                {isLoading ? 'Creating...' : 'Create Profile'}
              </button>

              <p className={`text-xs text-center ${isLight ? 'text-emerald-500' : 'text-emerald-400'}`}>
                You can also play as a guest without a profile
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
