/**
 * App - Main application component
 */

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { Routes, Route, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useSocketStore, useGameStore, useUIStore, useSettingsStore, useProfileStore } from './store';
import { useSocketEvents, useAudio, useKeyboardShortcuts, useOnlineStatus } from './hooks';

// Screens
import { JoinScreen } from './components/lobby/JoinScreen';
import { LobbyScreen } from './components/lobby/LobbyScreen';
import { TurnOrderScreen } from './components/game/TurnOrderScreen';
import { GameBoard } from './components/game/GameBoard';
import { RoundSummary } from './components/game/RoundSummary';
import { GameOverScreen } from './components/game/GameOverScreen';

// Profile components
import { ProfilePage, LeaderboardPage, CreateProfileModal, DashboardPage } from './components/profile';

// Global components
import { ErrorNotification } from './components/ui/ErrorNotification';
import { BuyNotification } from './components/ui/BuyNotification';
import { Confetti } from './components/ui/Confetti';
import { TutorialOverlay } from './components/ui/TutorialOverlay';
import { SettingsPanel } from './components/ui/SettingsPanel';
import { HowToPlayModal } from './components/modals/HowToPlayModal';
import { WildcardPositionModal } from './components/modals/WildcardPositionModal';
import { OnlineStatusIndicator } from './components/ui/OnlineStatusIndicator';

// Socket provider wrapper - ensures socket is connected for all routes (or allows offline mode)
function SocketProvider({ children }: { children: ReactNode }) {
  const { connect, connectionStatus } = useSocketStore();
  const { initAudioContext } = useAudio();
  const { isOnline } = useOnlineStatus();
  const initializeFromStorage = useSettingsStore((state) => state.initializeFromStorage);
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  // Set up socket events globally (only matters when online)
  useSocketEvents();

  // Initialize settings from storage on mount
  useEffect(() => {
    initializeFromStorage();
  }, [initializeFromStorage]);

  // Connect to server on mount
  useEffect(() => {
    connect();
  }, [connect]);

  // Initialize audio on first user interaction
  useEffect(() => {
    const handleInteraction = () => {
      initAudioContext();
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
    };

    document.addEventListener('click', handleInteraction);
    document.addEventListener('touchstart', handleInteraction);

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
    };
  }, [initAudioContext]);

  // Show offline message if not connected to internet
  if (!isOnline) {
    return (
      <div className={`flex items-center justify-center min-h-screen ${isLight ? 'bg-emerald-100' : 'bg-gradient-to-br from-emerald-800 to-emerald-950'}`}>
        <div className={`text-center ${isLight ? 'text-emerald-800' : 'text-white'} p-8`}>
          <div className="text-6xl mb-4">📡</div>
          <h2 className="text-2xl font-bold mb-2">No Internet Connection</h2>
          <p className="text-lg opacity-80">Please check your connection and try again.</p>
        </div>
      </div>
    );
  }

  // Show loading while connecting
  if (connectionStatus !== 'connected') {
    return (
      <div className={`flex items-center justify-center min-h-screen ${isLight ? 'bg-emerald-100' : 'bg-gradient-to-br from-emerald-800 to-emerald-950'}`}>
        <div className={`text-center ${isLight ? 'text-emerald-800' : 'text-white'}`}>
          <div className={`animate-spin w-12 h-12 border-4 ${isLight ? 'border-emerald-600 border-t-transparent' : 'border-white border-t-transparent'} rounded-full mx-auto mb-4`} />
          <p className="text-lg">
            {connectionStatus === 'connecting' ? 'Connecting...' : 'Reconnecting...'}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// Profile route component
function ProfileRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    navigate('/');
    return null;
  }

  return (
    <ProfilePage
      profileId={id}
      onViewLeaderboard={() => navigate('/leaderboard')}
    />
  );
}

// Leaderboard route component
function LeaderboardRoute() {
  const navigate = useNavigate();
  const profileId = useProfileStore((state) => state.profileId);

  return (
    <LeaderboardPage
      onBack={() => navigate('/')}
      currentProfileId={profileId}
    />
  );
}

// Dashboard route component
function DashboardRoute() {
  const navigate = useNavigate();

  return (
    <DashboardPage
      onBack={() => navigate('/')}
    />
  );
}

