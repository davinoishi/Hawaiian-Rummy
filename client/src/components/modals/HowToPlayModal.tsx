/**
 * HowToPlayModal - Instructions modal
 */

import { useRef, useEffect, useCallback } from 'react';
import { useUIStore } from '../../store';
import { useAudio } from '../../hooks';
import { ROUND_REQUIREMENTS } from '@shared/game-engine/constants';

export function HowToPlayModal() {
  const setShowHowToPlay = useUIStore((state) => state.setShowHowToPlay);
  const { playClick } = useAudio();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    playClick();
    setShowHowToPlay(false);
  }, [playClick, setShowHowToPlay]);

  // Handle keyboard navigation for scrolling
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Focus the container so it receives keyboard events
    container.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      const scrollAmount = 100;
      const pageScrollAmount = container.clientHeight - 50;

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          container.scrollBy({ top: scrollAmount, behavior: 'smooth' });
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          container.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
          break;
        case 'PageDown':
        case ' ':
          e.preventDefault();
          container.scrollBy({ top: pageScrollAmount, behavior: 'smooth' });
          break;
        case 'PageUp':
          e.preventDefault();
          container.scrollBy({ top: -pageScrollAmount, behavior: 'smooth' });
          break;
        case 'Home':
          e.preventDefault();
          container.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'End':
          e.preventDefault();
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
          break;
        case 'Escape':
          e.preventDefault();
          handleClose();
          break;
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div
        ref={scrollContainerRef}
        tabIndex={0}
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-thin outline-none"
      >
        {/* Header */}
        <div className="sticky top-0 bg-emerald-600 p-4 rounded-t-xl flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">How to Play Hawaiian Rummy</h2>
          <button
            onClick={handleClose}
            className="text-white/80 hover:text-white p-1"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6 text-gray-700">
          {/* Objective */}
          <section>
            <h3 className="text-lg font-bold text-emerald-700 mb-2">Objective</h3>
            <p>
              Be the first to go out by discarding or laying off your last card.
              The player with the lowest total score after 10 rounds wins!
            </p>
          </section>

          {/* Melds */}
          <section>
            <h3 className="text-lg font-bold text-emerald-700 mb-2">Creating Melds</h3>
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="font-semibold text-blue-700">Sets</p>
                <p className="text-sm">3 or more cards of the same rank (e.g., 7♠ 7♥ 7♦)</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="font-semibold text-green-700">Runs</p>
                <p className="text-sm">4 or more consecutive cards of the same suit (e.g., 5♠ 6♠ 7♠ 8♠)</p>
              </div>
            </div>
          </section>

          {/* Wildcards */}
          <section>
            <h3 className="text-lg font-bold text-emerald-700 mb-2">Wildcards</h3>
            <p>
              <span className="font-semibold text-purple-600">Jokers</span> and{' '}
              <span className="font-semibold text-purple-600">2s</span> are wildcards
              and can substitute for any card in a meld.
            </p>
          </section>

          {/* Turn Structure */}
          <section>
            <h3 className="text-lg font-bold text-emerald-700 mb-2">Your Turn</h3>
            <ol className="list-decimal list-inside space-y-2">
              <li><span className="font-medium">Draw</span> - Take from the deck or discard pile</li>
              <li><span className="font-medium">Meld</span> - Create sets/runs to meet requirements</li>
              <li><span className="font-medium">Layoff</span> - Add cards to existing melds (optional)</li>
              <li><span className="font-medium">Discard</span> - End your turn by discarding one card</li>
            </ol>
          </section>

          {/* Buying */}
          <section>
            <h3 className="text-lg font-bold text-emerald-700 mb-2">Buying</h3>
            <p>
              When it's not your turn, you can <span className="font-semibold">buy</span> the
              discarded card. You'll receive the discard plus one penalty card from the deck.
              Limited to 3 buys per round.
            </p>
          </section>

          {/* Round Requirements */}
          <section>
            <h3 className="text-lg font-bold text-emerald-700 mb-2">Round Requirements</h3>
            <div className="grid grid-cols-2 gap-2">
              {ROUND_REQUIREMENTS.map((req, index) => (
                <div key={index} className="p-2 bg-gray-100 rounded text-sm">
                  <span className="font-medium">Round {index + 1}:</span>{' '}
                  {req.description}
                </div>
              ))}
            </div>
          </section>

          {/* Scoring */}
          <section>
            <h3 className="text-lg font-bold text-emerald-700 mb-2">Scoring</h3>
            <p className="mb-2">
              When a player goes out, everyone else adds up the points in their hand:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Jokers: 50 points</li>
              <li>2s: 20 points</li>
              <li>Aces: 15 points</li>
              <li>Face cards (K, Q, J): 10 points</li>
              <li>Number cards (3-10): Face value</li>
            </ul>
            <p className="mt-2 text-sm">
              If the draw deck runs out, the round ends immediately with no winner.
              All players' remaining hand cards are scored as points.
            </p>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <h3 className="text-lg font-bold text-emerald-700 mb-2">Keyboard Shortcuts</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {/* Draw Phase */}
              <div className="col-span-2 font-semibold text-emerald-600 mt-1">Draw Phase</div>
              <div className="flex justify-between">
                <span>Draw from deck</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">D</kbd>
              </div>
              <div className="flex justify-between">
                <span>Take from discard</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">T</kbd>
              </div>
              <div className="flex justify-between">
                <span>Request buy</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">B</kbd>
              </div>

              {/* Meld Phase */}
              <div className="col-span-2 font-semibold text-emerald-600 mt-2">Meld Phase</div>
              <div className="flex justify-between">
                <span>Create set (3+ same rank)</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">E</kbd>
              </div>
              <div className="flex justify-between">
                <span>Create run (4+ sequence)</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">U</kbd>
              </div>
              <div className="flex justify-between">
                <span>Auto meld (3=set, 4+=run)</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">M</kbd>
              </div>
              <div className="flex justify-between">
                <span>Toggle layoff mode</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">L</kbd>
              </div>
              <div className="flex justify-between">
                <span>Navigate melds (in layoff)</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">Tab / [ ]</kbd>
              </div>
              <div className="flex justify-between">
                <span>Confirm layoff</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">Enter</kbd>
              </div>
              <p className="col-span-2 text-xs text-gray-500 italic">Layoff: select 1 card, press L, Tab to meld, Enter to confirm</p>

              {/* Discard Phase */}
              <div className="col-span-2 font-semibold text-emerald-600 mt-2">Discard Phase</div>
              <div className="flex justify-between">
                <span>Discard selected card</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">Enter</kbd>
              </div>

              {/* Card Selection */}
              <div className="col-span-2 font-semibold text-emerald-600 mt-2">Card Selection</div>
              <div className="flex justify-between">
                <span>Select card by position</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">1-9, 0</kbd>
              </div>
              <div className="flex justify-between">
                <span>Navigate cards</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">← →</kbd>
              </div>
              <div className="flex justify-between">
                <span>Toggle focused card</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">↑ ↓</kbd>
              </div>
              <div className="flex justify-between">
                <span>Clear selection</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">Esc</kbd>
              </div>
              <div className="flex justify-between">
                <span>Select all</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">⌘/Ctrl+A</kbd>
              </div>

              {/* Hand Management */}
              <div className="col-span-2 font-semibold text-emerald-600 mt-2">Hand Management</div>
              <div className="flex justify-between">
                <span>Sort by rank</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">R</kbd>
              </div>
              <div className="flex justify-between">
                <span>Sort by suit</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">S</kbd>
              </div>

              {/* General */}
              <div className="col-span-2 font-semibold text-emerald-600 mt-2">General</div>
              <div className="flex justify-between">
                <span>Toggle sound</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">N</kbd>
              </div>
              <div className="flex justify-between">
                <span>Cycle theme (light/dark/auto)</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">P</kbd>
              </div>
              <div className="flex justify-between">
                <span>Show help</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">H / ?</kbd>
              </div>
              <div className="flex justify-between">
                <span>Open settings</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">,</kbd>
              </div>

              {/* Modal Navigation */}
              <div className="col-span-2 font-semibold text-emerald-600 mt-2">This Help Screen</div>
              <div className="flex justify-between">
                <span>Scroll down/up</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">↓ ↑ / j k</kbd>
              </div>
              <div className="flex justify-between">
                <span>Page down/up</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">Space / PgUp</kbd>
              </div>
              <div className="flex justify-between">
                <span>Close</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">Esc</kbd>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 p-4 bg-gray-100 rounded-b-xl">
          <button
            onClick={handleClose}
            className="btn-primary w-full"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
