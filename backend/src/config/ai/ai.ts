import { GoogleGenAI } from "@google/genai";
// The SDK retry path discards HTTP status and response details. Retry explicitly
// where needed so callers retain ApiError.status and can honor cancellation.
const httpOptions = { timeout: 35_000 };

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions });

export const aiQueryOptimization = new GoogleGenAI({ apiKey: process.env.GEMINI_QUERY_API_KEY || process.env.GEMINI_API_KEY, httpOptions });

export const aiGuard = new GoogleGenAI({ apiKey: process.env.GEMINI_GUARD_API_KEY || process.env.GEMINI_API_KEY, httpOptions });

export const aiEmbedding = new GoogleGenAI({ apiKey: process.env.GEMINI_EMBEDDING_API_KEY || process.env.GEMINI_API_KEY, httpOptions });