// Main game component
function GameApp() {
  const appPhase = useGameStore((state) => state.appPhase);
  const tutorialMode = useGameStore((state) => state.tutorialMode);
  const {
    showHowToPlay,
    wildcardPositionPrompt,
    meldWildcardPositionPrompt,
    showConfetti,
    errorMessage,
    buyNotification
  } = useUIStore();
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const profileId = useProfileStore((state) => state.profileId);
  const navigate = useNavigate();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showCreateProfile, setShowCreateProfile] = useState(false);

  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);

  // Set up keyboard shortcuts
  useKeyboardShortcuts({ onOpenSettings: handleOpenSettings });

  // Background color changes for tutorial mode and theme
  const getBgClass = () => {
    if (tutorialMode) {
      return resolvedTheme === 'light'
        ? 'bg-gradient-to-br from-amber-100 to-amber-50'
        : 'bg-gradient-to-br from-amber-800 to-amber-950';
    }
    return resolvedTheme === 'light'
      ? 'bg-gradient-to-br from-emerald-100 to-emerald-50'
      : 'bg-gradient-to-br from-emerald-800 to-emerald-950';
  };

  const handleProfileCreated = useCallback((newProfileId: string) => {
    setShowCreateProfile(false);
    navigate(`/p/${newProfileId}`);
  }, [navigate]);

  // Render appropriate screen based on app phase
  const renderScreen = () => {
    switch (appPhase) {
      case 'join':
        return (
          <JoinScreen
            onViewProfile={profileId ? () => navigate(`/p/${profileId}`) : undefined}
            onViewLeaderboard={() => navigate('/leaderboard')}
            onCreateProfile={() => setShowCreateProfile(true)}
          />
        );
      case 'lobby':
        return <LobbyScreen />;
      case 'turnOrder':
        return <TurnOrderScreen />;
      case 'playing':
        return <GameBoard />;
      case 'roundSummary':
        return <RoundSummary />;
      case 'gameOver':
        return <GameOverScreen />;
      default:
        return (
          <JoinScreen
            onViewProfile={profileId ? () => navigate(`/p/${profileId}`) : undefined}
            onViewLeaderboard={() => navigate('/leaderboard')}
            onCreateProfile={() => setShowCreateProfile(true)}
          />
        );
    }
  };

  return (
    <div className={`min-h-screen ${getBgClass()}`}>
      {/* Online/Offline status indicator */}
      <OnlineStatusIndicator />

      {renderScreen()}

      {/* Tutorial overlay */}
      <TutorialOverlay />

      {/* Settings panel */}
      <SettingsPanel isOpen={settingsOpen} onClose={handleCloseSettings} />

      {/* Create profile modal */}
      <CreateProfileModal
        isOpen={showCreateProfile}
        onClose={() => setShowCreateProfile(false)}
        onCreated={handleProfileCreated}
      />

      {/* Global UI elements */}
      {errorMessage && <ErrorNotification message={errorMessage} />}
      {buyNotification && <BuyNotification notification={buyNotification} />}
      {showConfetti && <Confetti />}
      {showHowToPlay && <HowToPlayModal />}
      {(wildcardPositionPrompt || meldWildcardPositionPrompt) && <WildcardPositionModal />}
    </div>
  );
}

// App phase watcher - redirects to game when app phase changes
function AppPhaseWatcher({ children }: { children: ReactNode }) {
  const appPhase = useGameStore((state) => state.appPhase);
  const navigate = useNavigate();
  const location = useLocation();

  // When game starts (phase changes from 'join'), redirect to game
  useEffect(() => {
    if (appPhase !== 'join' && location.pathname !== '/') {
      navigate('/');
    }
  }, [appPhase, navigate, location.pathname]);

  return <>{children}</>;
}

export default function App() {
  return (
    <SocketProvider>
      <AppPhaseWatcher>
        <Routes>
          <Route path="/p/:id" element={<ProfileRoute />} />
          <Route path="/leaderboard" element={<LeaderboardRoute />} />
          <Route path="/dashboard" element={<DashboardRoute />} />
          <Route path="*" element={<GameApp />} />
        </Routes>
      </AppPhaseWatcher>
    </SocketProvider>
  );
}
