/**
 * Shared AI - Re-exports for client and server use
 */

export type {
  AIStrategy,
  DrawDecision,
  MeldDecision,
  LayoffDecision,
  DiscardDecision,
  BuyDecision,
  AIContext
} from './ai-strategy';

export { createAIContext } from './ai-strategy';

export { StandardAIStrategy } from './standard-ai';

export type {
  AIPersonality,
  RoundStrategy
} from './ai-personalities';

export {
  AI_PERSONALITIES,
  ROUND_STRATEGIES,
  getRoundStrategy,
  getPersonality,
  getRandomPersonality
} from './ai-personalities';
