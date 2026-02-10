/**
 * Profile API Service
 * Handles all profile and leaderboard API calls
 */

import type {
  PlayerProfile,
  CreateProfileResponse,
  ProfileResponse,
  Leaderboard,
  ServerDashboard
} from '@shared/profile-types';

const API_BASE = '/api';

/**
 * Create a new profile
 */
export async function createProfile(nickname: string): Promise<CreateProfileResponse> {
  const response = await fetch(`${API_BASE}/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname })
  });
  return response.json();
}

/**
 * Get a profile by ID
 */
export async function getProfile(id: string): Promise<ProfileResponse> {
  const response = await fetch(`${API_BASE}/profile/${id}`);
  return response.json();
}

/**
 * Update a profile's nickname
 */
export async function updateProfile(id: string, nickname: string): Promise<ProfileResponse> {
  const response = await fetch(`${API_BASE}/profile/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname })
  });
  return response.json();
}

/**
 * Delete a profile
 */
export async function deleteProfile(id: string): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(`${API_BASE}/profile/${id}`, {
    method: 'DELETE'
  });
  return response.json();
}

/**
 * Get the leaderboard
 */
export async function getLeaderboard(): Promise<{ success: boolean; leaderboard?: Leaderboard; error?: string }> {
  const response = await fetch(`${API_BASE}/leaderboard`);
  return response.json();
}

/**
 * Get server dashboard stats
 */
export async function getDashboard(): Promise<{ success: boolean; dashboard?: ServerDashboard; error?: string }> {
  const response = await fetch(`${API_BASE}/dashboard`);
  return response.json();
}

/**
 * Get player's rank in a category
 */
export async function getPlayerRank(
  profileId: string,
  category: string
): Promise<{ success: boolean; rank?: number; error?: string }> {
  const response = await fetch(`${API_BASE}/leaderboard/rank/${profileId}/${category}`);
  return response.json();
}
