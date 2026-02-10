/**
 * UI Store - Manages UI interactions and visual state
 */

import { create } from 'zustand';

interface UIState {
  // Card selection
  selectedCardIds: string[];
  focusedCardIndex: number;

  // Drag and drop
  draggedCardId: string | null;
  dragOverCardId: string | null;
  isDragging: boolean;
  dragOverDiscard: boolean;
  dragOverMeld: { playerId: string; meldIndex: number } | null;

  // Touch interactions
  touchDraggedCardId: string | null;
  touchDragPosition: { x: number; y: number } | null;
  zoomedCard: { rank: string; suit: string } | null;

  // Layoff mode
  layoffMode: boolean;
  selectedMeld: { playerId: string; meldIndex: number } | null;
  focusedMeld: { playerId: string; meldIndex: number } | null;
  wildcardReplaceMode: boolean;
  selectedWildcard: string | null;

  // Modals
  showHowToPlay: boolean;
  wildcardPositionPrompt: {
    cardId: string;
    meldOwnerId: string;
    meldIndex: number;
    validPositions: string[];
    wildcardToReplace?: string;
  } | null;
  meldWildcardPositionPrompt: {
    cardIds: string[];
    type: 'set' | 'run';
    arrangements: Array<{ sequence: string; description?: string }>;
  } | null;

  // Notifications
  buyNotification: { type: 'granted' | 'denied' | 'info'; message: string } | null;
  errorMessage: string | null;

  // Animations
  animatingCard: string | null;
  animatingMeldIndex: number | null;
  animatingLayoffMeld: { playerId: string; meldIndex: number } | null;
  discardAnimation: boolean;
  showConfetti: boolean;

  // Collapsible sections
  collapsedSections: Record<string, boolean>;

  // Actions
  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  clearSelection: () => void;
  toggleCardSelection: (cardId: string) => void;
  setFocusedCardIndex: (index: number) => void;

  setDraggedCard: (cardId: string | null) => void;
  setDragOverCard: (cardId: string | null) => void;
  setIsDragging: (isDragging: boolean) => void;
  setDragOverDiscard: (over: boolean) => void;
  setDragOverMeld: (meld: UIState['dragOverMeld']) => void;

  setTouchDraggedCard: (cardId: string | null) => void;
  setTouchDragPosition: (pos: UIState['touchDragPosition']) => void;
  setZoomedCard: (card: UIState['zoomedCard']) => void;

  setLayoffMode: (enabled: boolean) => void;
  setSelectedMeld: (meld: UIState['selectedMeld']) => void;
  setFocusedMeld: (meld: UIState['focusedMeld']) => void;
  setWildcardReplaceMode: (enabled: boolean) => void;
  setSelectedWildcard: (cardId: string | null) => void;

  setShowHowToPlay: (show: boolean) => void;
  setWildcardPositionPrompt: (prompt: UIState['wildcardPositionPrompt']) => void;
  setMeldWildcardPositionPrompt: (prompt: UIState['meldWildcardPositionPrompt']) => void;

  setBuyNotification: (notification: UIState['buyNotification']) => void;
  setErrorMessage: (message: string | null) => void;

  setAnimatingCard: (cardId: string | null) => void;
  setAnimatingMeldIndex: (index: number | null) => void;
  setAnimatingLayoffMeld: (meld: UIState['animatingLayoffMeld']) => void;
  setDiscardAnimation: (animating: boolean) => void;
  setShowConfetti: (show: boolean) => void;

  toggleSection: (sectionId: string) => void;

  resetUI: () => void;
}

const initialState = {
  selectedCardIds: [],
  focusedCardIndex: -1,
  draggedCardId: null,
  dragOverCardId: null,
  isDragging: false,
  dragOverDiscard: false,
  dragOverMeld: null,
  touchDraggedCardId: null,
  touchDragPosition: null,
  zoomedCard: null,
  layoffMode: false,
  selectedMeld: null,
  focusedMeld: null,
  wildcardReplaceMode: false,
  selectedWildcard: null,
  showHowToPlay: false,
  wildcardPositionPrompt: null,
  meldWildcardPositionPrompt: null,
  buyNotification: null,
  errorMessage: null,
  animatingCard: null,
  animatingMeldIndex: null,
  animatingLayoffMeld: null,
  discardAnimation: false,
  showConfetti: false,
  collapsedSections: {},
};

export const useUIStore = create<UIState>((set) => ({
  ...initialState,

  // Card selection
  selectCard: (cardId) => set((state) => ({
    selectedCardIds: state.selectedCardIds.includes(cardId)
      ? state.selectedCardIds
      : [...state.selectedCardIds, cardId]
  })),

  deselectCard: (cardId) => set((state) => ({
    selectedCardIds: state.selectedCardIds.filter(id => id !== cardId)
  })),

  clearSelection: () => set({ selectedCardIds: [] }),

  toggleCardSelection: (cardId) => set((state) => ({
    selectedCardIds: state.selectedCardIds.includes(cardId)
      ? state.selectedCardIds.filter(id => id !== cardId)
      : [...state.selectedCardIds, cardId]
  })),

  setFocusedCardIndex: (index) => set({ focusedCardIndex: index }),

  // Drag and drop
  setDraggedCard: (cardId) => set({ draggedCardId: cardId }),
  setDragOverCard: (cardId) => set({ dragOverCardId: cardId }),
  setIsDragging: (isDragging) => set({ isDragging }),
  setDragOverDiscard: (over) => set({ dragOverDiscard: over }),
  setDragOverMeld: (meld) => set({ dragOverMeld: meld }),

  // Touch
  setTouchDraggedCard: (cardId) => set({ touchDraggedCardId: cardId }),
  setTouchDragPosition: (pos) => set({ touchDragPosition: pos }),
  setZoomedCard: (card) => set({ zoomedCard: card }),

  // Layoff
  setLayoffMode: (enabled) => set({
    layoffMode: enabled,
    selectedMeld: enabled ? null : null,
    focusedMeld: enabled ? null : null
  }),
  setSelectedMeld: (meld) => set({ selectedMeld: meld }),
  setFocusedMeld: (meld) => set({ focusedMeld: meld }),
  setWildcardReplaceMode: (enabled) => set({ wildcardReplaceMode: enabled }),
  setSelectedWildcard: (cardId) => set({ selectedWildcard: cardId }),

  // Modals
  setShowHowToPlay: (show) => set({ showHowToPlay: show }),
  setWildcardPositionPrompt: (prompt) => set({ wildcardPositionPrompt: prompt }),
  setMeldWildcardPositionPrompt: (prompt) => set({ meldWildcardPositionPrompt: prompt }),

  // Notifications
  setBuyNotification: (notification) => set({ buyNotification: notification }),
  setErrorMessage: (message) => set({ errorMessage: message }),

  // Animations
  setAnimatingCard: (cardId) => set({ animatingCard: cardId }),
  setAnimatingMeldIndex: (index) => set({ animatingMeldIndex: index }),
  setAnimatingLayoffMeld: (meld) => set({ animatingLayoffMeld: meld }),
  setDiscardAnimation: (animating) => set({ discardAnimation: animating }),
  setShowConfetti: (show) => set({ showConfetti: show }),

  // Sections
  toggleSection: (sectionId) => set((state) => ({
    collapsedSections: {
      ...state.collapsedSections,
      [sectionId]: !state.collapsedSections[sectionId]
    }
  })),

  resetUI: () => set(initialState)
}));
