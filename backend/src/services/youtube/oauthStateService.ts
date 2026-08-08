import { randomBytes } from "node:crypto";
import { redisClient } from "../../config/redis/redisCaching";

const OAUTH_STATE_TTL_SECONDS = 600;
const OAUTH_STATE_PREFIX = "youtube:oauth:state:";

function stateKey(state: string): string {
  return `${OAUTH_STATE_PREFIX}${state}`;
}

export async function createYouTubeOAuthState(userId: string): Promise<string> {
  const state = randomBytes(32).toString("base64url");
  const created = await redisClient.set(
    stateKey(state),
    JSON.stringify({ userId }),
    { EX: OAUTH_STATE_TTL_SECONDS, NX: true },
  );

  if (created !== "OK") {
    throw new Error("Could not create OAuth state");
  }

  return state;
}

export async function consumeYouTubeOAuthState(
  state: string,
): Promise<{ userId: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) {
    return null;
  }

  const stored = await redisClient.getDel(stateKey(state));
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as { userId?: unknown };
    return typeof parsed.userId === "string" && parsed.userId.length > 0
      ? { userId: parsed.userId }
      : null;
  } catch {
    return null;
  }
}
