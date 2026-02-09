/**
 * Hawaiian Rummy - Round Requirements Validation
 * Pure functions for checking if melds meet round requirements
 */

import { Meld, RoundRequirement, PlayerState } from '../types';
import { ROUND_REQUIREMENTS } from '../constants';

/**
 * Check if a player's melds match the requirements for a round
 *
 * @param melds - Player's current melds
 * @param round - Current round number (0-indexed)
 * @returns True if requirements are met
 */
export function checkMeldsMatchRequirements(melds: Meld[], round: number): boolean {
  const req = getRoundRequirement(round);
  if (!req) {
    return false;
  }

  const sets = melds.filter(m => m.type === 'set');
  const runs = melds.filter(m => m.type === 'run');

  // Check count of sets and runs
  if (sets.length !== req.sets || runs.length !== req.runs) {
    return false;
  }

  // Check set sizes
  for (let i = 0; i < req.setSizes.length; i++) {
    if (!sets[i] || sets[i].cards.length < req.setSizes[i]) {
      return false;
    }
  }

  // Check run sizes
  for (let i = 0; i < req.runSizes.length; i++) {
    if (!runs[i] || runs[i].cards.length < req.runSizes[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Get the requirement for a specific round
 *
 * @param round - Round number (0-indexed)
 * @returns The round requirement or undefined
 */
export function getRoundRequirement(round: number): RoundRequirement | undefined {
  return ROUND_REQUIREMENTS[round];
}

/**
 * Get the maximum buys allowed for a round
 *
 * @param round - Round number (0-indexed)
 * @returns Maximum buys allowed
 */
export function getMaxBuysForRound(round: number): number {
  const req = getRoundRequirement(round);
  return req ? req.maxBuys : 3;
}

/**
 * Get the human-readable description for a round
 *
 * @param round - Round number (0-indexed)
 * @returns Description string
 */
export function getRoundDescription(round: number): string {
  const req = getRoundRequirement(round);
  return req ? req.description : '';
}

/**
 * Get the total cards needed for a round's requirements
 *
 * @param round - Round number (0-indexed)
 * @returns Total cards needed
 */
export function getTotalCardsForRound(round: number): number {
  const req = getRoundRequirement(round);
  return req ? req.totalCards : 0;
}

/**
 * Calculate how many more melds of each type are needed
 *
 * @param melds - Current melds
 * @param round - Round number
 * @returns Object with sets and runs still needed
 */
export function getMeldsNeeded(melds: Meld[], round: number): { setsNeeded: number; runsNeeded: number } {
  const req = getRoundRequirement(round);
  if (!req) {
    return { setsNeeded: 0, runsNeeded: 0 };
  }

  const currentSets = melds.filter(m => m.type === 'set').length;
  const currentRuns = melds.filter(m => m.type === 'run').length;

  return {
    setsNeeded: Math.max(0, req.sets - currentSets),
    runsNeeded: Math.max(0, req.runs - currentRuns)
  };
}

/**
 * Check if creating another meld of a type is allowed for this round
 *
 * @param melds - Current melds
 * @param meldType - Type of meld to create
 * @param round - Round number
 * @returns Error message if not allowed, undefined if allowed
 */
export function canCreateMeldOfType(
  melds: Meld[],
  meldType: 'set' | 'run',
  round: number
): string | undefined {
  const req = getRoundRequirement(round);
  if (!req) {
    return 'Invalid round';
  }

  if (meldType === 'set') {
    const currentSets = melds.filter(m => m.type === 'set').length;
    if (currentSets >= req.sets) {
      return `Round ${round + 1} only requires ${req.sets} set(s)`;
    }
  } else {
    const currentRuns = melds.filter(m => m.type === 'run').length;
    if (currentRuns >= req.runs) {
      return `Round ${round + 1} only requires ${req.runs} run(s)`;
    }
  }

  return undefined;
}

/**
 * Get the next required meld size for a type
 *
 * @param melds - Current melds
 * @param meldType - Type of meld
 * @param round - Round number
 * @returns Required size for the next meld of that type, or undefined if no more needed
 */
export function getNextRequiredMeldSize(
  melds: Meld[],
  meldType: 'set' | 'run',
  round: number
): number | undefined {
  const req = getRoundRequirement(round);
  if (!req) {
    return undefined;
  }

  if (meldType === 'set') {
    const currentSets = melds.filter(m => m.type === 'set').length;
    if (currentSets < req.setSizes.length) {
      return req.setSizes[currentSets];
    }
  } else {
    const currentRuns = melds.filter(m => m.type === 'run').length;
    if (currentRuns < req.runSizes.length) {
      return req.runSizes[currentRuns];
    }
  }

  return undefined;
}

/**
 * Calculate progress towards meeting round requirements
 *
 * @param melds - Current melds
 * @param round - Round number
 * @returns Progress object with current counts and totals
 */
export function getRequirementsProgress(
  melds: Meld[],
  round: number
): {
  sets: { current: number; required: number };
  runs: { current: number; required: number };
  percentComplete: number;
} {
  const req = getRoundRequirement(round);
  if (!req) {
    return {
      sets: { current: 0, required: 0 },
      runs: { current: 0, required: 0 },
      percentComplete: 0
    };
  }

  const currentSets = melds.filter(m => m.type === 'set').length;
  const currentRuns = melds.filter(m => m.type === 'run').length;

  const totalRequired = req.sets + req.runs;
  const totalCurrent = Math.min(currentSets, req.sets) + Math.min(currentRuns, req.runs);
  const percentComplete = totalRequired > 0 ? (totalCurrent / totalRequired) * 100 : 100;

  return {
    sets: { current: currentSets, required: req.sets },
    runs: { current: currentRuns, required: req.runs },
    percentComplete
  };
}

/**
 * Validate meld size against round requirements
 *
 * @param meldCards - Cards in the meld
 * @param meldType - Type of meld
 * @param melds - Existing melds
 * @param round - Round number
 * @returns Error message if size is insufficient, undefined if OK
 */
export function validateMeldSize(
  meldCards: number,
  meldType: 'set' | 'run',
  melds: Meld[],
  round: number
): string | undefined {
  const requiredSize = getNextRequiredMeldSize(melds, meldType, round);

  if (requiredSize !== undefined && meldCards < requiredSize) {
    return `This ${meldType} needs at least ${requiredSize} cards for Round ${round + 1}`;
  }

  return undefined;
}
