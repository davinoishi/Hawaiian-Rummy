/**
 * TutorialOverlay - Shows tutorial instructions and guidance
 */

import { useState, useEffect } from 'react';
import { useGameStore } from '../../store';

// Wait messages that alternate when not player's turn
const WAIT_MESSAGES = [
  {
    title: 'Waiting for Other Players',
    message: 'Watch how the AI players take their turns. When they meld, you\'ll be able to lay off cards on their melds.',
    icon: '👀'
  },
  {
    title: 'About Buying Cards',
    message: 'If a player discards a card you want, you can "Buy" it! Buying comes with a penalty card. Buys are limited per round, and have priority based on player position.',
    icon: '🛒'
  }
];

// Tutorial step definitions
const TUTORIAL_STEPS = [
  {
    condition: (state: any) => state.gamePhase === 'draw' && state.isMyTurn && !state.hasMetRequirements,
    title: 'Step 1: Draw a Card',
    message: 'Click on the deck to draw a card, or click on the discard pile to take that card.',
    highlight: 'deck'
  },
  {
    condition: (state: any) => state.gamePhase === 'meld' && state.isMyTurn && !state.hasMetRequirements && state.myHand?.length >= 9,
    title: 'Step 2: Create Your First Meld',
    message: 'Select three 7s in your hand (click on each card), then click "Create Set". Round 1 requires two sets of 3.',
    highlight: 'hand'
  },
  {
    condition: (state: any) => state.gamePhase === 'meld' && state.isMyTurn && !state.hasMetRequirements && state.myMelds?.length === 1,
    title: 'Step 3: Create Your Second Meld',
    message: 'Now select three 8s and create another set to meet the round requirements.',
    highlight: 'hand'
  },
  {
    condition: (state: any) => state.gamePhase === 'meld' && state.isMyTurn && state.hasMetRequirements,
    title: 'Requirements Met!',
    message: 'You\'ve met the round requirements. You can now discard a card, or try to lay off cards on other players\' melds. Select a card and click "Discard" to end your turn.',
    highlight: 'discard'
  },
  {
    condition: (state: any) => state.gamePhase === 'draw' && state.isMyTurn && state.hasMetRequirements,
    title: 'Your Turn - Draw Phase',
    message: 'Draw a card. After meeting requirements, you can lay off cards on any player\'s melds to reduce your hand.',
    highlight: 'deck'
  },
  {
    condition: (state: any) => state.gamePhase === 'meld' && state.isMyTurn && state.hasMetRequirements && state.myHand?.length > 1,
    title: 'Try Laying Off Cards',
    message: 'Look at the other players\' melds. If you have a card that matches (same rank for sets, or extends a run), select it and click on their meld to lay it off.',
    highlight: 'opponents'
  }
];

export function TutorialOverlay() {
  const gameState = useGameStore();
  const [waitMessageIndex, setWaitMessageIndex] = useState(0);
  const isMyTurn = gameState.isMyTurn ?? false;

  // Alternate between wait messages when not player's turn
  useEffect(() => {
    if (!isMyTurn && gameState.tutorialMode) {
      const interval = setInterval(() => {
        setWaitMessageIndex(prev => (prev + 1) % WAIT_MESSAGES.length);
      }, 5000); // Switch every 5 seconds
      return () => clearInterval(interval);
    }
  }, [isMyTurn, gameState.tutorialMode]);

  // Reset to first message when turn changes
  useEffect(() => {
    if (isMyTurn) {
      setWaitMessageIndex(0);
    }
  }, [isMyTurn]);

  if (!gameState.tutorialMode) {
    return null;
  }

  // Find the current applicable step, or show wait message
  const currentStep = TUTORIAL_STEPS.find(step => step.condition(gameState));
  const waitMessage = !isMyTurn ? WAIT_MESSAGES[waitMessageIndex] : null;

  // Determine what to show
  const displayTitle = currentStep?.title || waitMessage?.title || '';
  const displayMessage = currentStep?.message || waitMessage?.message || '';
  const displayIcon = waitMessage?.icon || '💡';

  if (!displayTitle) return null;

  return (
    <>
      {/* Tutorial Mode Banner */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-600 to-amber-500 text-white py-2 px-4 text-center shadow-lg">
        <div className="flex items-center justify-center gap-2">
          <span className="text-xl">📚</span>
          <span className="font-bold text-lg tracking-wide">TUTORIAL MODE</span>
          <span className="text-xl">📚</span>
        </div>
      </div>

      {/* Tutorial Instructions Panel */}
      <div className="fixed bottom-24 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-40 animate-slide-up">
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-400 rounded-xl shadow-xl p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">{displayIcon}</div>
            <div className="flex-1">
              <h3 className="font-bold text-amber-800 text-lg mb-1">
                {displayTitle}
              </h3>
              <p className="text-amber-900 text-sm leading-relaxed">
                {displayMessage}
              </p>
            </div>
          </div>

          {/* Progress indicator / Wait indicator */}
          <div className="mt-3 pt-3 border-t border-amber-300">
            {!isMyTurn ? (
              <div className="flex items-center justify-center gap-2">
                <div className="flex gap-1">
                  {WAIT_MESSAGES.map((_, idx) => (
                    <div
                      key={idx}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        idx === waitMessageIndex ? 'bg-amber-600' : 'bg-amber-300'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-amber-600">
                  Swipe or wait for more tips
                </p>
              </div>
            ) : (
              <p className="text-xs text-amber-700 text-center">
                Round 1: Create two sets of 3 cards each
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
