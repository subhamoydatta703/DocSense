import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { redisClient } from "../../config/redis/redisCaching";
import { getGoogleOAuthConfig, getGoogleTokenUrl } from "../../config/youtube/googleOAuth";

const TOKEN_PREFIX = "youtube:oauth:tokens:";

export interface GoogleOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
  tokenType?: string;
}

function getEncryptionKey(): Buffer {
  const encodedKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encodedKey) {
    throw new Error("Missing required environment variable: GOOGLE_TOKEN_ENCRYPTION_KEY");
  }

  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}

function encrypt(value: GoogleOAuthTokens): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value: string): GoogleOAuthTokens {
  const [ivEncoded, authTagEncoded, encryptedEncoded] = value.split(".");
  if (!ivEncoded || !authTagEncoded || !encryptedEncoded) {
    throw new Error("Invalid encrypted YouTube OAuth token format");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivEncoded, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagEncoded, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(decrypted) as GoogleOAuthTokens;
}

export async function saveGoogleOAuthTokens(
  userId: string,
  tokens: GoogleOAuthTokens,
): Promise<void> {
  await redisClient.set(`${TOKEN_PREFIX}${userId}`, encrypt(tokens));
}

export async function getGoogleOAuthTokens(
  userId: string,
): Promise<GoogleOAuthTokens | null> {
  const stored = await redisClient.get(`${TOKEN_PREFIX}${userId}`);
  return stored ? decrypt(stored) : null;
}

export async function deleteGoogleOAuthTokens(userId: string): Promise<void> {
  await redisClient.del(`${TOKEN_PREFIX}${userId}`);
}

export async function getValidGoogleAccessToken(userId: string): Promise<string | null> {
  const tokens = await getGoogleOAuthTokens(userId);
  if (!tokens) {
    return null;
  }

  if (tokens.expiresAt > Date.now() + 60_000) {
    return tokens.accessToken;
  }

  const config = getGoogleOAuthConfig();
  const response = await fetch(getGoogleTokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    console.error("Google OAuth token refresh failed with status", response.status);
    throw new Error("YouTube authorization has expired or been revoked");
  }

  const payload = await response.json() as {
    access_token?: unknown;
    expires_in?: unknown;
    scope?: unknown;
    token_type?: unknown;
  };

  if (typeof payload.access_token !== "string" || typeof payload.expires_in !== "number") {
    throw new Error("Google returned an invalid refreshed access token");
  }

  const refreshedTokens: GoogleOAuthTokens = {
    accessToken: payload.access_token,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + payload.expires_in * 1000,
    scope: typeof payload.scope === "string" ? payload.scope : tokens.scope,
    tokenType: typeof payload.token_type === "string" ? payload.token_type : tokens.tokenType,
  };

  await saveGoogleOAuthTokens(userId, refreshedTokens);
  return refreshedTokens.accessToken;
}
