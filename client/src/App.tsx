/**
 * App - Main application component
 */

import { useEffect } from 'react';
import { useSocketStore, useGameStore, useUIStore } from './store';
import { useSocketEvents, useAudio } from './hooks';

// Screens
import { JoinScreen } from './components/lobby/JoinScreen';
import { LobbyScreen } from './components/lobby/LobbyScreen';
import { TurnOrderScreen } from './components/game/TurnOrderScreen';
import { GameBoard } from './components/game/GameBoard';
import { RoundSummary } from './components/game/RoundSummary';
import { GameOverScreen } from './components/game/GameOverScreen';

// Global components
import { ErrorNotification } from './components/ui/ErrorNotification';
import { BuyNotification } from './components/ui/BuyNotification';
import { Confetti } from './components/ui/Confetti';
import { TutorialOverlay } from './components/ui/TutorialOverlay';
import { HowToPlayModal } from './components/modals/HowToPlayModal';
import { WildcardPositionModal } from './components/modals/WildcardPositionModal';

export default function App() {
  const { connect, connectionStatus } = useSocketStore();
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
  const { initAudioContext } = useAudio();

  // Background color changes for tutorial mode
  const bgClass = tutorialMode
    ? 'bg-gradient-to-br from-amber-800 to-amber-950'
    : 'bg-gradient-to-br from-emerald-800 to-emerald-950';

  // Set up socket events
  useSocketEvents();

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


  // Render appropriate screen based on app phase
  const renderScreen = () => {
    if (connectionStatus !== 'connected') {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-emerald-800 to-emerald-950">
          <div className="text-center text-white">
            <div className="animate-spin w-12 h-12 border-4 border-white border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-lg">
              {connectionStatus === 'connecting' ? 'Connecting...' : 'Reconnecting...'}
            </p>
          </div>
        </div>
      );
    }

    switch (appPhase) {
      case 'join':
        return <JoinScreen />;
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
        return <JoinScreen />;
    }
  };

  return (
    <div className={`min-h-screen ${bgClass}`}>
      {renderScreen()}

      {/* Tutorial overlay */}
      <TutorialOverlay />

      {/* Global UI elements */}
      {errorMessage && <ErrorNotification message={errorMessage} />}
      {buyNotification && <BuyNotification notification={buyNotification} />}
      {showConfetti && <Confetti />}
      {showHowToPlay && <HowToPlayModal />}
      {(wildcardPositionPrompt || meldWildcardPositionPrompt) && <WildcardPositionModal />}
    </div>
  );
}
