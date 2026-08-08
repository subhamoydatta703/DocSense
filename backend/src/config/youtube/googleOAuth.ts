const DEFAULT_YOUTUBE_OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getGoogleOAuthConfig() {
  const scopes = (process.env.GOOGLE_OAUTH_SCOPES || DEFAULT_YOUTUBE_OAUTH_SCOPE)
    .split(/[ ,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return {
    clientId: getRequiredEnv("GOOGLE_CLIENT_ID"),
    clientSecret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: getRequiredEnv("GOOGLE_REDIRECT_URI"),
    scopes,
  };
}

export function buildGoogleAuthorizationUrl(state: string): string {
  const config = getGoogleOAuthConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: config.scopes.join(" "),
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function getGoogleTokenUrl(): string {
  return "https://oauth2.googleapis.com/token";
}
