/**
 * WildcardPositionModal - Choose position for wildcard in a run
 */

import { useUIStore, useSocketStore } from '../../store';
import { usePlayerActions, useAudio, useHaptics } from '../../hooks';

export function WildcardPositionModal() {
  const {
    wildcardPositionPrompt,
    setWildcardPositionPrompt,
    meldWildcardPositionPrompt,
    setMeldWildcardPositionPrompt
  } = useUIStore();

  const emit = useSocketStore((state) => state.emit);
  const { layoffCard } = usePlayerActions();
  const { playClick } = useAudio();
  const { tap } = useHaptics();

  // Handle layoff wildcard position selection
  const handleLayoffPosition = (position: string, event: React.MouseEvent) => {
    // Prevent click from punching through to buttons behind the modal when it closes
    event.stopPropagation();

    if (!wildcardPositionPrompt) return;

    playClick();
    tap();

    layoffCard(
      wildcardPositionPrompt.cardId,
      wildcardPositionPrompt.meldOwnerId,
      wildcardPositionPrompt.meldIndex,
      position === 'start' ? 'start' : 'end',
      position
    );

    setWildcardPositionPrompt(null);
  };

  // Handle meld arrangement selection
  const handleMeldArrangement = (index: number, event: React.MouseEvent) => {
    // Prevent click from punching through to buttons behind the modal when it closes
    event.stopPropagation();

    if (!meldWildcardPositionPrompt) return;

    playClick();
    tap();

    // Emit directly with the stored cardIds since selectedCardIds was cleared
    emit('createMeld', {
      cardIds: meldWildcardPositionPrompt.cardIds,
      type: meldWildcardPositionPrompt.type,
      wildcardPlacement: index
    });

    setMeldWildcardPositionPrompt(null);
  };

  const handleCancel = (event: React.MouseEvent) => {
    // Prevent click from punching through to buttons behind the modal when it closes
    event.stopPropagation();

    playClick();
    tap();
    setWildcardPositionPrompt(null);
    setMeldWildcardPositionPrompt(null);
  };

  // Layoff wildcard position prompt
  if (wildcardPositionPrompt) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
        <div className="panel p-6 max-w-md w-full">
          <h3 className="text-lg font-bold text-white mb-4">
            Choose Wildcard Position
          </h3>
          <p className="text-emerald-200 mb-6">
            Where should this wildcard be placed in the run?
          </p>

          <div className="space-y-2">
            {wildcardPositionPrompt.validPositions.map((position) => (
              <button
                key={position}
                onClick={(e) => handleLayoffPosition(position, e)}
                className="btn-secondary w-full justify-start"
              >
                {position === 'start' ? 'At the beginning' :
                 position === 'end' ? 'At the end' :
                 `As ${position}`}
              </button>
            ))}
          </div>

          <button
            onClick={(e) => handleCancel(e)}
            className="btn-ghost w-full mt-4"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Meld wildcard arrangement prompt
  if (meldWildcardPositionPrompt) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
        <div className="panel p-6 max-w-md w-full">
          <h3 className="text-lg font-bold text-white mb-4">
            Choose Arrangement
          </h3>
          <p className="text-emerald-200 mb-6">
            How should the wildcards be arranged in this {meldWildcardPositionPrompt.type}?
          </p>

          <div className="space-y-2">
            {meldWildcardPositionPrompt.arrangements.map((arr, index) => (
              <button
                key={arr.sequence}
                onClick={(e) => handleMeldArrangement(index, e)}
                className="btn-secondary w-full text-left"
              >
                <span className="font-mono text-sm">{arr.sequence}</span>
                {arr.description && (
                  <span className="text-xs text-emerald-300 block">
                    {arr.description}
                  </span>
                )}
              </button>
            ))}
          </div>

          <button
            onClick={(e) => handleCancel(e)}
            className="btn-ghost w-full mt-4"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return null;
}
