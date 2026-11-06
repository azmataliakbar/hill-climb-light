/**
 * The three game commands: game.start, game.saveCoins, game.saveHighScore.
 * Session, profile, and high-score store are injected, so the router can be tested with fakes.
 */
import { createDispatcher, ValidationError } from './dispatcher.js';

const isCount = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

export function createGameCommands({ session, profile, highScores }) {
  const dispatcher = createDispatcher();

  dispatcher.register('game.start', (p) => {
    if (p.seed !== undefined && !isCount(p.seed, 2147483647)) {
      throw new ValidationError('seed must be an integer from 0 to 2147483647');
    }
    return session.start({ seed: p.seed });
  });

  dispatcher.register('game.saveCoins', (p) => {
    if (!isCount(p.coins, 1_000_000)) throw new ValidationError('coins must be an integer from 0 to 1000000');
    return profile.addCoins(p.coins);
  });

  dispatcher.register('game.saveHighScore', (p) => {
    if (!isCount(p.distance, 1_000_000)) throw new ValidationError('distance must be an integer from 0 to 1000000');
    if (!isCount(p.coins ?? 0, 1_000_000)) throw new ValidationError('coins must be an integer from 0 to 1000000');
    let name = 'PLAYER';
    if (p.name !== undefined) {
      if (typeof p.name !== 'string') throw new ValidationError('name must be a string');
      name = p.name.trim().slice(0, 12) || 'PLAYER';
    }
    return highScores.add({ name, distance: p.distance, coins: p.coins ?? 0 });
  });

  return dispatcher;
}
