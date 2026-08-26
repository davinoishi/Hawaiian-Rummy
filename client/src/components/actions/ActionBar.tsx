/**
 * ActionBar - Main action buttons for the player
 */

import { useCallback } from 'react';
import { useGameStore, useUIStore, useSettingsStore } from '../../store';
import { usePlayerActions, useAudio, useHaptics } from '../../hooks';

export function ActionBar() {
  const {
    isMyTurn,
    hasMetRequirements,
    gamePhase,
    canDraw
  } = useGameStore();

  const {
    selectedCardIds,
    layoffMode,
    setLayoffMode,
    selectedMeld,
    clearSelection
  } = useUIStore();

  const { createMeld, cancelMelds, discard, layoffCard } = usePlayerActions();
  const { playClick, playMeldCreate, playDiscard } = useAudio();
  const { tap, meldCreate } = useHaptics();
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  const selectedCount = selectedCardIds.length;
  const mustDrawFirst = !!canDraw;
  const canCreateSet = selectedCount >= 3 && !mustDrawFirst;
  const canCreateRun = selectedCount >= 4 && !mustDrawFirst;
  const canDiscard = selectedCount === 1 && isMyTurn && !mustDrawFirst;

  // A greyed-out button with no explanation is the most common source of
  // "why can't I do anything?" - say the reason out loud instead.
  const meldReason = (minCards: number): string | undefined => {
    if (mustDrawFirst) return 'Draw a card first';
    if (selectedCount < minCards) return `Select at least ${minCards} cards`;
    return undefined;
  };
  const setReason = meldReason(3);
  const runReason = meldReason(4);
  const discardReason = mustDrawFirst
    ? 'Draw a card first'
    : selectedCount === 0
      ? 'Select a card to discard'
      : selectedCount > 1
        ? 'Select exactly one card to discard'
        : undefined;

  // The single most useful hint, shown inline under the buttons.
  const hint = mustDrawFirst
    ? 'Draw from the deck or take the discard to start your turn.'
    : selectedCount === 0
      ? 'Tap cards to select them, then create a meld or discard.'
      : null;

  // Handle creating a set
  const handleCreateSet = useCallback(() => {
    playClick();
    meldCreate();
    createMeld('set');
  }, [playClick, meldCreate, createMeld]);

  // Handle creating a run
  const handleCreateRun = useCallback(() => {
    playClick();
    meldCreate();
    createMeld('run');
  }, [playClick, meldCreate, createMeld]);

  // Handle discarding
  const handleDiscard = useCallback(() => {
    playDiscard();
    tap();
    discard();
  }, [playDiscard, tap, discard]);

  // Handle layoff mode toggle
  const handleLayoffToggle = useCallback(() => {
    playClick();
    tap();
    if (layoffMode) {
      setLayoffMode(false);
    } else {
      setLayoffMode(true);
    }
  }, [playClick, tap, layoffMode, setLayoffMode]);

  // Handle confirming layoff (supports multiple cards)
  const handleConfirmLayoff = useCallback(() => {
    if (!selectedMeld || selectedCardIds.length < 1) return;

    // Save card IDs before loop (layoffCard clears selection after each call)
    const cardIdsToLayoff = [...selectedCardIds];

    playMeldCreate();
    meldCreate();

    // Layoff each selected card to the same meld
    for (const cardId of cardIdsToLayoff) {
      layoffCard(
        cardId,
        selectedMeld.playerId,
        selectedMeld.meldIndex
      );
    }

    setLayoffMode(false);
  }, [selectedMeld, selectedCardIds, playMeldCreate, meldCreate, layoffCard, setLayoffMode]);

  // Handle cancel melds
  const handleCancelMelds = useCallback(() => {
    playClick();
    tap();
    cancelMelds();
  }, [playClick, tap, cancelMelds]);

  // Handle clear selection
  const handleClearSelection = useCallback(() => {
    playClick();
    tap();
    clearSelection();
  }, [playClick, tap, clearSelection]);

  if (!isMyTurn) {
    return (
      <div className={`mt-4 min-h-[120px] p-3 rounded-lg ${isLight ? 'bg-emerald-200/50' : 'bg-emerald-700/30'} flex items-center justify-center`}>
        <span className={isLight ? 'text-emerald-700' : 'text-emerald-200'}>Waiting for your turn...</span>
      </div>
    );
  }

  return (
    <div className="mt-4 min-h-[120px] space-y-3">
      {/* Meld actions */}
      <div className="flex flex-wrap gap-2 justify-center">
        <button
          onClick={handleCreateSet}
          disabled={!canCreateSet}
          title={setReason ?? 'Create a set from the selected cards'}
          className="btn-secondary"
        >
          Create Set ({selectedCount >= 3 ? selectedCount : '3+'})
        </button>

        <button
          onClick={handleCreateRun}
          disabled={!canCreateRun}
          title={runReason ?? 'Create a run from the selected cards'}
          className="btn-secondary"
        >
          Create Run ({selectedCount >= 4 ? selectedCount : '4+'})
        </button>

        {hasMetRequirements && (
          <button
            onClick={handleLayoffToggle}
            className={`btn-secondary ${layoffMode ? 'ring-2 ring-yellow-400' : ''}`}
          >
            {layoffMode ? 'Cancel Layoff' : 'Layoff Card'}
          </button>
        )}
      </div>

      {/* Inline hint. A title attribute never appears on a touch device, so the
          most relevant reason is rendered as text too. */}
      {hint && !layoffMode && (
        <p className={`text-center text-sm ${isLight ? 'text-emerald-700' : 'text-emerald-200'}`}>
          {hint}
        </p>
      )}

      {/* Layoff mode instructions */}
      {layoffMode && (
        <div className={`p-3 rounded-lg ${isLight ? 'bg-amber-100 border-amber-400' : 'bg-yellow-500/20 border-yellow-500/50'} border text-center`}>
          <p className={`${isLight ? 'text-amber-800' : 'text-yellow-200'} text-sm mb-2`}>
            Select card(s) and click on a meld to lay off
          </p>
          {selectedMeld && selectedCardIds.length >= 1 && (
            <button
              onClick={handleConfirmLayoff}
              className="btn-primary"
            >
              Confirm Layoff ({selectedCardIds.length} card{selectedCardIds.length > 1 ? 's' : ''})
            </button>
          )}
        </div>
      )}

      {/* Utility actions */}
      <div className={`flex flex-wrap gap-2 justify-center pt-2 border-t ${isLight ? 'border-emerald-300' : 'border-emerald-700/50'}`}>
        {selectedCount > 0 && (
          <button
            onClick={handleClearSelection}
            className="btn-ghost text-sm"
          >
            Clear Selection
          </button>
        )}

        <button
          onClick={handleCancelMelds}
          className={`btn-ghost text-sm ${isLight ? 'text-orange-600' : 'text-orange-300'}`}
        >
          Cancel Melds
        </button>

        <button
          onClick={handleDiscard}
          disabled={!canDiscard}
          title={discardReason ?? 'Discard the selected card and end your turn'}
          className="btn-danger"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
