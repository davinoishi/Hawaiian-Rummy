/**
 * HowToPlayModal - Instructions modal
 */

import { useUIStore } from '../../store';
import { useAudio } from '../../hooks';
import { ROUND_REQUIREMENTS } from '@shared/game-engine/constants';

export function HowToPlayModal() {
  const setShowHowToPlay = useUIStore((state) => state.setShowHowToPlay);
  const { playClick } = useAudio();

  const handleClose = () => {
    playClick();
    setShowHowToPlay(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-thin">
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
