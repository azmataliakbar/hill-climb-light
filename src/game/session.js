/**
 * A session is a set of up to three attempts on the same track (same seed and difficulty).
 * Scoring: distance in metres + COIN_POINTS per coin. The session total is the sum of the attempts.
 * Pure functions: the controller at the bottom only holds the current session.
 */
export const MAX_ATTEMPTS = 3;
export const COIN_POINTS = 10;

export function attemptScore({ distance, coins }) {
  return distance + coins * COIN_POINTS;
}

export function createSession({ seed, difficulty = 'easy' }) {
  return { seed, difficulty, attempts: [] };
}

/** Returns a new session with one more attempt recorded. Throws when the session is already over. */
export function recordAttempt(session, { distance, coins }) {
  if (session.attempts.length >= MAX_ATTEMPTS) throw new RangeError('Session already has three attempts');
  const attempt = {
    n: session.attempts.length + 1,
    distance,
    coins,
    score: attemptScore({ distance, coins }),
  };
  return { ...session, attempts: [...session.attempts, attempt] };
}

export function summarise(session) {
  const attempts = session.attempts;
  const total = attempts.reduce((sum, a) => sum + a.score, 0);
  const best = attempts.reduce((b, a) => (a.score > b.score ? a : b), attempts[0] ?? null);
  return {
    attempts,
    total,
    best,
    totalCoins: attempts.reduce((sum, a) => sum + a.coins, 0),
    bestDistance: attempts.reduce((m, a) => Math.max(m, a.distance), 0),
    over: attempts.length >= MAX_ATTEMPTS,
    remaining: MAX_ATTEMPTS - attempts.length,
  };
}

/** Holds the current session. The seed is fixed for the session, so every attempt is the same track. */
export function createSessionController(makeSeed) {
  let session = null;
  return {
    get current() {
      return session;
    },
    start({ seed, difficulty } = {}) {
      session = createSession({ seed: seed ?? makeSeed(), difficulty: difficulty ?? 'easy' });
      return session;
    },
    /** Same track and difficulty, attempts cleared. */
    replay() {
      if (!session) throw new RangeError('No session to replay');
      session = createSession({ seed: session.seed, difficulty: session.difficulty });
      return session;
    },
    finishAttempt({ distance, coins }) {
      if (!session) throw new RangeError('No session in progress');
      session = recordAttempt(session, { distance, coins });
      return summarise(session);
    },
  };
}
