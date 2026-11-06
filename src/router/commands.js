/**
 * Game commands:
 *   game.start           { seed?, difficulty? }   start a new session (3 attempts)
 *   game.replaySession   {}                        same track and difficulty, attempts cleared
 *   game.finishAttempt   { distance, coins }       record one attempt, returns the session summary
 *   game.saveCoins       { coins }                 add coins to the saved balance
 *   game.saveHighScore   { score, distance, coins, name? }
 * Session, profile and high-score store are injected, so the router can be tested with fakes.
 */
import { createDispatcher, ValidationError } from './dispatcher.js';
import { DIFFICULTY_NAMES } from '../game/run.js';

const isCount = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

export function createGameCommands({ session, profile, highScores }) {
  const dispatcher = createDispatcher();

  dispatcher.register('game.start', (p) => {
    if (p.seed !== undefined && !isCount(p.seed, 2147483647)) {
      throw new ValidationError('seed must be an integer from 0 to 2147483647');
    }
    if (p.difficulty !== undefined && !DIFFICULTY_NAMES.includes(p.difficulty)) {
      throw new ValidationError(`difficulty must be one of ${DIFFICULTY_NAMES.join(', ')}`);
    }
    return session.start({ seed: p.seed, difficulty: p.difficulty });
  });

  dispatcher.register('game.replaySession', () => session.replay());

  dispatcher.register('game.finishAttempt', (p) => {
    if (!isCount(p.distance, 1_000_000)) throw new ValidationError('distance must be an integer from 0 to 1000000');
    if (!isCount(p.coins, 1_000_000)) throw new ValidationError('coins must be an integer from 0 to 1000000');
    try {
      return session.finishAttempt({ distance: p.distance, coins: p.coins });
    } catch (err) {
      throw new ValidationError(err.message);
    }
  });

  dispatcher.register('game.saveCoins', (p) => {
    if (!isCount(p.coins, 1_000_000)) throw new ValidationError('coins must be an integer from 0 to 1000000');
    return profile.addCoins(p.coins);
  });

  dispatcher.register('game.saveHighScore', (p) => {
    if (!isCount(p.score, 100_000_000)) throw new ValidationError('score must be an integer from 0 to 100000000');
    if (!isCount(p.distance, 1_000_000)) throw new ValidationError('distance must be an integer from 0 to 1000000');
    if (!isCount(p.coins ?? 0, 1_000_000)) throw new ValidationError('coins must be an integer from 0 to 1000000');
    let name = 'PLAYER';
    if (p.name !== undefined) {
      if (typeof p.name !== 'string') throw new ValidationError('name must be a string');
      name = p.name.trim().slice(0, 12) || 'PLAYER';
    }
    return highScores.add({ name, score: p.score, distance: p.distance, coins: p.coins ?? 0 });
  });

  return dispatcher;
}
