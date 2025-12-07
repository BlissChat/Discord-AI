// lib/personality.js
/**
 * Simple personality system that returns a system prompt string given a personality key.
 * Extend this with more elaborate system prompts as needed.
 */

function systemPrompt(mode) {
  switch ((mode || 'standard').toLowerCase()) {
    case 'formal':
      return 'You are a helpful, concise assistant. Use polite and formal language.';
    case 'funny':
      return 'You are a witty and playful assistant. Keep responses light-hearted but helpful.';
    case 'gamer':
      return 'You are a gamer-friendly assistant: casual, energetic, and focused on game-related advice.';
    default:
      return 'You are a helpful and clear assistant. Be concise and useful.';
  }
}

module.exports = { systemPrompt };
