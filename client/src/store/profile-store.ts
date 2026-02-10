/**
 * Profile Store
 * Manages current user's profile state
 */

import { create } from 'zustand';
import type { PlayerProfile, Leaderboard } from '@shared/profile-types';
import * as profileApi from '../services/profile-api';

interface ProfileState {
  // Current profile (if logged in via /p/:id URL)
  profile: PlayerProfile | null;
  profileId: string | null;
  isLoading: boolean;
  error: string | null;

  // Leaderboard cache
  leaderboard: Leaderboard | null;
  leaderboardLoading: boolean;

  // Actions
  loadProfile: (id: string) => Promise<boolean>;
  createProfile: (nickname: string) => Promise<PlayerProfile | null>;
  updateNickname: (nickname: string) => Promise<boolean>;
  deleteProfile: () => Promise<boolean>;
  clearProfile: () => void;
  loadLeaderboard: () => Promise<void>;
  setError: (error: string | null) => void;
}

// Check localStorage for saved profile ID
function getSavedProfileId(): string | null {
  try {
    return localStorage.getItem('hawaiian-rummy-profile-id');
  } catch {
    return null;
  }
}

function saveProfileId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem('hawaiian-rummy-profile-id', id);
    } else {
      localStorage.removeItem('hawaiian-rummy-profile-id');
    }
  } catch {
    // localStorage not available
  }
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  profileId: getSavedProfileId(),
  isLoading: false,
  error: null,
  leaderboard: null,
  leaderboardLoading: false,

  loadProfile: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await profileApi.getProfile(id);
      if (response.success && response.profile) {
        set({
          profile: response.profile,
          profileId: id,
          isLoading: false
        });
        saveProfileId(id);
        return true;
      } else {
        set({
          profile: null,
          isLoading: false,
          error: response.error || 'Profile not found'
        });
        return false;
      }
    } catch (err) {
      set({
        profile: null,
        isLoading: false,
        error: 'Failed to load profile'
      });
      return false;
    }
  },

  createProfile: async (nickname: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await profileApi.createProfile(nickname);
      if (response.success && response.profile) {
        set({
          profile: response.profile,
          profileId: response.profile.id,
          isLoading: false
        });
        saveProfileId(response.profile.id);
        return response.profile;
      } else {
        set({
          isLoading: false,
          error: response.error || 'Failed to create profile'
        });
        return null;
      }
    } catch (err) {
      set({
        isLoading: false,
        error: 'Failed to create profile'
      });
      return null;
    }
  },

  updateNickname: async (nickname: string) => {
    const { profileId } = get();
    if (!profileId) return false;

    set({ isLoading: true, error: null });
    try {
      const response = await profileApi.updateProfile(profileId, nickname);
      if (response.success && response.profile) {
        set({
          profile: response.profile,
          isLoading: false
        });
        return true;
      } else {
        set({
          isLoading: false,
          error: response.error || 'Failed to update profile'
        });
        return false;
      }
    } catch (err) {
      set({
        isLoading: false,
        error: 'Failed to update profile'
      });
      return false;
    }
  },

  deleteProfile: async () => {
    const { profileId } = get();
    if (!profileId) return false;

    set({ isLoading: true, error: null });
    try {
      const response = await profileApi.deleteProfile(profileId);
      if (response.success) {
        set({
          profile: null,
          profileId: null,
          isLoading: false
        });
        saveProfileId(null);
        return true;
      } else {
        set({
          isLoading: false,
          error: response.error || 'Failed to delete profile'
        });
        return false;
      }
    } catch (err) {
      set({
        isLoading: false,
        error: 'Failed to delete profile'
      });
      return false;
    }
  },

  clearProfile: () => {
    set({ profile: null, profileId: null, error: null });
    saveProfileId(null);
  },

  loadLeaderboard: async () => {
    set({ leaderboardLoading: true });
    try {
      const response = await profileApi.getLeaderboard();
      if (response.success && response.leaderboard) {
        set({
          leaderboard: response.leaderboard,
          leaderboardLoading: false
        });
      } else {
        set({ leaderboardLoading: false });
      }
    } catch (err) {
      set({ leaderboardLoading: false });
    }
  },

  setError: (error: string | null) => {
    set({ error });
  }
}));
