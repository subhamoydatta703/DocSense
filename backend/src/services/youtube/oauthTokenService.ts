import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { redisClient } from "../../config/redis/redisCaching";

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
