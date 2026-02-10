/**
 * ActionBar - Main action buttons for the player
 */

import { useCallback, useMemo } from 'react';
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
  const canCreateSet = selectedCount >= 3;
  const canCreateRun = selectedCount >= 4;
  const canDiscard = selectedCount === 1 && isMyTurn && !canDraw;
  const canLayoff = hasMetRequirements && selectedCount === 1 && isMyTurn;

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

  // Handle confirming layoff
  const handleConfirmLayoff = useCallback(() => {
    if (!selectedMeld || selectedCardIds.length !== 1) return;
    playMeldCreate();
    meldCreate();
    layoffCard(
      selectedCardIds[0],
      selectedMeld.playerId,
      selectedMeld.meldIndex
    );
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
          className="btn-secondary"
        >
          Create Set ({selectedCount >= 3 ? selectedCount : '3+'})
        </button>

        <button
          onClick={handleCreateRun}
          disabled={!canCreateRun}
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

      {/* Layoff mode instructions */}
      {layoffMode && (
        <div className={`p-3 rounded-lg ${isLight ? 'bg-amber-100 border-amber-400' : 'bg-yellow-500/20 border-yellow-500/50'} border text-center`}>
          <p className={`${isLight ? 'text-amber-800' : 'text-yellow-200'} text-sm mb-2`}>
            Select a card and click on a meld to lay off
          </p>
          {selectedMeld && selectedCardIds.length === 1 && (
            <button
              onClick={handleConfirmLayoff}
              className="btn-primary"
            >
              Confirm Layoff
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
          className="btn-danger"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
