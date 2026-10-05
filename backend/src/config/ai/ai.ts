import { GoogleGenAI } from "@google/genai";
const httpOptions = { timeout: 35_000, retryOptions: { attempts: 2 } };

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions });

export const aiQueryOptimization = new GoogleGenAI({ apiKey: process.env.GEMINI_QUERY_API_KEY || process.env.GEMINI_API_KEY, httpOptions });

export const aiGuard = new GoogleGenAI({ apiKey: process.env.GEMINI_GUARD_API_KEY || process.env.GEMINI_API_KEY, httpOptions });

export const aiEmbedding = new GoogleGenAI({ apiKey: process.env.GEMINI_EMBEDDING_API_KEY || process.env.GEMINI_API_KEY, httpOptions });

