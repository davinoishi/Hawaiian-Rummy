/**
 * useKeyboardShortcuts - Hook for handling keyboard shortcuts during gameplay
 */

import { useEffect, useCallback } from 'react';
import { useGameStore, useUIStore, useSettingsStore } from '../store';
import { usePlayerActions } from './usePlayerActions';
import { sortCardsByRank, groupBySuit } from '@shared/game-engine/card-utils';

interface UseKeyboardShortcutsProps {
  onOpenSettings?: () => void;
}

export function useKeyboardShortcuts({ onOpenSettings }: UseKeyboardShortcutsProps = {}) {
  const gamePhase = useGameStore((state) => state.gamePhase);
  const isMyTurn = useGameStore((state) => state.isMyTurn);
  const canDraw = useGameStore((state) => state.canDraw);
  const canBuy = useGameStore((state) => state.canBuy);
  const myHand = useGameStore((state) => state.myHand);
  const appPhase = useGameStore((state) => state.appPhase);
  const hasMetRequirements = useGameStore((state) => state.hasMetRequirements);

  const selectedCardIds = useUIStore((state) => state.selectedCardIds);
  const clearSelection = useUIStore((state) => state.clearSelection);
  const showHowToPlay = useUIStore((state) => state.showHowToPlay);
  const setShowHowToPlay = useUIStore((state) => state.setShowHowToPlay);
  const wildcardPositionPrompt = useUIStore((state) => state.wildcardPositionPrompt);
  const meldWildcardPositionPrompt = useUIStore((state) => state.meldWildcardPositionPrompt);
  const layoffMode = useUIStore((state) => state.layoffMode);
  const setLayoffMode = useUIStore((state) => state.setLayoffMode);
  const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);
  const focusedCardIndex = useUIStore((state) => state.focusedCardIndex);
  const setFocusedCardIndex = useUIStore((state) => state.setFocusedCardIndex);
  const focusedMeld = useUIStore((state) => state.focusedMeld);
  const setFocusedMeld = useUIStore((state) => state.setFocusedMeld);
  const setSelectedMeld = useUIStore((state) => state.setSelectedMeld);
  const players = useGameStore((state) => state.players);

  const toggleSound = useSettingsStore((state) => state.toggleSound);
  const themeMode = useSettingsStore((state) => state.themeMode);
  const setThemeMode = useSettingsStore((state) => state.setThemeMode);

  const { drawCard, takeDiscard, createMeld, requestBuy, reorderHand, discard, layoffCard } = usePlayerActions();

  // Build a flat list of all melds for keyboard navigation
  const getAllMelds = useCallback(() => {
    if (!players) return [];
    const allMelds: { playerId: string; meldIndex: number }[] = [];
    players.forEach(player => {
      if (player.melds && player.melds.length > 0) {
        player.melds.forEach((_, meldIndex) => {
          allMelds.push({ playerId: player.id, meldIndex });
        });
      }
    });
    return allMelds;
  }, [players]);

  // Check if any modal is open
  const hasModalOpen = showHowToPlay || wildcardPositionPrompt || meldWildcardPositionPrompt;

  // Sort by rank handler
  const handleSortByRank = useCallback(() => {
    if (!myHand || myHand.length === 0) return;
    const sorted = sortCardsByRank([...myHand]);
    reorderHand(sorted.map(c => c.id));
  }, [myHand, reorderHand]);

  // Sort by suit handler
  const handleSortBySuit = useCallback(() => {
    if (!myHand || myHand.length === 0) return;
    const grouped = groupBySuit([...myHand]);
    const result: string[] = [];
    (['♠', '♥', '♦', '♣'] as const).forEach(suit => {
      const suitCards = grouped.get(suit);
      if (suitCards) {
        result.push(...sortCardsByRank(suitCards).map(c => c.id));
      }
    });
    // Add jokers at the end
    myHand.filter(c => c.rank === 'Joker' || c.isWild).forEach(c => {
      if (!result.includes(c.id)) result.push(c.id);
    });
    reorderHand(result);
  }, [myHand, reorderHand]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Global shortcuts (work anywhere)
      switch (e.key.toLowerCase()) {
        case 'escape':
          if (hasModalOpen) {
            if (showHowToPlay) setShowHowToPlay(false);
            // Modal closing is handled by the modals themselves
          } else {
            clearSelection();
            setLayoffMode(false);
            setFocusedCardIndex(-1);
          }
          return;

        case 'n':
          // Toggle sound
          toggleSound();
          return;

        case 'p':
          // Toggle theme (cycles: light -> dark -> auto -> light)
          if (!hasModalOpen) {
            const nextTheme = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'auto' : 'light';
            setThemeMode(nextTheme);
          }
          return;

        case '?':
        case 'h':
          // Show help
          if (!hasModalOpen) {
            setShowHowToPlay(true);
          }
          return;

        case ',':
          // Open settings
          if (onOpenSettings && !hasModalOpen) {
            onOpenSettings();
          }
          return;
      }

      // Game-specific shortcuts (only during playing phase)
      if (appPhase !== 'playing' || hasModalOpen) return;

      switch (e.key.toLowerCase()) {
        case 'd':
        case ' ':
          // Draw from deck
          if (isMyTurn && canDraw && gamePhase === 'draw') {
            e.preventDefault();
            drawCard();
          }
          break;

        case 't':
          // Take from discard - works during draw phase
          if (isMyTurn && gamePhase === 'draw') {
            e.preventDefault();
            takeDiscard();
          }
          break;

        case 'e':
          // Create set meld from selected cards (works when it's your turn and you've drawn)
          if (isMyTurn && selectedCardIds.length >= 3 && !canDraw) {
            e.preventDefault();
            createMeld('set');
          }
          break;

        case 'u':
          // Create run meld from selected cards
          if (isMyTurn && selectedCardIds.length >= 4 && !canDraw) {
            e.preventDefault();
            createMeld('run');
          }
          break;

        case 'm':
          // Create meld (auto-detect type based on count: 3 = set, 4+ = run)
          if (isMyTurn && selectedCardIds.length >= 3 && !canDraw) {
            e.preventDefault();
            const meldType = selectedCardIds.length === 3 ? 'set' : 'run';
            createMeld(meldType);
          }
          break;

        case 'l':
          // Toggle layoff mode
          if (isMyTurn && hasMetRequirements && !canDraw) {
            e.preventDefault();
            setLayoffMode(!layoffMode);
          }
          break;

        case 'enter':
          // In layoff mode: confirm layoff if card and meld are selected
          if (layoffMode && focusedMeld && selectedCardIds.length === 1) {
            e.preventDefault();
            layoffCard(selectedCardIds[0], focusedMeld.playerId, focusedMeld.meldIndex);
            setLayoffMode(false);
            break;
          }
          // Discard selected card (must have exactly 1 selected and already drawn)
          if (isMyTurn && selectedCardIds.length === 1 && !canDraw) {
            e.preventDefault();
            discard();
          }
          break;

        case 'tab':
          // In layoff mode: cycle through melds
          if (layoffMode && hasMetRequirements) {
            e.preventDefault();
            const allMelds = getAllMelds();
            if (allMelds.length === 0) break;

            if (!focusedMeld) {
              // Focus first meld
              setFocusedMeld(allMelds[0]);
              setSelectedMeld(allMelds[0]);
            } else {
              // Find current index and move to next/prev
              const currentIndex = allMelds.findIndex(
                m => m.playerId === focusedMeld.playerId && m.meldIndex === focusedMeld.meldIndex
              );
              let nextIndex: number;
              if (e.shiftKey) {
                // Previous meld
                nextIndex = currentIndex <= 0 ? allMelds.length - 1 : currentIndex - 1;
              } else {
                // Next meld
                nextIndex = currentIndex >= allMelds.length - 1 ? 0 : currentIndex + 1;
              }
              setFocusedMeld(allMelds[nextIndex]);
              setSelectedMeld(allMelds[nextIndex]);
            }
          }
          break;

        case '[':
          // Previous meld (alternative to Shift+Tab)
          if (layoffMode && hasMetRequirements) {
            e.preventDefault();
            const allMelds = getAllMelds();
            if (allMelds.length === 0) break;

            if (!focusedMeld) {
              setFocusedMeld(allMelds[allMelds.length - 1]);
              setSelectedMeld(allMelds[allMelds.length - 1]);
            } else {
              const currentIndex = allMelds.findIndex(
                m => m.playerId === focusedMeld.playerId && m.meldIndex === focusedMeld.meldIndex
              );
              const prevIndex = currentIndex <= 0 ? allMelds.length - 1 : currentIndex - 1;
              setFocusedMeld(allMelds[prevIndex]);
              setSelectedMeld(allMelds[prevIndex]);
            }
          }
          break;

        case ']':
          // Next meld (alternative to Tab)
          if (layoffMode && hasMetRequirements) {
            e.preventDefault();
            const allMelds = getAllMelds();
            if (allMelds.length === 0) break;

            if (!focusedMeld) {
              setFocusedMeld(allMelds[0]);
              setSelectedMeld(allMelds[0]);
            } else {
              const currentIndex = allMelds.findIndex(
                m => m.playerId === focusedMeld.playerId && m.meldIndex === focusedMeld.meldIndex
              );
              const nextIndex = currentIndex >= allMelds.length - 1 ? 0 : currentIndex + 1;
              setFocusedMeld(allMelds[nextIndex]);
              setSelectedMeld(allMelds[nextIndex]);
            }
          }
          break;

        case 'b':
          // Request buy
          if (canBuy && gamePhase === 'draw') {
            e.preventDefault();
            requestBuy();
          }
          break;

        case 'r':
          // Sort by rank
          if (myHand && myHand.length > 0) {
            e.preventDefault();
            handleSortByRank();
          }
          break;

        case 's':
          // Sort by suit (but not if Shift is held - could be typing)
          if (myHand && myHand.length > 0 && !e.shiftKey) {
            e.preventDefault();
            handleSortBySuit();
          }
          break;

        case 'c':
          // Clear selection (alternative to Escape)
          clearSelection();
          setFocusedCardIndex(-1);
          break;

        case 'arrowleft':
          // Navigate to previous card
          if (myHand && myHand.length > 0) {
            e.preventDefault();
            let newIndex: number;
            if (focusedCardIndex <= 0) {
              newIndex = myHand.length - 1;
            } else {
              newIndex = focusedCardIndex - 1;
            }
            setFocusedCardIndex(newIndex);
          }
          break;

        case 'arrowright':
          // Navigate to next card
          if (myHand && myHand.length > 0) {
            e.preventDefault();
            let newIndex: number;
            if (focusedCardIndex >= myHand.length - 1 || focusedCardIndex < 0) {
              newIndex = 0;
            } else {
              newIndex = focusedCardIndex + 1;
            }
            setFocusedCardIndex(newIndex);
          }
          break;

        case 'arrowup':
        case 'arrowdown':
          // Toggle selection of focused card
          if (myHand && myHand.length > 0 && focusedCardIndex >= 0) {
            e.preventDefault();
            const cardId = myHand[focusedCardIndex]?.id;
            if (cardId) {
              toggleCardSelection(cardId);
            }
          }
          break;

        case 'a':
          // Select all cards (with Ctrl/Cmd)
          if ((e.ctrlKey || e.metaKey) && myHand && myHand.length > 0) {
            e.preventDefault();
            myHand.forEach(card => {
              if (!selectedCardIds.includes(card.id)) {
                toggleCardSelection(card.id);
              }
            });
          }
          break;

        default:
          // Number keys 1-9 and 0 for quick card selection by position
          const numKey = e.key;
          if (/^[0-9]$/.test(numKey) && myHand && myHand.length > 0) {
            e.preventDefault();
            // 1 = first card, 2 = second, ... 9 = ninth, 0 = tenth
            const index = numKey === '0' ? 9 : parseInt(numKey) - 1;
            if (index < myHand.length) {
              const cardId = myHand[index].id;
              toggleCardSelection(cardId);
              setFocusedCardIndex(index);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    appPhase,
    gamePhase,
    isMyTurn,
    canDraw,
    canBuy,
    selectedCardIds,
    hasModalOpen,
    showHowToPlay,
    myHand,
    hasMetRequirements,
    layoffMode,
    focusedCardIndex,
    focusedMeld,
    themeMode,
    drawCard,
    takeDiscard,
    createMeld,
    requestBuy,
    discard,
    layoffCard,
    clearSelection,
    setShowHowToPlay,
    setLayoffMode,
    setFocusedCardIndex,
    setFocusedMeld,
    setSelectedMeld,
    toggleSound,
    setThemeMode,
    onOpenSettings,
    handleSortByRank,
    handleSortBySuit,
    toggleCardSelection,
    getAllMelds
  ]);
}
