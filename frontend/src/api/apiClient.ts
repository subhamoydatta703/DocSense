import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  timeout: 120_000,
});

let getTokenFn: (() => Promise<string | null>) | null = null;

/**
 * Registers the Clerk JWT getter function for automatic HTTP Authorization header injection.
 */
export const setAuthTokenGetter = (fn: (() => Promise<string | null>) | null) => {
  getTokenFn = fn;
};

api.interceptors.request.use(async (config) => {
  if (getTokenFn) {
    const token = await getTokenFn();
    if (!token) throw new Error("Your session has expired. Please sign in again.");
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const issues: unknown = error.response?.data?.errors;
    if (Array.isArray(issues)) {
      const messages = issues.flatMap(issue => typeof issue === 'object' && issue !== null && 'message' in issue && typeof issue.message === 'string' ? [issue.message] : []);
      if (messages.length) return messages.join(', ');
    }
    const message = error.response?.data?.message;
    if (typeof message === "string") return message;
    if (error.code === "ECONNABORTED") return "The request timed out. Please try again shortly.";
    if (!error.response) return "Unable to reach the server. Please try again shortly.";
  }
  return error instanceof Error ? error.message : fallback;
}

export function getApiErrorDetails(error: unknown): { status?: number; stage?: string; retryAfterSeconds?: number } {
  if (!axios.isAxiosError(error)) return {};
  const stage = error.response?.data?.stage;
  const header = error.response?.headers['retry-after'];
  const seconds = Number(header ?? error.response?.data?.retryAfterSeconds);
  return {
    status: error.response?.status,
    stage: typeof stage === 'string' ? stage : undefined,
    retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.ceil(seconds), 3600) : undefined,
  };
}
