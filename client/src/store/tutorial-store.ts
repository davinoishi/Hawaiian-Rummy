/**
 * Tutorial Store - Manages tutorial state and progression
 */

import { create } from 'zustand';

export interface TutorialStep {
  id: number;
  title: string;
  message: string;
  spotlight: string | null;
  highlightCards?: string[];
  highlightWildcards?: boolean;
  allowedActions: string[];
  autoAdvance: boolean;
  showProgress: boolean;
  nextTrigger?: string;
  showCompletion?: boolean;
}

interface TutorialState {
  // Tutorial state
  tutorialMode: boolean;
  tutorialActive: boolean;
  tutorialStep: number;
  tutorialComplete: boolean;

  // Current step data
  currentStepData: TutorialStep | null;

  // Actions
  setTutorialMode: (mode: boolean) => void;
  setTutorialActive: (active: boolean) => void;
  setTutorialStep: (step: number) => void;
  advanceStep: () => void;
  previousStep: () => void;
  completeTutorial: () => void;
  resetTutorial: () => void;

  // Step helpers
  isActionAllowed: (action: string) => boolean;
  shouldHighlightCard: (cardId: string) => boolean;
}

// Tutorial step definitions
const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 0,
    title: 'Welcome to Hawaiian Rummy!',
    message: 'This tutorial will teach you how to play. Click Next to begin!',
    spotlight: null,
    allowedActions: [],
    autoAdvance: false,
    showProgress: false
  },
  {
    id: 1,
    title: 'Your Hand',
    message: 'These are your cards. You have 9 cards to start Round 1.',
    spotlight: 'hand',
    allowedActions: [],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 2,
    title: 'Sets and Runs',
    message: 'A SET is 3+ cards of the same rank (like 7♠ 7♥ 7♦). A RUN is 4+ consecutive cards of the same suit (like 5♠ 6♠ 7♠ 8♠).',
    spotlight: 'hand',
    allowedActions: [],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 3,
    title: 'Wildcards',
    message: 'Jokers and 2s are wildcards - they can substitute for any card! Look for the wild cards in your hand.',
    spotlight: 'hand',
    highlightWildcards: true,
    allowedActions: [],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 4,
    title: 'Round Requirements',
    message: 'Round 1 requires: 2 sets of 3 cards each. You need to create these melds to meet the requirements.',
    spotlight: 'requirements',
    allowedActions: [],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 5,
    title: 'Draw a Card',
    message: 'Your turn starts by drawing a card. Click the deck to draw!',
    spotlight: 'deck',
    allowedActions: ['draw'],
    autoAdvance: true,
    showProgress: true,
    nextTrigger: 'cardDrawn'
  },
  {
    id: 6,
    title: 'Select Cards for Your First Set',
    message: 'Click these three 7s in your hand to select them: 7♠ 7♥ 7♦',
    spotlight: null,
    highlightCards: ['7♠', '7♥', '7♦'],
    allowedActions: ['selectCard'],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 7,
    title: 'Create the Set',
    message: 'Perfect! Now click the "Create Set" button below your hand.',
    spotlight: null,
    allowedActions: ['selectCard', 'createMeld'],
    autoAdvance: true,
    showProgress: true,
    nextTrigger: 'meldCreated'
  },
  {
    id: 8,
    title: 'Create Second Set',
    message: 'Great! Now create your second set with the 8s: 8♠ 8♥ 8♦',
    spotlight: null,
    highlightCards: ['8♠', '8♥', '8♦'],
    allowedActions: ['selectCard', 'createMeld'],
    autoAdvance: true,
    showProgress: true,
    nextTrigger: 'requirementsMet'
  },
  {
    id: 9,
    title: 'Requirements Met!',
    message: "Excellent! You've met Round 1 requirements. Your melds are shown above your hand.",
    spotlight: null,
    allowedActions: [],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 10,
    title: 'Discard a Card',
    message: 'End your turn by discarding a card you don\'t need. Click a card in your hand, then click "Discard".',
    spotlight: null,
    allowedActions: ['selectCard', 'discard'],
    autoAdvance: true,
    showProgress: true,
    nextTrigger: 'cardDiscarded'
  },
  {
    id: 11,
    title: 'Buying from Discard',
    message: 'When it\'s not your turn, you can BUY the discarded card if you need it! You\'ll get the discard plus one penalty card.',
    spotlight: null,
    allowedActions: [],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 12,
    title: 'Laying Off Cards',
    message: 'Once you\'ve met requirements, you can LAYOFF cards onto ANY player\'s melds to reduce points in your hand.',
    spotlight: null,
    allowedActions: [],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 13,
    title: 'Tutorial Complete!',
    message: "Congratulations! You've learned the basics of Hawaiian Rummy. Ready to play a real game?",
    spotlight: null,
    allowedActions: [],
    autoAdvance: false,
    showProgress: false,
    showCompletion: true
  }
];

export const useTutorialStore = create<TutorialState>((set, get) => ({
  tutorialMode: false,
  tutorialActive: false,
  tutorialStep: 0,
  tutorialComplete: false,
  currentStepData: null,

  setTutorialMode: (mode) => set({
    tutorialMode: mode,
    tutorialActive: mode,
    tutorialStep: 0,
    currentStepData: mode ? TUTORIAL_STEPS[0] : null
  }),

  setTutorialActive: (active) => set({ tutorialActive: active }),

  setTutorialStep: (step) => set({
    tutorialStep: step,
    currentStepData: TUTORIAL_STEPS[step] || null
  }),

  advanceStep: () => {
    const { tutorialStep } = get();
    const nextStep = tutorialStep + 1;

    if (nextStep < TUTORIAL_STEPS.length) {
      set({
        tutorialStep: nextStep,
        currentStepData: TUTORIAL_STEPS[nextStep]
      });
    } else {
      set({ tutorialComplete: true });
    }
  },

  previousStep: () => {
    const { tutorialStep } = get();
    const prevStep = Math.max(0, tutorialStep - 1);

    set({
      tutorialStep: prevStep,
      currentStepData: TUTORIAL_STEPS[prevStep]
    });
  },

  completeTutorial: () => set({
    tutorialComplete: true,
    tutorialActive: false
  }),

  resetTutorial: () => set({
    tutorialMode: false,
    tutorialActive: false,
    tutorialStep: 0,
    tutorialComplete: false,
    currentStepData: null
  }),

  isActionAllowed: (action) => {
    const { tutorialActive, currentStepData } = get();
    if (!tutorialActive || !currentStepData) return true;
    return currentStepData.allowedActions.length === 0 ||
           currentStepData.allowedActions.includes(action);
  },

  shouldHighlightCard: (cardId) => {
    const { tutorialActive, currentStepData } = get();
    if (!tutorialActive || !currentStepData) return false;

    // Check if card matches highlight criteria
    if (currentStepData.highlightCards) {
      // cardId format: "7♠0" or "7♠" - extract rank and suit
      const match = cardId.match(/^(\w+)([♠♥♦♣])/);
      if (match) {
        const cardDisplay = `${match[1]}${match[2]}`;
        return currentStepData.highlightCards.includes(cardDisplay);
      }
    }

    return false;
  }
}));

export { TUTORIAL_STEPS };
