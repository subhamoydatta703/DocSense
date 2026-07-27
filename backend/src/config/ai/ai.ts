import { GoogleGenAI } from "@google/genai";

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const aiQueryOptimization = new GoogleGenAI({ apiKey: process.env.GEMINI_QUERY_API_KEY });

export const aiGuard = new GoogleGenAI({ apiKey: process.env.GEMINI_GUARD_API_KEY });

export const aiEmbedding = new GoogleGenAI({ apiKey: process.env.GEMINI_EMBEDDING_API_KEY });

