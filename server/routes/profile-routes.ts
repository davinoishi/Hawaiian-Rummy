/**
 * Hawaiian Rummy - Profile API Routes
 * REST endpoints for profile and leaderboard management
 */

import { Router, Request, Response } from 'express';
import { profileManager } from '../profile-manager.js';
import { gameManager } from '../game-manager.js';
import type {
  CreateProfileRequest,
  CreateProfileResponse,
  UpdateProfileRequest,
  ProfileResponse
} from '../../shared/profile-types.js';

const router = Router();

// Type helpers for route params
interface IdParam { id: string }
interface RankParams { profileId: string; category: string }

// ===== PROFILE ENDPOINTS =====

/**
 * Create a new profile
 * POST /api/profile
 * Body: { nickname: string }
 */
router.post('/profile', (req: Request, res: Response) => {
  try {
    const { nickname } = req.body as CreateProfileRequest;

    if (!nickname || typeof nickname !== 'string') {
      const response: CreateProfileResponse = {
        success: false,
        error: 'Nickname is required'
      };
      return res.status(400).json(response);
    }

    const trimmedNickname = nickname.trim();
    if (trimmedNickname.length < 1 || trimmedNickname.length > 30) {
      const response: CreateProfileResponse = {
        success: false,
        error: 'Nickname must be between 1 and 30 characters'
      };
      return res.status(400).json(response);
    }

    const profile = profileManager.createProfile(trimmedNickname);
    const response: CreateProfileResponse = {
      success: true,
      profile,
      profileUrl: `/p/${profile.id}`
    };

    return res.status(201).json(response);
  } catch (err) {
    console.error('Error creating profile:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get a profile by ID
 * GET /api/profile/:id
 */
router.get('/profile/:id', (req: Request<IdParam>, res: Response) => {
  try {
    const id = req.params.id;

    const profile = profileManager.getProfile(id);
    if (!profile) {
      const response: ProfileResponse = {
        success: false,
        error: 'Profile not found'
      };
      return res.status(404).json(response);
    }

    const response: ProfileResponse = {
      success: true,
      profile
    };

    return res.json(response);
  } catch (err) {
    console.error('Error getting profile:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Update a profile
 * PUT /api/profile/:id
 * Body: { nickname: string }
 */
router.put('/profile/:id', (req: Request<IdParam>, res: Response) => {
  try {
    const id = req.params.id;
    const { nickname } = req.body as UpdateProfileRequest;

    // Check if profile exists
    if (!profileManager.profileExists(id)) {
      const response: ProfileResponse = {
        success: false,
        error: 'Profile not found'
      };
      return res.status(404).json(response);
    }

    // Validate nickname if provided
    if (nickname !== undefined) {
      if (typeof nickname !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Invalid nickname'
        });
      }

      const trimmedNickname = nickname.trim();
      if (trimmedNickname.length < 1 || trimmedNickname.length > 30) {
        return res.status(400).json({
          success: false,
          error: 'Nickname must be between 1 and 30 characters'
        });
      }
    }

    const profile = profileManager.updateProfile(id, { nickname: nickname?.trim() });
    if (!profile) {
      return res.status(400).json({
        success: false,
        error: 'Cannot update AI profile'
      });
    }

    const response: ProfileResponse = {
      success: true,
      profile
    };

    return res.json(response);
  } catch (err) {
    console.error('Error updating profile:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Delete a profile
 * DELETE /api/profile/:id
 */
router.delete('/profile/:id', (req: Request<IdParam>, res: Response) => {
  try {
    const id = req.params.id;

    if (!profileManager.profileExists(id)) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    const deleted = profileManager.deleteProfile(id);
    if (!deleted) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete AI profile'
      });
    }

    return res.json({
      success: true
    });
  } catch (err) {
    console.error('Error deleting profile:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ===== LEADERBOARD ENDPOINTS =====

/**
 * Get leaderboard
 * GET /api/leaderboard
 */
router.get('/leaderboard', (req: Request, res: Response) => {
  try {
    const leaderboard = profileManager.getLeaderboard();
    return res.json({
      success: true,
      leaderboard
    });
  } catch (err) {
    console.error('Error getting leaderboard:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get player's rank in a specific category
 * GET /api/leaderboard/rank/:profileId/:category
 */
router.get('/leaderboard/rank/:profileId/:category', (req: Request<RankParams>, res: Response) => {
  try {
    const profileId = req.params.profileId;
    const category = req.params.category;

    const validCategories = [
      'mostGamesPlayed',
      'mostGamesWon',
      'highestWinRate',
      'mostGoingOut',
      'lowestGameScore',
      'highestGameScore',
      'longestWinStreak'
    ];

    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category'
      });
    }

    const rank = profileManager.getPlayerRank(profileId, category as any);
    if (rank === null) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found or no rank available'
      });
    }

    return res.json({
      success: true,
      rank,
      category
    });
  } catch (err) {
    console.error('Error getting player rank:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ===== DASHBOARD ENDPOINT =====

/**
 * Get server dashboard stats
 * GET /api/dashboard
 */
router.get('/dashboard', (req: Request, res: Response) => {
  try {
    const gamesInProgress = gameManager.getAllRooms().filter(r => r.state.gameStarted).length;
    const dashboard = profileManager.getDashboard(gamesInProgress);

    return res.json({
      success: true,
      dashboard
    });
  } catch (err) {
    console.error('Error getting dashboard:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
