/**
 * Re-export AI strategy types from shared folder
 * Server uses the same AI strategy interface as client for offline play
 */

export {
  AIStrategy,
  DrawDecision,
  MeldDecision,
  LayoffDecision,
  DiscardDecision,
  BuyDecision,
  AIContext,
  createAIContext
} from '../../shared/ai/ai-strategy';
