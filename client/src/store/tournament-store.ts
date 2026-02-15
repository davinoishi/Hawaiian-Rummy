/**
 * Tournament Store
 * Manages tournament state on the client
 */

import { create } from 'zustand';
import type { ClientTournamentState } from '@shared/tournament-types';

interface TournamentState {
  tournament: ClientTournamentState | null;
  isInTournament: boolean;
  isLoading: boolean;

  // Actions
  setTournament: (state: ClientTournamentState | null) => void;
  clearTournament: () => void;
  setLoading: (loading: boolean) => void;
}

export const useTournamentStore = create<TournamentState>((set) => ({
  tournament: null,
  isInTournament: false,
  isLoading: false,

  setTournament: (tournament) => {
    set({
      tournament,
      isInTournament: !!tournament,
      isLoading: false,
    });
  },

  clearTournament: () => {
    set({
      tournament: null,
      isInTournament: false,
      isLoading: false,
    });
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },
}));
